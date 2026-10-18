begin;

-- Apply after 20261010_admin_account_history.sql. No existing accounts are changed here.
alter table public.profiles add column if not exists inactivity_suspended_at timestamptz;
alter table public.account_admin_events alter column admin_id drop not null;
alter table public.account_admin_events drop constraint if exists account_admin_events_action_check;
alter table public.account_admin_events add constraint account_admin_events_action_check check (
  action in ('USER_VERIFIED','USER_VERIFICATION_REJECTED','USER_DEACTIVATED','USER_REACTIVATED','USER_AUTO_SUSPENDED')
);
alter table public.account_admin_events drop constraint if exists account_admin_events_actor_check;
alter table public.account_admin_events add constraint account_admin_events_actor_check check (
  (action = 'USER_AUTO_SUSPENDED' and admin_id is null)
  or (action <> 'USER_AUTO_SUSPENDED' and admin_id is not null)
);

-- Profile edits must not bypass suspension by forging activity or the Admin exemption.
create or replace function public.guard_profile_inactivity_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon','authenticated') then
    if tg_op = 'INSERT' then
      raise exception 'Create accounts through HarvestLink registration.' using errcode = '42501';
    elsif new.id is distinct from old.id or new.role is distinct from old.role
      or new.account_status is distinct from old.account_status
      or new.last_active_at is distinct from old.last_active_at
      or new.created_at is distinct from old.created_at
      or new.inactivity_suspended_at is distinct from old.inactivity_suspended_at then
      raise exception 'Account status and activity are managed by HarvestLink.' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.account_status = 'active' then
    new.inactivity_suspended_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_profile_inactivity_fields() from public, anon, authenticated;
drop trigger if exists guard_profile_inactivity_fields on public.profiles;
create trigger guard_profile_inactivity_fields before insert or update on public.profiles
  for each row execute function public.guard_profile_inactivity_fields();

create or replace function public.suspend_inactive_accounts(
  p_user uuid default null, p_checked_at timestamptz default now()
) returns table(user_id uuid)
language plpgsql security definer set search_path = public set timezone = 'Asia/Manila'
as $$
declare
  target public.profiles;
begin
  if p_checked_at is null or not isfinite(p_checked_at) then
    raise exception 'A valid inactivity check time is required.' using errcode = '22023';
  end if;
  -- Use the same lock as Admin changes, so reactivation and the sweep cannot race.
  perform pg_advisory_xact_lock(76349122);
  for target in
    select p.* from public.profiles p
    where p.account_status = 'active' and p.role in ('buyer','farmer','stakeholder')
      and (p_user is null or p.id = p_user)
      and greatest(p.last_active_at, p.created_at, (
        select max(e.occurred_at) from public.account_admin_events e
        where e.user_id = p.id and e.action = 'USER_REACTIVATED'
      )) + interval '6 months' <= p_checked_at
    order by p.id for update of p limit 500
  loop
    update public.profiles set account_status = 'suspended', inactivity_suspended_at = p_checked_at,
      updated_at = p_checked_at where id = target.id;
    insert into public.account_admin_events(admin_id,user_id,action,occurred_at,reason,previous_value,new_value)
      values(null,target.id,'USER_AUTO_SUSPENDED',p_checked_at,'Six months of inactivity.','active','suspended');
    insert into public.notifications(user_id,type,title,message,link)
      values(target.id,'verification','Account suspended for inactivity',
        'Your account was suspended after six months of inactivity. Contact Admin to request reactivation.','/profile');
    insert into public.notifications(user_id,type,title,message,link)
      select id,'verification','Inactive account suspended',
        target.name || ' was automatically suspended after six months of inactivity.','/admin-users'
      from public.profiles where role = 'admin' and account_status = 'active';
    user_id := target.id;
    return next;
  end loop;
end;
$$;
revoke all on function public.suspend_inactive_accounts(uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.suspend_inactive_accounts(uuid,timestamptz) to service_role;

-- When Supabase Cron is enabled, this also runs while the API host is asleep.
do $$
begin
  if exists(select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('harvestlink-six-month-inactivity', '0 * * * *',
      'select public.suspend_inactive_accounts();');
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
