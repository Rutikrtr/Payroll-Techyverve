-- Techyverve Payroll: multi-tenant schema
-- Roles: superadmin (platform owner) and hr (one login per firm)

create extension if not exists pgcrypto;

-- ───────────────────────── Firms ─────────────────────────
create table public.firms (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  legal_name    text,
  industry      text,
  address       text,
  city          text,
  state         text,
  pincode       text,
  country       text default 'India',
  gstin         text,
  pan           text,
  tan           text,
  pf_code       text,
  esi_code      text,
  contact_name  text,
  contact_email text,
  contact_phone text,
  hr_email      text not null,
  logo_url      text,
  employee_limit int default 50,
  status        text not null default 'active' check (status in ('active','suspended')),
  created_at    timestamptz not null default now()
);

-- ───────────────────────── Profiles ─────────────────────────
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('superadmin','hr')),
  firm_id    uuid references public.firms(id) on delete cascade,
  full_name  text,
  created_at timestamptz not null default now(),
  constraint hr_has_firm check (role = 'superadmin' or firm_id is not null)
);

-- Helper functions (security definer so policies don't recurse)
create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'superadmin');
$$;

create or replace function public.my_firm_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.firm_id from profiles p
  join firms f on f.id = p.firm_id
  where p.id = auth.uid() and f.status = 'active';
$$;

-- ───────────────────────── Firm settings (rules) ─────────────────────────
create table public.firm_settings (
  firm_id                uuid primary key references public.firms(id) on delete cascade,
  currency               text not null default 'INR',
  -- attendance
  weekly_offs            int[] not null default '{0}',          -- 0=Sun … 6=Sat
  shift_start            time not null default '09:30',
  shift_end              time not null default '18:30',
  late_grace_minutes     int not null default 15,
  lates_per_half_day     int not null default 3,                -- 0 = disabled
  half_day_min_hours     numeric not null default 4,
  unmarked_as            text not null default 'absent' check (unmarked_as in ('absent','present')),
  paid_leaves_per_month  numeric not null default 1.5,
  -- salary basis
  lop_basis              text not null default 'working' check (lop_basis in ('calendar','working','fixed30')),
  ot_enabled             boolean not null default false,
  ot_multiplier          numeric not null default 1.5,
  standard_hours         numeric not null default 8,
  -- statutory
  pf_enabled             boolean not null default true,
  pf_rate                numeric not null default 12,
  pf_wage_cap            numeric not null default 15000,
  esi_enabled            boolean not null default true,
  esi_rate               numeric not null default 0.75,
  esi_threshold          numeric not null default 21000,
  pt_enabled             boolean not null default true,
  pt_amount              numeric not null default 200,
  pt_threshold           numeric not null default 10000,
  tds_enabled            boolean not null default false,
  tds_rate               numeric not null default 0,
  -- custom components [{id,name,kind:'earning'|'deduction',calc:'fixed'|'pct_basic'|'pct_gross',value}]
  custom_components      jsonb not null default '[]',
  -- payslip format
  slip_template          text not null default 'classic' check (slip_template in ('classic','modern','compact')),
  slip_accent            text not null default '#7b1e3a',
  slip_show_bank         boolean not null default true,
  slip_show_attendance   boolean not null default true,
  slip_show_ytd          boolean not null default false,
  slip_show_logo         boolean not null default true,
  slip_amount_in_words   boolean not null default true,
  slip_footer            text not null default 'This is a computer-generated payslip and does not require a signature.',
  updated_at             timestamptz not null default now()
);

