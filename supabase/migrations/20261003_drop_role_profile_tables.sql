begin;

do $$
declare
  missing_profiles bigint;
  dependent_foreign_keys text;
  unsupported_columns text;
  role_policies text;
  role_triggers text;
  role_functions text;
begin
  select count(*)
  into missing_profiles
  from auth.users u
  left join public.profiles p on p.id = u.id
  where p.id is null;

  if missing_profiles > 0 then
    raise exception 'Cannot remove role tables: % authenticated users still have no profiles row.', missing_profiles;
  end if;

  select string_agg(
    format('%I.%I (%I)', source_ns.nspname, source_table.relname, constraint_row.conname),
    ', '
  )
  into dependent_foreign_keys
  from pg_constraint constraint_row
  join pg_class source_table on source_table.oid = constraint_row.conrelid
  join pg_namespace source_ns on source_ns.oid = source_table.relnamespace
  join pg_class target_table on target_table.oid = constraint_row.confrelid
  join pg_namespace target_ns on target_ns.oid = target_table.relnamespace
  where constraint_row.contype = 'f'
    and target_ns.nspname = 'public'
    and target_table.relname in ('buyers', 'farmers', 'stakeholders')
    and not (
      source_ns.nspname = 'public'
      and source_table.relname in ('buyers', 'farmers', 'stakeholders')
    );

  if dependent_foreign_keys is not null then
    raise exception 'Cannot remove role tables until these foreign keys are migrated to profiles.id: %', dependent_foreign_keys;
  end if;

  select string_agg(format('%I.%I', columns.table_name, columns.column_name), ', ')
  into unsupported_columns
  from information_schema.columns columns
  where columns.table_schema = 'public'
    and columns.table_name in ('buyers', 'farmers', 'stakeholders')
    and not (
      (columns.table_name = 'buyers' and columns.column_name in ('id', 'created_at', 'updated_at'))
      or (columns.table_name = 'farmers' and columns.column_name in (
        'id', 'farm_name', 'birthday', 'gov_id_file_url', 'verification_status',
        'verification_acknowledged', 'verified_at', 'gcash_account_name',
        'gcash_number', 'gcash_qr_url', 'created_at', 'updated_at'
      ))
      or (columns.table_name = 'stakeholders' and columns.column_name in (
        'id', 'organization_name', 'organization_type', 'contact_person',
        'accreditation_file_url', 'organization_description', 'barangay',
        'partnership_description', 'verification_status', 'verification_acknowledged',
        'verified_at', 'created_at', 'updated_at'
      ))
    );

  if unsupported_columns is not null then
    raise exception 'Cannot remove role tables: migrate or explicitly review these unhandled columns first: %', unsupported_columns;
  end if;

  select string_agg(format('%I.%I (%I)', policy.schemaname, policy.tablename, policy.policyname), ', ')
  into role_policies
  from pg_policies policy
  where policy.schemaname = 'public'
    and policy.tablename in ('buyers', 'farmers', 'stakeholders');

  if role_policies is not null then
    raise exception 'Cannot remove role tables until these table-specific RLS policies are reviewed and migrated to profiles: %', role_policies;
  end if;

  select string_agg(format('%I.%I (%I)', namespace.nspname, relation.relname, trigger_row.tgname), ', ')
  into role_triggers
  from pg_trigger trigger_row
  join pg_class relation on relation.oid = trigger_row.tgrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname in ('buyers', 'farmers', 'stakeholders')
    and not trigger_row.tgisinternal;

  if role_triggers is not null then
    raise exception 'Cannot remove role tables until these table triggers are reviewed: %', role_triggers;
  end if;

  select string_agg(format('%I.%I', namespace.nspname, proc_row.proname), ', ')
  into role_functions
  from pg_proc proc_row
  join pg_namespace namespace on namespace.oid = proc_row.pronamespace
  where namespace.nspname not in ('pg_catalog', 'information_schema')
    and proc_row.proname <> 'sync_profile_role_table'
    and proc_row.prosrc ~* '\m(public\.)?(buyers|farmers|stakeholders)\M';

  if role_functions is not null then
    raise exception 'Cannot remove role tables until these database functions are reviewed and migrated: %', role_functions;
  end if;

  if to_regclass('public.farmers') is not null then
    select count(*) into missing_profiles
    from public.farmers f
    left join public.profiles p on p.id = f.id and p.role = 'farmer'
    where p.id is null;
    if missing_profiles > 0 then
      raise exception 'Cannot remove farmers: % rows do not match a farmer profile.', missing_profiles;
    end if;
  end if;

  if to_regclass('public.buyers') is not null then
    select count(*) into missing_profiles
    from public.buyers b
    left join public.profiles p on p.id = b.id and p.role = 'buyer'
    where p.id is null;
    if missing_profiles > 0 then
      raise exception 'Cannot remove buyers: % rows do not match a buyer profile.', missing_profiles;
    end if;
  end if;

  if to_regclass('public.stakeholders') is not null then
    select count(*) into missing_profiles
    from public.stakeholders s
    left join public.profiles p on p.id = s.id and p.role = 'stakeholder'
    where p.id is null;
    if missing_profiles > 0 then
      raise exception 'Cannot remove stakeholders: % rows do not match a stakeholder profile.', missing_profiles;
    end if;
  end if;

  if to_regclass('public.farmers') is not null then
    select count(*)
    into missing_profiles
    from public.farmers f
    join public.profiles p on p.id = f.id and p.role = 'farmer'
    where nullif(f.farm_name, '') is not null and nullif(p.farm_name, '') is null
      or f.birthday is not null and p.birthday is null
      or nullif(f.gov_id_file_url, '') is not null and nullif(p.gov_id_file_url, '') is null
      or f.verification_status is not null and p.verification_status is null
      or f.verification_status is not null and p.verification_status is not null and f.verification_acknowledged is distinct from p.verification_acknowledged
      or f.verified_at is not null and p.verified_at is null
      or nullif(f.gcash_account_name, '') is not null and nullif(p.gcash_account_name, '') is null
      or nullif(f.gcash_number, '') is not null and nullif(p.gcash_number, '') is null
      or nullif(f.gcash_qr_url, '') is not null and nullif(p.gcash_qr_url, '') is null
      or nullif(f.farm_name, '') is not null and nullif(p.farm_name, '') is not null and nullif(f.farm_name, '') is distinct from nullif(p.farm_name, '')
      or f.birthday is not null and p.birthday is not null and f.birthday is distinct from p.birthday
      or nullif(f.gov_id_file_url, '') is not null and nullif(p.gov_id_file_url, '') is not null and nullif(f.gov_id_file_url, '') is distinct from nullif(p.gov_id_file_url, '')
      or f.verification_status is not null and p.verification_status is not null and f.verification_status is distinct from p.verification_status
      or f.verified_at is not null and p.verified_at is not null and f.verified_at is distinct from p.verified_at
      or nullif(f.gcash_account_name, '') is not null and nullif(p.gcash_account_name, '') is not null and nullif(f.gcash_account_name, '') is distinct from nullif(p.gcash_account_name, '')
      or nullif(f.gcash_number, '') is not null and nullif(p.gcash_number, '') is not null and nullif(f.gcash_number, '') is distinct from nullif(p.gcash_number, '')
      or nullif(f.gcash_qr_url, '') is not null and nullif(p.gcash_qr_url, '') is not null and nullif(f.gcash_qr_url, '') is distinct from nullif(p.gcash_qr_url, '');
    if missing_profiles > 0 then
      raise exception 'Cannot remove farmers: % farmer extension rows have missing or conflicting data in profiles. Resolve them before rerunning.', missing_profiles;
    end if;
  end if;

  if to_regclass('public.stakeholders') is not null then
    select count(*)
    into missing_profiles
    from public.stakeholders s
    join public.profiles p on p.id = s.id and p.role = 'stakeholder'
    where nullif(s.organization_name, '') is not null and nullif(p.organization_name, '') is null
      or nullif(s.organization_type, '') is not null and nullif(p.organization_type, '') is null
      or nullif(s.contact_person, '') is not null and nullif(p.contact_person, '') is null
      or nullif(s.accreditation_file_url, '') is not null and nullif(p.accreditation_file_url, '') is null
      or nullif(s.organization_description, '') is not null and nullif(p.organization_description, '') is null
      or nullif(s.barangay, '') is not null and nullif(p.barangay, '') is null
      or nullif(s.partnership_description, '') is not null and nullif(p.partnership_description, '') is null
      or s.verification_status is not null and p.verification_status is null
      or s.verification_status is not null and p.verification_status is not null and s.verification_acknowledged is distinct from p.verification_acknowledged
      or s.verified_at is not null and p.verified_at is null
      or nullif(s.organization_name, '') is not null and nullif(p.organization_name, '') is not null and nullif(s.organization_name, '') is distinct from nullif(p.organization_name, '')
      or nullif(s.organization_type, '') is not null and nullif(p.organization_type, '') is not null and nullif(s.organization_type, '') is distinct from nullif(p.organization_type, '')
      or nullif(s.contact_person, '') is not null and nullif(p.contact_person, '') is not null and nullif(s.contact_person, '') is distinct from nullif(p.contact_person, '')
      or nullif(s.accreditation_file_url, '') is not null and nullif(p.accreditation_file_url, '') is not null and nullif(s.accreditation_file_url, '') is distinct from nullif(p.accreditation_file_url, '')
      or nullif(s.organization_description, '') is not null and nullif(p.organization_description, '') is not null and nullif(s.organization_description, '') is distinct from nullif(p.organization_description, '')
      or nullif(s.barangay, '') is not null and nullif(p.barangay, '') is not null and nullif(s.barangay, '') is distinct from nullif(p.barangay, '')
      or nullif(s.partnership_description, '') is not null and nullif(p.partnership_description, '') is not null and nullif(s.partnership_description, '') is distinct from nullif(p.partnership_description, '')
      or s.verification_status is not null and p.verification_status is not null and s.verification_status is distinct from p.verification_status
      or s.verified_at is not null and p.verified_at is not null and s.verified_at is distinct from p.verified_at;
    if missing_profiles > 0 then
      raise exception 'Cannot remove stakeholders: % stakeholder extension rows have missing or conflicting data in profiles. Resolve them before rerunning.', missing_profiles;
    end if;
  end if;
end $$;

drop trigger if exists profiles_role_tables_trigger on public.profiles;
drop function if exists public.sync_profile_role_table();
drop table if exists public.buyers, public.farmers, public.stakeholders restrict;

notify pgrst, 'reload schema';

commit;
