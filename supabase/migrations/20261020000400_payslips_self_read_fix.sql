-- Employees can't read payroll_runs (firm totals), so the finalized check must bypass its RLS.
create or replace function public.run_is_finalized(p_run uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from payroll_runs where id = p_run and status = 'finalized');
$$;
revoke execute on function public.run_is_finalized(uuid) from public, anon;
grant execute on function public.run_is_finalized(uuid) to authenticated;

drop policy payslips_self_read on public.payslips;
create policy payslips_self_read on public.payslips for select using (
  employee_id = public.my_employee_id() and public.run_is_finalized(run_id));
