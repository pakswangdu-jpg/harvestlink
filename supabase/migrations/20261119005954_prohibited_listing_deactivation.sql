begin;

alter table public.account_admin_events alter column admin_id drop not null;
alter table public.account_admin_events drop constraint if exists account_admin_events_action_check;
alter table public.account_admin_events add constraint account_admin_events_action_check check (
  action in (
    'USER_VERIFIED',
    'USER_VERIFICATION_REJECTED',
    'USER_DEACTIVATED',
    'USER_REACTIVATED',
    'USER_AUTO_SUSPENDED',
    'USER_AUTO_DEACTIVATED'
  )
);
alter table public.account_admin_events drop constraint if exists account_admin_events_actor_check;
alter table public.account_admin_events add constraint account_admin_events_actor_check check (
  (action in ('USER_AUTO_SUSPENDED', 'USER_AUTO_DEACTIVATED') and admin_id is null)
  or (action not in ('USER_AUTO_SUSPENDED', 'USER_AUTO_DEACTIVATED') and admin_id is not null)
);

create or replace function public.deactivate_for_prohibited_listing(
  p_user_id uuid,
  p_product_id uuid,
  p_listing_name text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles;
  listing_label text;
  event_reason text;
begin
  perform pg_advisory_xact_lock(76349122);
  select * into target from public.profiles where id = p_user_id for update;
  if target.id is null or target.role <> 'farmer' then
    raise exception 'An active farmer account is required.' using errcode = '42501';
  end if;

  if p_product_id is not null and not exists (
    select 1 from public.products where id = p_product_id and farmer_id = p_user_id
  ) then
    raise exception 'The product does not belong to this farmer.' using errcode = '42501';
  end if;

  if target.account_status <> 'active' then
    return false;
  end if;

  listing_label := left(regexp_replace(coalesce(nullif(btrim(p_listing_name), ''), 'Unnamed listing'), '[[:cntrl:]]', ' ', 'g'), 120);
  event_reason := 'A product listing contained explicit marijuana/cannabis-related text: ' || listing_label;

  update public.profiles
  set account_status = 'suspended', updated_at = now()
  where id = p_user_id;

  update public.products
  set status = 'inactive', updated_at = now()
  where farmer_id = p_user_id and status <> 'inactive';

  insert into public.account_admin_events(admin_id, user_id, action, reason, previous_value, new_value)
  values(null, p_user_id, 'USER_AUTO_DEACTIVATED', event_reason, 'active', 'suspended');

  insert into public.notifications(user_id, type, title, message, link)
  values(
    p_user_id,
    'profile',
    'Account deactivated',
    'Your account was automatically deactivated because a product listing contained explicit marijuana/cannabis-related terms prohibited by HarvestLink policy. Contact HarvestLink support if you believe this is a mistake.',
    '/profile'
  );

  return true;
end;
$$;

revoke all on function public.deactivate_for_prohibited_listing(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.deactivate_for_prohibited_listing(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
commit;
