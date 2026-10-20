-- First account to sign up becomes the platform superadmin. Later signups get no profile (no access).
create or replace function public.bootstrap_superadmin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where role = 'superadmin') then
    insert into profiles(id, role, full_name) values (new.id, 'superadmin', new.raw_user_meta_data->>'full_name');
  end if;
  return new;
end $$;
create trigger on_auth_user_bootstrap after insert on auth.users
for each row execute function public.bootstrap_superadmin();

create or replace function public.setup_required() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from profiles where role = 'superadmin');
$$;
grant execute on function public.setup_required() to anon, authenticated;
