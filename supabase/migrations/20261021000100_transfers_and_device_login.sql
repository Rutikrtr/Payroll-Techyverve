-- Branch transfers with history, permanent employee IDs, and one-time-code device logins.

-- ───────────── Employee ID is permanent ─────────────
create or replace function public.lock_emp_code() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.emp_code is distinct from old.emp_code then
    raise exception 'Employee ID % is permanent and cannot be changed.', old.emp_code;
  end if;
  if new.firm_id is distinct from old.firm_id then
    raise exception 'An employee cannot move to another firm.';
  end if;
  -- Once assigned, a branch only changes through transfer_employee() so history is never skipped.
  if old.branch_id is not null and new.branch_id is not null and new.branch_id <> old.branch_id
     and coalesce(current_setting('app.transfer', true), '') <> 'on' then
    raise exception 'Use Transfer to move an employee to another branch.';
  end if;
  return new;
end $$;
create trigger employees_lock_code before update on public.employees
for each row execute function public.lock_emp_code();

-- ───────────── Branch transfers ─────────────
create table public.branch_transfers (
  id             uuid primary key default gen_random_uuid(),
  firm_id        uuid not null references public.firms(id) on delete cascade,
  employee_id    uuid not null references public.employees(id) on delete cascade,
  from_branch_id uuid references public.branches(id) on delete set null,
  to_branch_id   uuid references public.branches(id) on delete set null,
  effective_date date not null,
  note           text,
  created_at     timestamptz not null default now()
);
create index on public.branch_transfers(employee_id, effective_date desc);

alter table public.branch_transfers enable row level security;
create policy branch_transfers_hr_read on public.branch_transfers for select using (firm_id = public.my_firm_id());
create policy branch_transfers_super_read on public.branch_transfers for select using (public.is_superadmin());

-- The only way to change a branch once set: moves the employee and records history atomically.
create or replace function public.transfer_employee(p_employee uuid, p_to_branch uuid, p_date date default null, p_note text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare e employees; f uuid := my_firm_id(); d date := coalesce(p_date, local_today());
begin
  if f is null then raise exception 'Only the firm admin can transfer employees.'; end if;
  select * into e from employees where id = p_employee and firm_id = f for update;
  if not found then raise exception 'Employee not found.'; end if;
  if not exists (select 1 from branches where id = p_to_branch and firm_id = f) then raise exception 'Branch not found.'; end if;
  if e.branch_id = p_to_branch then raise exception 'The employee is already in this branch.'; end if;
  if d > local_today() then raise exception 'Transfer date cannot be in the future.'; end if;
  perform set_config('app.transfer', 'on', true);
  update employees set branch_id = p_to_branch where id = e.id;
  perform set_config('app.transfer', '', true);
  insert into branch_transfers (firm_id, employee_id, from_branch_id, to_branch_id, effective_date, note)
  values (f, e.id, e.branch_id, p_to_branch, d, nullif(trim(p_note), ''));
end $$;
revoke execute on function public.transfer_employee(uuid, uuid, date, text) from public, anon;
grant execute on function public.transfer_employee(uuid, uuid, date, text) to authenticated;

-- ───────────── One-time login codes (service role only) ─────────────
create table public.login_codes (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    smallint not null default 0
);
alter table public.login_codes enable row level security;  -- no policies: only the edge functions touch it

-- Ends every session of a user (their refresh tokens go with them). Called by edge functions only.
create or replace function public.revoke_user_sessions(p_user uuid) returns void
language sql volatile security definer set search_path = public, auth as $$
  delete from auth.sessions where user_id = p_user;
$$;
revoke execute on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;

-- Device status for the admin's employee page.
create or replace function public.employee_login_status(p_employee uuid) returns json
language sql stable security definer set search_path = public, auth as $$
  select json_build_object(
    'login_id', p.login_id,
    'devices', (select count(*) from auth.sessions s where s.user_id = p.id),
    'last_seen', (select max(coalesce(s.updated_at, s.created_at)) from auth.sessions s where s.user_id = p.id),
    'code_pending', exists (select 1 from login_codes c where c.employee_id = p_employee and c.expires_at > now()))
  from profiles p
  where p.employee_id = p_employee and p.firm_id = my_firm_id();
$$;
revoke execute on function public.employee_login_status(uuid) from public, anon;
grant execute on function public.employee_login_status(uuid) to authenticated;
