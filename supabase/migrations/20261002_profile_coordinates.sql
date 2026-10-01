-- Existing accounts remain unset until the user chooses and saves a location.
alter table public.profiles
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_coordinates_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_coordinates_check check (
      (latitude is null and longitude is null) or
      (latitude is not null and longitude is not null and
       latitude between -90 and 90 and longitude between -180 and 180)
    );
  end if;
end $$;

notify pgrst, 'reload schema';
