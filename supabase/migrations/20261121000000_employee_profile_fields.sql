-- Fields from client employee masters (e.g. Nighoj): personal details on employees, identity details on branches.
alter table public.employees
  add column if not exists gender text check (gender in ('M', 'F', 'O')),
  add column if not exists date_of_birth date,
  add column if not exists address text,
  add column if not exists qualification text,
  add column if not exists work_type text check (work_type in ('permanent', 'temporary'));

alter table public.branches
  add column if not exists code text,
  add column if not exists phone text,
  add column if not exists opened_on date;
create unique index if not exists branches_firm_code_key on public.branches (firm_id, code) where code is not null;
