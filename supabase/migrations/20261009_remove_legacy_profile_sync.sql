begin;

-- Account creation now writes role fields directly to public.profiles.
drop trigger if exists profiles_role_tables_trigger on public.profiles;

-- Older installations may attach the same legacy function under another name.
do $$
declare
  legacy_trigger record;
begin
  for legacy_trigger in
    select trigger_row.tgname
    from pg_trigger trigger_row
    join pg_proc function_row on function_row.oid = trigger_row.tgfoid
    join pg_namespace function_schema on function_schema.oid = function_row.pronamespace
    where trigger_row.tgrelid = 'public.profiles'::regclass
      and not trigger_row.tgisinternal
      and function_schema.nspname = 'public'
      and function_row.proname = 'sync_profile_role_table'
  loop
    execute format('drop trigger %I on public.profiles', legacy_trigger.tgname);
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;
