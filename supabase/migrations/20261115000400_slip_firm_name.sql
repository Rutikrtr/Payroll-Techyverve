-- Firm name printed on payslips only, in any language (e.g. Marathi). Empty = use the legal name / firm name.
alter table public.firm_settings add column slip_firm_name text check (slip_firm_name is null or length(trim(slip_firm_name)) between 1 and 150);
comment on column public.firm_settings.slip_firm_name is 'Firm name printed on payslips only (any language); falls back to legal name / name.';
