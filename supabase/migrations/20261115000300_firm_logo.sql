-- Firm logo: HR uploads it from Settings. The browser shrinks it to a small image and sends it as a data URL,
-- so it lives with the firm row (no storage bucket, no external links). Only image data URLs up to ~200 KB.
create or replace function public.set_firm_logo(p_logo text) returns void
language plpgsql security definer set search_path = '' as $$
declare f uuid := public.my_firm_id();
begin
  if f is null or not exists (select 1 from public.profiles where id = auth.uid() and role = 'hr') then
    raise exception 'Only the firm admin can change the logo';
  end if;
  if p_logo is not null and (p_logo !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' or length(p_logo) > 200000) then
    raise exception 'Logo must be a PNG, JPG or WebP image under 150 KB';
  end if;
  update public.firms set logo_url = p_logo where id = f;
  -- A new logo should appear on payslips straight away.
  if p_logo is not null then update public.firm_settings set slip_show_logo = true where firm_id = f; end if;
end $$;
revoke all on function public.set_firm_logo(text) from public, anon;
grant execute on function public.set_firm_logo(text) to authenticated;