create or replace function public.create_firm_settings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into firm_settings(firm_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger firms_settings_after_insert after insert on public.firms
for each row execute function public.create_firm_settings();

-- ───────────────────────── Employees ─────────────────────────
create table public.employees (
  id                uuid primary key default gen_random_uuid(),
  firm_id           uuid not null references public.firms(id) on delete cascade,
  emp_code          text not null,
  full_name         text not null,
  email             text,
  phone             text,
  designation       text,
  department        text,
  date_of_joining   date,
  date_of_exit      date,
  pan               text,
  uan               text,
  esi_number        text,
  bank_name         text,
  bank_account      text,
  ifsc              text,
  basic             numeric not null default 0,
  hra               numeric not null default 0,
  conveyance        numeric not null default 0,
  special_allowance numeric not null default 0,
  other_allowance   numeric not null default 0,
  pf_applicable     boolean not null default true,
  esi_applicable    boolean not null default true,
  status            text not null default 'active' check (status in ('active','inactive')),
  created_at        timestamptz not null default now(),
  unique (firm_id, emp_code)
);
create index on public.employees(firm_id);

-- ───────────────────────── Attendance ─────────────────────────
create table public.attendance (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid not null references public.firms(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  date        date not null,
  status      text not null check (status in ('present','absent','half_day','paid_leave','unpaid_leave','holiday','week_off')),
  check_in    time,
  check_out   time,
  is_late     boolean not null default false,
  ot_hours    numeric not null default 0,
  note        text,
  updated_at  timestamptz not null default now(),
  unique (employee_id, date)
);
create index on public.attendance(firm_id, date);

create table public.holidays (
  id      uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  date    date not null,
  name    text not null,
  unique (firm_id, date)
);

-- ───────────────────────── Payroll ─────────────────────────
create table public.payroll_runs (
  id           uuid primary key default gen_random_uuid(),
  firm_id      uuid not null references public.firms(id) on delete cascade,
  month        date not null,                         -- first of month
  status       text not null default 'draft' check (status in ('draft','finalized')),
  total_gross  numeric not null default 0,
  total_net    numeric not null default 0,
  employee_count int not null default 0,
  finalized_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (firm_id, month)
);

create table public.payslips (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid not null references public.payroll_runs(id) on delete cascade,
  firm_id          uuid not null references public.firms(id) on delete cascade,
  employee_id      uuid not null references public.employees(id) on delete cascade,
  month            date not null,
  snapshot         jsonb not null,                    -- employee + earnings + deductions + attendance
  gross            numeric not null,
  total_deductions numeric not null,
  net_pay          numeric not null,
  created_at       timestamptz not null default now(),
  unique (run_id, employee_id)
);
create index on public.payslips(firm_id, month);

-- ───────────────────────── RLS ─────────────────────────
alter table public.firms         enable row level security;
alter table public.profiles      enable row level security;
alter table public.firm_settings enable row level security;
alter table public.employees     enable row level security;
alter table public.attendance    enable row level security;
alter table public.holidays      enable row level security;
alter table public.payroll_runs  enable row level security;
alter table public.payslips      enable row level security;

-- firms: superadmin full access; HR reads own firm
create policy firms_super on public.firms for all
  using (public.is_superadmin()) with check (public.is_superadmin());
create policy firms_hr_read on public.firms for select
  using (id = public.my_firm_id());

-- profiles: everyone reads own; superadmin reads all
create policy profiles_self on public.profiles for select
  using (id = auth.uid() or public.is_superadmin());

-- tenant tables: HR scoped to own firm; superadmin read-only
do $$
declare t text;
begin
  foreach t in array array['firm_settings','employees','attendance','holidays','payroll_runs','payslips'] loop
    execute format('create policy %1$s_hr on public.%1$s for all
      using (firm_id = public.my_firm_id()) with check (firm_id = public.my_firm_id())', t);
    execute format('create policy %1$s_super_read on public.%1$s for select
      using (public.is_superadmin())', t);
  end loop;
end $$;

-- Platform stats for superadmin dashboard
create or replace function public.platform_stats()
returns table (firm_id uuid, employees bigint, present_today bigint, last_payroll date, last_net numeric)
language sql stable security definer set search_path = public as $$
  select f.id,
    (select count(*) from employees e where e.firm_id = f.id and e.status = 'active'),
    (select count(*) from attendance a where a.firm_id = f.id and a.date = current_date and a.status in ('present','half_day')),
    (select max(month) from payroll_runs r where r.firm_id = f.id and r.status = 'finalized'),
    (select r.total_net from payroll_runs r where r.firm_id = f.id and r.status = 'finalized' order by month desc limit 1)
  from firms f
  where public.is_superadmin();
$$;

revoke execute on function public.platform_stats() from anon;
