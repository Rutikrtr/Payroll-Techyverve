-- principal is optional: null = deduct the monthly amount every month until the loan is stopped or removed.
alter table public.loans alter column principal drop not null;
alter table public.loans drop constraint loans_principal_check;
alter table public.loans add constraint loans_principal_check check (principal is null or principal > 0);
alter table public.loans add constraint loans_emi_within_total check (principal is null or emi <= principal);
update public.loans set name = 'Loan' where name = 'Karj';
