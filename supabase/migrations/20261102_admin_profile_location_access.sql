begin;

alter table public.profiles enable row level security;

create or replace function public.is_admin_profile()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin_profile() from public, anon;
grant execute on function public.is_admin_profile() to authenticated;

revoke select on public.profiles from authenticated;
grant select (
  id, role, name, email, farm_name, organization_name, address, barangay,
  municipality, latitude, longitude, account_status, inactivity_suspended_at,
  verification_status, avatar_url, created_at
) on public.profiles to authenticated;

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select to authenticated
  using ((select public.is_admin_profile()));

drop policy if exists profiles_own_row_guard on public.profiles;
create policy profiles_own_row_guard on public.profiles
  as restrictive for all to authenticated
  using ((select auth.uid()) = id or (select public.is_admin_profile()))
  with check ((select auth.uid()) = id);

commit;
