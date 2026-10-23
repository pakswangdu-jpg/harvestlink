begin;

alter table public.profiles enable row level security;

drop policy if exists profiles_prevent_user_delete on public.profiles;
drop policy if exists "Users can delete own profile" on public.profiles;

create policy "Users can delete own profile"
on public.profiles
as permissive
for delete
to authenticated
using (
  (select auth.uid()) = id
);

commit;
