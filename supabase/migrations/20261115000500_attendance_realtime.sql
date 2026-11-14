-- Live office page: HR receives attendance changes over one realtime connection (RLS still applies) instead of polling.
alter publication supabase_realtime add table public.attendance;
