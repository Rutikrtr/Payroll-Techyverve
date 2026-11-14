-- Single-branch firms get secure employee app logins too.
-- Every single-branch firm has exactly one office (a branch row) behind the scenes: it holds the daily QR and the
-- geofence, and every employee of the firm belongs to it automatically.

create or replace function public.ensure_office_branch(p_firm uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare b uuid;
begin
  select id into b from public.branches where firm_id = p_firm order by created_at limit 1;
  if b is null then
    insert into public.branches (firm_id, name) values (p_firm, 'Main office') returning id into b;
  end if;
  return b;
end $$;
revoke all on function public.ensure_office_branch(uuid) from public, anon, authenticated;

-- New single-branch firm: create its office.
create or replace function public.firms_office_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not new.multi_branch then perform public.ensure_office_branch(new.id); end if;
  return new;
end $$;
create trigger firms_office after insert on public.firms for each row execute function public.firms_office_after_insert();

-- Employees of a single-branch firm always belong to the office.
create or replace function public.employees_default_office() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.branch_id is null and not (select f.multi_branch from public.firms f where f.id = new.firm_id) then
    new.branch_id := public.ensure_office_branch(new.firm_id);
  end if;
  return new;
end $$;
create trigger employees_office before insert or update of branch_id on public.employees
  for each row execute function public.employees_default_office();

-- Backfill existing single-branch firms.
do $$ declare f record; b uuid; begin
  for f in select id from public.firms where not multi_branch loop
    b := public.ensure_office_branch(f.id);
    update public.employees set branch_id = b where firm_id = f.id and branch_id is null;
  end loop;
end $$;
