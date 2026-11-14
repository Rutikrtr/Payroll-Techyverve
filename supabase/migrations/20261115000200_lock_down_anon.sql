-- Defence in depth: RLS already returns nothing to signed-out visitors, but they should have no table rights at all.
-- The only thing the login page calls before sign-in is setup_required(); employee code login runs in an edge function.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- Trigger functions are never meant to be called through the API.
revoke all on function public.employees_default_office() from public, anon, authenticated;
revoke all on function public.firms_office_after_insert() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.guard_firm_delete() from public, anon, authenticated;

-- Signed-in users may read the audit trail (RLS limits it to their firm) but never change it.
revoke insert, update, delete, truncate on public.audit_log from authenticated;
