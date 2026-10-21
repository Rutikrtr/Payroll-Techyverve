-- GPS on every QR scan, with an optional geofence per branch.

alter table public.branches
  add column lat double precision,
  add column lng double precision,
  add column radius_m integer not null default 200,
  add constraint branches_geo_pair check ((lat is null) = (lng is null)),
  add constraint branches_lat_range check (lat between -90 and 90),
  add constraint branches_lng_range check (lng between -180 and 180),
  add constraint branches_radius_range check (radius_m between 25 and 5000);

alter table public.attendance
  add column in_lat double precision, add column in_lng double precision, add column in_acc real,
  add column out_lat double precision, add column out_lng double precision, add column out_acc real;

-- Great-circle distance in metres.
create or replace function public.geo_distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = public as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

drop function public.scan_attendance(uuid, text);

create function public.scan_attendance(p_branch uuid, p_token text, p_lat double precision, p_lng double precision, p_acc real)
returns json language plpgsql volatile security definer set search_path = public as $$
declare
  e employees; b branches; s firm_settings; a attendance;
  d date := local_today();
  t time := date_trunc('minute', (now() at time zone 'Asia/Kolkata'))::time;
  late boolean; hrs numeric; short boolean; dist double precision;
begin
  select emp.* into e from profiles p join employees emp on emp.id = p.employee_id
  where p.id = auth.uid() and p.role = 'employee';
  if not found then raise exception 'Only employee accounts can scan attendance.'; end if;
  if e.status <> 'active' then raise exception 'Your employee account is inactive. Contact HR.'; end if;
  if not exists (select 1 from firms where id = e.firm_id and status = 'active') then raise exception 'This workspace is suspended.'; end if;

  select * into b from branches where id = p_branch;
  if not found or b.firm_id <> e.firm_id then raise exception 'This QR code does not belong to your company.'; end if;
  if e.branch_id is distinct from b.id then raise exception 'This is the % branch QR. Please scan the QR at your own branch.', b.name; end if;
  if p_token is distinct from branch_token(b, d) then raise exception 'This QR code has expired. Scan today''s code at the branch.'; end if;

  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Location is required. Turn on location and allow it for this site, then scan again.';
  end if;
  if b.lat is not null then
    dist := geo_distance_m(b.lat, b.lng, p_lat, p_lng);
    -- Allow for GPS error, capped so a vague fix can't stretch the fence.
    if dist > b.radius_m + least(coalesce(p_acc, 0), 100) then
      raise exception 'You are % away from the % branch. Scan the QR at the branch.',
        case when dist >= 1000 then round((dist / 1000)::numeric, 1) || ' km' else round(dist::numeric) || ' m' end, b.name;
    end if;
  end if;

  select * into s from firm_settings where firm_id = e.firm_id;
  select * into a from attendance where employee_id = e.id and date = d;

  if not found then
    late := t > s.shift_start + make_interval(mins => s.late_grace_minutes);
    insert into attendance (firm_id, employee_id, date, status, check_in, is_late, in_lat, in_lng, in_acc)
    values (e.firm_id, e.id, d, 'present', t, late, p_lat, p_lng, p_acc);
    return json_build_object('action', 'check_in', 'time', t, 'late', late, 'branch', b.name, 'distance_m', round(dist::numeric));
  end if;

  if a.check_out is not null then
    raise exception 'You already checked out today at %.', to_char(a.check_out, 'HH12:MI AM');
  end if;
  if a.check_in is null or a.status not in ('present', 'half_day') then
    raise exception 'Today is marked as "%" by HR. Contact HR to change it.', replace(a.status, '_', ' ');
  end if;
  if t - a.check_in < interval '5 minutes' then
    raise exception 'You checked in at %. Check-out opens 5 minutes later.', to_char(a.check_in, 'HH12:MI AM');
  end if;

  hrs := round((extract(epoch from (t - a.check_in)) / 3600)::numeric, 2);
  short := a.status = 'present' and hrs < s.half_day_min_hours;
  update attendance set check_out = t, status = case when short then 'half_day' else status end,
    out_lat = p_lat, out_lng = p_lng, out_acc = p_acc, updated_at = now()
  where id = a.id;
  return json_build_object('action', 'check_out', 'time', t, 'hours', hrs, 'half_day', short, 'branch', b.name, 'distance_m', round(dist::numeric));
end $$;

revoke execute on function public.scan_attendance(uuid, text, double precision, double precision, real) from public, anon;
grant execute on function public.scan_attendance(uuid, text, double precision, double precision, real) to authenticated;

-- Kiosk register: add distance from the branch for each scan (null when the branch has no location).
create or replace function public.branch_overview(p_date date default null) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  pr profiles; b branches; f firms;
  d date := coalesce(p_date, local_today());
begin
  select * into pr from profiles where id = auth.uid() and role = 'branch';
  if not found then raise exception 'Not a branch account'; end if;
  select * into b from branches where id = pr.branch_id;
  select * into f from firms where id = b.firm_id and status = 'active';
  if not found then raise exception 'This workspace is suspended'; end if;
  if d > local_today() then d := local_today(); end if;

  return json_build_object(
    'firm', json_build_object('name', f.name, 'legal_name', f.legal_name, 'address', f.address, 'city', f.city,
      'state', f.state, 'pincode', f.pincode, 'phone', f.contact_phone, 'email', f.contact_email, 'logo_url', f.logo_url),
    'branch', json_build_object('id', b.id, 'name', b.name, 'address', b.address, 'geofenced', b.lat is not null, 'radius_m', b.radius_m),
    'date', d, 'today', local_today(),
    'token', case when d = local_today() then branch_token(b, d) end,
    'rows', coalesce((
      select json_agg(json_build_object('emp_code', e.emp_code, 'full_name', e.full_name, 'designation', e.designation,
        'status', a.status, 'check_in', a.check_in, 'check_out', a.check_out, 'is_late', coalesce(a.is_late, false),
        'in_dist', case when b.lat is not null and a.in_lat is not null then round(geo_distance_m(b.lat, b.lng, a.in_lat, a.in_lng)::numeric) end,
        'out_dist', case when b.lat is not null and a.out_lat is not null then round(geo_distance_m(b.lat, b.lng, a.out_lat, a.out_lng)::numeric) end
      ) order by e.emp_code)
      from employees e left join attendance a on a.employee_id = e.id and a.date = d
      where e.branch_id = b.id and e.status = 'active'
        and (e.date_of_joining is null or e.date_of_joining <= d)), '[]'::json)
  );
end $$;
