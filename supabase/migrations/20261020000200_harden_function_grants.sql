-- Trigger functions are never callable over the API; helpers only for signed-in users.
revoke execute on function public.bootstrap_superadmin() from public, anon, authenticated;
revoke execute on function public.create_firm_settings() from public, anon, authenticated;
revoke execute on function public.is_superadmin() from public, anon;
revoke execute on function public.my_firm_id() from public, anon;
revoke execute on function public.platform_stats() from public, anon;
grant execute on function public.is_superadmin(), public.my_firm_id(), public.platform_stats() to authenticated;
