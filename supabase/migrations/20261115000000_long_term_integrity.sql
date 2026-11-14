-- Long-term data safety (10+ years of history per client).
-- 1. Salary history can never be lost by accident: employees, loans and payslips with history cannot be hard-deleted.
-- 2. Sanity checks on money, dates and months.
-- 3. updated_at on the main tables and an audit log of who changed what.
-- 4. A firm with finalized payroll cannot be deleted (suspend it instead).

-- 1. History is kept: NO ACTION (blocks a direct delete, still allows a whole-firm delete) instead of CASCADE where payroll history hangs off a row.
alter table public.payslips drop constraint payslips_employee_id_fkey,
  add constraint payslips_employee_id_fkey foreign key (employee_id) references public.employees(id) on delete no action;
alter table public.attendance drop constraint attendance_employee_id_fkey,
  add constraint attendance_employee_id_fkey foreign key (employee_id) references public.employees(id) on delete no action;
alter table public.loan_recoveries drop constraint loan_recoveries_loan_id_fkey,
  add constraint loan_recoveries_loan_id_fkey foreign key (loan_id) references public.loans(id) on delete no action;

-- 2. Checks.
alter table public.employees
  add constraint employees_pay_nonneg check (basic >= 0 and hra >= 0 and conveyance >= 0 and special_allowance >= 0 and other_allowance >= 0),
  add constraint employees_exit_after_join check (date_of_exit is null or date_of_joining is null or date_of_exit >= date_of_joining);
alter table public.payroll_runs add constraint payroll_runs_month_first check (extract(day from month) = 1);
alter table public.payslips
  add constraint payslips_month_first check (extract(day from month) = 1),
  add constraint payslips_amounts_nonneg check (gross >= 0 and total_deductions >= 0 and net_pay >= 0);
alter table public.attendance add constraint attendance_ot_range check (ot_hours >= 0 and ot_hours <= 24);
alter table public.loan_recoveries add constraint loan_recoveries_month_first check (extract(day from month) = 1);

-- 3a. updated_at.
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

alter table public.employees add column if not exists updated_at timestamptz not null default now();
alter table public.loans add column if not exists updated_at timestamptz not null default now();
alter table public.payroll_runs add column if not exists updated_at timestamptz not null default now();
alter table public.firms add column if not exists updated_at timestamptz not null default now();
create trigger employees_touch before update on public.employees for each row execute function public.touch_updated_at();
create trigger loans_touch before update on public.loans for each row execute function public.touch_updated_at();
create trigger payroll_runs_touch before update on public.payroll_runs for each row execute function public.touch_updated_at();
create trigger firms_touch before update on public.firms for each row execute function public.touch_updated_at();

-- 3b. Audit log: one row per change to key records, with old and new values.
create table public.audit_log (
  id bigint generated always as identity primary key,
  firm_id uuid,  -- no FK: the trail outlives deleted rows
  table_name text not null,
  row_id text,
  action text not null check (action in ('insert', 'update', 'delete')),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);
create index audit_log_firm_time_idx on public.audit_log (firm_id, changed_at desc);
create index audit_log_row_idx on public.audit_log (table_name, row_id);
alter table public.audit_log enable row level security;
create policy audit_hr_read on public.audit_log for select using (firm_id = public.my_firm_id());
create policy audit_super_read on public.audit_log for select using (public.is_superadmin());
-- No insert/update/delete policies: only the trigger (security definer) writes, and nobody can edit history.

create or replace function public.write_audit() returns trigger language plpgsql security definer set search_path = '' as $$
declare r jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (firm_id, table_name, row_id, action, changed_by, old_data, new_data)
  values (
    case when tg_table_name = 'firms' then (r->>'id')::uuid else (r->>'firm_id')::uuid end,
    tg_table_name,
    coalesce(r->>'id', r->>'employee_id', r->>'firm_id'),
    lower(tg_op), auth.uid(),
    case when tg_op <> 'INSERT' then to_jsonb(old) - 'qr_secret' end,  -- never copy the branch QR secret
    case when tg_op <> 'DELETE' then to_jsonb(new) - 'qr_secret' end);
  return coalesce(new, old);
end $$;
revoke all on function public.write_audit() from public, anon, authenticated;

create trigger audit_employees after insert or update or delete on public.employees for each row execute function public.write_audit();
create trigger audit_head_amounts after insert or update or delete on public.employee_head_amounts for each row execute function public.write_audit();
create trigger audit_loans after insert or update or delete on public.loans for each row execute function public.write_audit();
create trigger audit_payroll_runs after insert or update or delete on public.payroll_runs for each row execute function public.write_audit();
create trigger audit_firm_settings after update on public.firm_settings for each row execute function public.write_audit();
create trigger audit_branches after insert or update or delete on public.branches for each row execute function public.write_audit();
create trigger audit_holidays after insert or update or delete on public.holidays for each row execute function public.write_audit();
create trigger audit_firms after insert or update on public.firms for each row execute function public.write_audit();

-- 4. Never delete a client that has finalized payroll.
create or replace function public.guard_firm_delete() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.payroll_runs where firm_id = old.id and status = 'finalized') then
    raise exception 'This firm has finalized payroll history and cannot be deleted. Suspend it instead.';
  end if;
  return old;
end $$;
create trigger firms_guard_delete before delete on public.firms for each row execute function public.guard_firm_delete();
