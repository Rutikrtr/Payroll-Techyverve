-- A finalized payroll is locked at the database level (not only in the UI).
create or replace function public.lock_finalized_payslips() returns trigger
language plpgsql set search_path = public as $$
begin
  -- Deleting a firm cascades through payroll_runs first, so the run is already gone and the delete is allowed.
  if exists (select 1 from payroll_runs r
             where r.status = 'finalized'
               and r.id in (case when tg_op <> 'INSERT' then old.run_id end, case when tg_op <> 'DELETE' then new.run_id end)) then
    raise exception 'This payroll is finalized and locked. Reopen it to make changes.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger payslips_lock_finalized before insert or update or delete on public.payslips
for each row execute function public.lock_finalized_payslips();

-- A finalized run only allows Reopen (status back to draft); its figures are frozen.
create or replace function public.lock_finalized_runs() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.status = 'finalized' and new.status = 'finalized'
     and (new.total_gross, new.total_net, new.employee_count, new.month, new.firm_id)
         is distinct from (old.total_gross, old.total_net, old.employee_count, old.month, old.firm_id) then
    raise exception 'This payroll is finalized and locked. Reopen it to make changes.';
  end if;
  return new;
end $$;
create trigger payroll_runs_lock_finalized before update on public.payroll_runs
for each row execute function public.lock_finalized_runs();
