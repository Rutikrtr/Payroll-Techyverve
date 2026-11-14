-- Named pay heads with per-employee amounts, and loans/advances (karj) with automatic EMI recovery.
-- Pay head definitions live in firm_settings.custom_components (JSON); amounts per employee live here.

create table public.employee_head_amounts (
  firm_id     uuid not null references public.firms(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  head_id     text not null,
  amount      numeric not null default 0 check (amount >= 0),
  primary key (employee_id, head_id)
);
create index on public.employee_head_amounts(firm_id);

create table public.loans (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid not null references public.firms(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 60),
  principal   numeric not null check (principal > 0),
  emi         numeric not null check (emi > 0),
  start_month date not null check (extract(day from start_month) = 1),
  note        text,
  closed      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on public.loans(firm_id);
create index on public.loans(employee_id);

-- One row per loan per payslip: what that month's payroll recovered. Deleted with the payslip on recalculation.
create table public.loan_recoveries (
  loan_id    uuid not null references public.loans(id) on delete cascade,
  payslip_id uuid not null references public.payslips(id) on delete cascade,
  firm_id    uuid not null references public.firms(id) on delete cascade,
  run_id     uuid not null references public.payroll_runs(id) on delete cascade,
  month      date not null,
  amount     numeric not null check (amount > 0),
  primary key (loan_id, payslip_id)
);
create index on public.loan_recoveries(payslip_id);
create index on public.loan_recoveries(run_id);
create index on public.loan_recoveries(firm_id);

-- Employee and payslip must belong to the loan's firm (no cross-firm rows even through the API).
create or replace function public.check_same_firm() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'employee_head_amounts' or tg_table_name = 'loans' then
    if not exists (select 1 from employees where id = new.employee_id and firm_id = new.firm_id) then
      raise exception 'Employee does not belong to this firm.';
    end if;
  elsif tg_table_name = 'loan_recoveries' then
    if not exists (select 1 from loans l join payslips p on p.id = new.payslip_id
                   where l.id = new.loan_id and l.firm_id = new.firm_id and p.firm_id = new.firm_id
                     and p.run_id = new.run_id and p.employee_id = l.employee_id) then
      raise exception 'Loan recovery does not match the payslip.';
    end if;
    if exists (select 1 from payroll_runs where id = new.run_id and status = 'finalized') then
      raise exception 'This payroll is finalized and locked. Reopen it to make changes.';
    end if;
  end if;
  return new;
end $$;
create trigger employee_head_amounts_same_firm before insert or update on public.employee_head_amounts
for each row execute function public.check_same_firm();
create trigger loans_same_firm before insert or update on public.loans
for each row execute function public.check_same_firm();
create trigger loan_recoveries_same_firm before insert or update on public.loan_recoveries
for each row execute function public.check_same_firm();

-- RLS: firm admin manages; super admin reads; employees read their own loans and recoveries.
alter table public.employee_head_amounts enable row level security;
alter table public.loans enable row level security;
alter table public.loan_recoveries enable row level security;

create policy head_amounts_hr on public.employee_head_amounts for all
  using (firm_id = public.my_firm_id()) with check (firm_id = public.my_firm_id());
create policy head_amounts_super_read on public.employee_head_amounts for select using (public.is_superadmin());

create policy loans_hr on public.loans for all
  using (firm_id = public.my_firm_id()) with check (firm_id = public.my_firm_id());
create policy loans_super_read on public.loans for select using (public.is_superadmin());
create policy loans_self_read on public.loans for select using (employee_id = public.my_employee_id());

create policy loan_recoveries_hr on public.loan_recoveries for all
  using (firm_id = public.my_firm_id()) with check (firm_id = public.my_firm_id());
create policy loan_recoveries_super_read on public.loan_recoveries for select using (public.is_superadmin());
create policy loan_recoveries_self_read on public.loan_recoveries for select
  using (loan_id in (select id from public.loans where employee_id = public.my_employee_id()));
