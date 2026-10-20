-- Multi-branch firms, branch kiosks with a daily QR, and employee self-service logins.

-- ───────────── Cleanup: columns nothing reads ─────────────
alter table public.firm_settings drop column slip_show_ytd, drop column currency;

-- ───────────── Firms: login code + branch mode ─────────────
alter table public.firms add column code text, add column multi_branch boolean not null default false;
update public.firms set code = left(regexp_replace(lower(name), '[^a-z0-9]', '', 'g'), 12) where code is null;
alter table public.firms
  alter column code set not null,
  add constraint firms_code_format check (code ~ '^[a-z0-9]{2,12}$'),
  add constraint firms_code_key unique (code);

-- ───────────── Branches ─────────────
create table public.branches (
  id         uuid primary key default gen_random_uuid(),
  firm_id    uuid not null references public.firms(id) on delete cascade,
  name       text not null,
  address    text,
  qr_secret  bytea not null default extensions.gen_random_bytes(32),
  created_at timestamptz not null default now(),
  unique (firm_id, name)
);
create index on public.branches(firm_id);

alter table public.employees add column branch_id uuid references public.branches(id) on delete set null;
create index on public.employees(branch_id);

-- ───────────── Profiles: branch + employee roles ─────────────
alter table public.profiles drop constraint hr_has_firm, drop constraint profiles_role_check;
alter table public.profiles
  add column branch_id   uuid references public.branches(id) on delete cascade,
  add column employee_id uuid unique references public.employees(id) on delete cascade,
  add column login_id    text unique,
  add constraint profiles_role_check check (role in ('superadmin','hr','branch','employee')),
  add constraint profiles_scope check (
    (role = 'superadmin' and firm_id is null     and branch_id is null     and employee_id is null) or
    (role = 'hr'         and firm_id is not null and branch_id is null     and employee_id is null) or
    (role = 'branch'     and firm_id is not null and branch_id is not null and employee_id is null and login_id is not null) or
    (role = 'employee'   and firm_id is not null and branch_id is null     and employee_id is not null and login_id is not null)
  );
create index on public.profiles(firm_id);

-- ───────────── Helpers ─────────────
-- HR only (tenant write access). Branch/employee accounts must never match this.
create or replace function public.my_firm_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.firm_id from profiles p join firms f on f.id = p.firm_id
  where p.id = auth.uid() and p.role = 'hr' and f.status = 'active';
$$;

-- Firm of a branch or employee account (read-only company info).
create or replace function public.my_member_firm_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.firm_id from profiles p join firms f on f.id = p.firm_id
  where p.id = auth.uid() and p.role in ('branch','employee') and f.status = 'active';
$$;

create or replace function public.my_employee_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.employee_id from profiles p
  join employees e on e.id = p.employee_id
  join firms f on f.id = p.firm_id
  where p.id = auth.uid() and p.role = 'employee' and e.status = 'active' and f.status = 'active';
$$;

create or replace function public.local_today() returns date
language sql stable set search_path = public as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- Daily QR token: HMAC of branch + date with the branch secret. Changes every day, cannot be forged.
create or replace function public.branch_token(b public.branches, d date) returns text
language sql immutable set search_path = public as $$
  select left(encode(extensions.hmac(convert_to(b.id::text || ':' || d::text, 'utf8'), b.qr_secret, 'sha256'), 'hex'), 24);
$$;

-- ───────────── RLS ─────────────
alter table public.branches enable row level security;
create policy branches_hr on public.branches for all using (firm_id = public.my_firm_id()) with check (firm_id = public.my_firm_id());
create policy branches_super_read on public.branches for select using (public.is_superadmin());

create policy profiles_hr_read on public.profiles for select using (firm_id = public.my_firm_id());

create policy firms_member_read on public.firms for select using (id = public.my_member_firm_id());
-- Payroll rules and holidays: employees only (they render payslips / their calendar). Branch kiosks get neither.
create policy settings_employee_read on public.firm_settings for select using (
  firm_id = (select e.firm_id from public.employees e where e.id = public.my_employee_id()));
create policy holidays_employee_read on public.holidays for select using (
  firm_id = (select e.firm_id from public.employees e where e.id = public.my_employee_id()));
create policy employees_self_read on public.employees for select using (id = public.my_employee_id());
create policy attendance_self_read on public.attendance for select using (employee_id = public.my_employee_id());
create policy payslips_self_read on public.payslips for select using (
  employee_id = public.my_employee_id()
  and exists (select 1 from public.payroll_runs r where r.id = run_id and r.status = 'finalized')
);
create policy branches_self_read on public.branches for select using (
  id = (select e.branch_id from public.employees e where e.id = public.my_employee_id())
);

-- ───────────── Branch kiosk: company info + today's QR + day register ─────────────
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
    'branch', json_build_object('id', b.id, 'name', b.name, 'address', b.address),
    'date', d, 'today', local_today(),
    'token', case when d = local_today() then branch_token(b, d) end,
    'rows', coalesce((
      select json_agg(json_build_object('emp_code', e.emp_code, 'full_name', e.full_name, 'designation', e.designation,
        'status', a.status, 'check_in', a.check_in, 'check_out', a.check_out, 'is_late', coalesce(a.is_late, false)) order by e.emp_code)
      from employees e left join attendance a on a.employee_id = e.id and a.date = d
      where e.branch_id = b.id and e.status = 'active'
        and (e.date_of_joining is null or e.date_of_joining <= d)), '[]'::json)
  );
end $$;

-- HR can display any of its branches' QR (e.g. at head office).
create or replace function public.branch_qr(p_branch uuid) returns text
language sql stable security definer set search_path = public as $$
  select branch_token(b, local_today()) from branches b where b.id = p_branch and b.firm_id = my_firm_id();
$$;

-- ───────────── Employee scan: first scan = check-in, second = check-out ─────────────
create or replace function public.scan_attendance(p_branch uuid, p_token text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare
  e employees; b branches; s firm_settings; a attendance;
  d date := local_today();
  t time := date_trunc('minute', (now() at time zone 'Asia/Kolkata'))::time;
  late boolean; hrs numeric; short boolean;
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

  select * into s from firm_settings where firm_id = e.firm_id;
  select * into a from attendance where employee_id = e.id and date = d;

  if not found then
    late := t > s.shift_start + make_interval(mins => s.late_grace_minutes);
    insert into attendance (firm_id, employee_id, date, status, check_in, is_late)
    values (e.firm_id, e.id, d, 'present', t, late);
    return json_build_object('action', 'check_in', 'time', t, 'late', late, 'branch', b.name);
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
  update attendance set check_out = t, status = case when short then 'half_day' else status end, updated_at = now()
  where id = a.id;
  return json_build_object('action', 'check_out', 'time', t, 'hours', hrs, 'half_day', short, 'branch', b.name);
end $$;

-- ───────────── Grants ─────────────
revoke execute on function public.branch_token(public.branches, date) from public, anon, authenticated;
revoke execute on function public.my_member_firm_id(), public.my_employee_id(), public.branch_overview(date),
  public.branch_qr(uuid), public.scan_attendance(uuid, text) from public, anon;
grant execute on function public.my_member_firm_id(), public.my_employee_id(), public.local_today(), public.branch_overview(date),
  public.branch_qr(uuid), public.scan_attendance(uuid, text) to authenticated;
