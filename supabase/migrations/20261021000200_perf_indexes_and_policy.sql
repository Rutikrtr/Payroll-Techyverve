-- Advisor fixes: index foreign keys, evaluate auth.uid() once per query.
create index if not exists branch_transfers_firm_id_idx on public.branch_transfers(firm_id);
create index if not exists branch_transfers_from_branch_idx on public.branch_transfers(from_branch_id);
create index if not exists branch_transfers_to_branch_idx on public.branch_transfers(to_branch_id);
create index if not exists payslips_employee_id_idx on public.payslips(employee_id);
create index if not exists profiles_branch_id_idx on public.profiles(branch_id);
drop policy profiles_self on public.profiles;
create policy profiles_self on public.profiles for select using (id = (select auth.uid()) or public.is_superadmin());
