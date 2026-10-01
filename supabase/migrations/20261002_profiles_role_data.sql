begin;

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists profiles_own_row_guard on public.profiles;
create policy profiles_own_row_guard on public.profiles
  as restrictive for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists profiles_prevent_user_delete on public.profiles;
create policy profiles_prevent_user_delete on public.profiles
  as restrictive for delete to authenticated
  using (false);

do $$
declare
  missing_profiles bigint;
begin
  insert into public.profiles (
    id, role, email, first_name, middle_name, last_name, name,
    contact_number, address, zip_code, municipality,
    created_at, updated_at
  )
  select
    u.id,
    u.raw_user_meta_data ->> 'role',
    coalesce(u.email, u.raw_user_meta_data ->> 'email'),
    coalesce(u.raw_user_meta_data ->> 'firstName', ''),
    coalesce(u.raw_user_meta_data ->> 'middleName', ''),
    coalesce(u.raw_user_meta_data ->> 'lastName', ''),
    coalesce(
      nullif(u.raw_user_meta_data ->> 'name', ''),
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      concat_ws(
        ' ',
        nullif(u.raw_user_meta_data ->> 'firstName', ''),
        nullif(u.raw_user_meta_data ->> 'middleName', ''),
        nullif(u.raw_user_meta_data ->> 'lastName', '')
      ),
      ''
    ),
    nullif(u.raw_user_meta_data ->> 'contactNumber', ''),
    nullif(u.raw_user_meta_data ->> 'address', ''),
    nullif(u.raw_user_meta_data ->> 'zipCode', ''),
    nullif(u.raw_user_meta_data ->> 'municipality', ''),
    u.created_at,
    coalesce(u.updated_at, u.created_at)
  from auth.users u
  left join public.profiles p on p.id = u.id
  where p.id is null
    and u.raw_user_meta_data ->> 'role' in ('farmer', 'buyer', 'stakeholder', 'admin')
    and coalesce(u.email, u.raw_user_meta_data ->> 'email') is not null
  on conflict (id) do nothing;

  select count(*)
  into missing_profiles
  from auth.users u
  left join public.profiles p on p.id = u.id
  where p.id is null;

  if missing_profiles > 0 then
    raise exception
      'Cannot consolidate role tables: % auth.users rows have no profiles row and no valid role/email metadata. Reconcile these accounts before rerunning.',
      missing_profiles;
  end if;
end $$;

do $$
begin
  if to_regclass('public.farmers') is not null then
    update public.profiles p
    set
      farm_name = coalesce(nullif(p.farm_name, ''), nullif(f.farm_name, '')),
      birthday = coalesce(p.birthday, f.birthday),
      gov_id_file_url = coalesce(nullif(p.gov_id_file_url, ''), nullif(f.gov_id_file_url, '')),
      verification_status = coalesce(p.verification_status, f.verification_status),
      verification_acknowledged = case
        when p.verification_status is null and f.verification_status is not null
          then f.verification_acknowledged
        else p.verification_acknowledged
      end,
      verified_at = coalesce(p.verified_at, f.verified_at),
      gcash_account_name = coalesce(nullif(p.gcash_account_name, ''), nullif(f.gcash_account_name, '')),
      gcash_number = coalesce(nullif(p.gcash_number, ''), nullif(f.gcash_number, '')),
      gcash_qr_url = coalesce(nullif(p.gcash_qr_url, ''), nullif(f.gcash_qr_url, ''))
    from public.farmers f
    where p.id = f.id
      and p.role = 'farmer'
      and (
        p.farm_name is null or p.farm_name = ''
        or p.birthday is null
        or p.gov_id_file_url is null or p.gov_id_file_url = ''
        or p.verification_status is null
        or p.verified_at is null
        or p.gcash_account_name is null or p.gcash_account_name = ''
        or p.gcash_number is null or p.gcash_number = ''
        or p.gcash_qr_url is null or p.gcash_qr_url = ''
      );
  end if;

  if to_regclass('public.stakeholders') is not null then
    update public.profiles p
    set
      organization_name = coalesce(nullif(p.organization_name, ''), nullif(s.organization_name, '')),
      organization_type = coalesce(nullif(p.organization_type, ''), nullif(s.organization_type, '')),
      contact_person = coalesce(nullif(p.contact_person, ''), nullif(s.contact_person, '')),
      accreditation_file_url = coalesce(nullif(p.accreditation_file_url, ''), nullif(s.accreditation_file_url, '')),
      organization_description = coalesce(nullif(p.organization_description, ''), nullif(s.organization_description, '')),
      barangay = coalesce(nullif(p.barangay, ''), nullif(s.barangay, '')),
      partnership_description = coalesce(nullif(p.partnership_description, ''), nullif(s.partnership_description, '')),
      verification_status = coalesce(p.verification_status, s.verification_status),
      verification_acknowledged = case
        when p.verification_status is null and s.verification_status is not null
          then s.verification_acknowledged
        else p.verification_acknowledged
      end,
      verified_at = coalesce(p.verified_at, s.verified_at)
    from public.stakeholders s
    where p.id = s.id
      and p.role = 'stakeholder'
      and (
        p.organization_name is null or p.organization_name = ''
        or p.organization_type is null or p.organization_type = ''
        or p.contact_person is null or p.contact_person = ''
        or p.accreditation_file_url is null or p.accreditation_file_url = ''
        or p.organization_description is null or p.organization_description = ''
        or p.barangay is null or p.barangay = ''
        or p.partnership_description is null or p.partnership_description = ''
        or p.verification_status is null
        or p.verified_at is null
      );
  end if;
end $$;

do $$
declare
  mismatched_role_rows bigint;
begin
  if to_regclass('public.farmers') is not null then
    select count(*) into mismatched_role_rows
    from public.farmers f
    left join public.profiles p on p.id = f.id and p.role = 'farmer'
    where p.id is null;
    if mismatched_role_rows > 0 then
      raise exception 'Cannot consolidate: % farmer extension rows have no matching farmer profile.', mismatched_role_rows;
    end if;
  end if;

  if to_regclass('public.buyers') is not null then
    select count(*) into mismatched_role_rows
    from public.buyers b
    left join public.profiles p on p.id = b.id and p.role = 'buyer'
    where p.id is null;
    if mismatched_role_rows > 0 then
      raise exception 'Cannot consolidate: % buyer extension rows have no matching buyer profile.', mismatched_role_rows;
    end if;
  end if;

  if to_regclass('public.stakeholders') is not null then
    select count(*) into mismatched_role_rows
    from public.stakeholders s
    left join public.profiles p on p.id = s.id and p.role = 'stakeholder'
    where p.id is null;
    if mismatched_role_rows > 0 then
      raise exception 'Cannot consolidate: % stakeholder extension rows have no matching stakeholder profile.', mismatched_role_rows;
    end if;
  end if;
end $$;

drop trigger if exists profiles_role_tables_trigger on public.profiles;
drop function if exists public.sync_profile_role_table();

notify pgrst, 'reload schema';

commit;
