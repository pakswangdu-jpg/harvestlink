begin;
alter table public.profiles add column if not exists verification_rejection_reason text;
create table if not exists public.account_admin_events (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id),
  user_id uuid not null references public.profiles(id),
  action text not null check (action in ('USER_VERIFIED','USER_VERIFICATION_REJECTED','USER_DEACTIVATED','USER_REACTIVATED')),
  occurred_at timestamptz not null default now(),
  reason text,
  previous_value text,
  new_value text not null
);
create index if not exists account_admin_events_user_idx on public.account_admin_events(user_id, occurred_at desc);
alter table public.account_admin_events enable row level security;
revoke all on public.account_admin_events from public, anon, authenticated, service_role;
grant select, insert on public.account_admin_events to service_role;

create or replace function public.manage_admin_account(p_actor uuid, p_user uuid, p_kind text, p_status text, p_reason text default null, p_expected text default null)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare actor public.profiles; target public.profiles; old_value text; event_action text;
begin
  -- Serialize admin account operations to protect the active-admin invariant.
  perform pg_advisory_xact_lock(76349122);
  select * into actor from public.profiles where id = p_actor for update;
  if actor.id is null or actor.role <> 'admin' or actor.account_status <> 'active' then raise exception 'Active admin access required.' using errcode = '42501'; end if;
  select * into target from public.profiles where id = p_user for update;
  if target.id is null then raise exception 'Account was not found.' using errcode = 'P0002'; end if;
  p_reason := nullif(btrim(p_reason), '');
  if length(p_reason) > 500 then raise exception 'Reason must be 500 characters or fewer.' using errcode = '22023'; end if;
  if p_kind = 'verification' then
    if target.role not in ('farmer','stakeholder') or p_status not in ('verified','rejected') or p_status is null then raise exception 'Invalid verification action.' using errcode = '22023'; end if;
    old_value := target.verification_status;
    if p_status = 'rejected' and p_reason is null then raise exception 'Provide a verification rejection reason.' using errcode = '22023'; end if;
    event_action := case when p_status = 'verified' then 'USER_VERIFIED' else 'USER_VERIFICATION_REJECTED' end;
  elsif p_kind = 'account' then
    if p_status not in ('active','suspended') or p_status is null then raise exception 'Invalid account status.' using errcode = '22023'; end if;
    old_value := target.account_status;
    if p_status = 'suspended' and target.id = actor.id then raise exception 'You cannot deactivate your own admin account.' using errcode = '42501'; end if;
    if p_status = 'suspended' and target.role = 'admin' and (select count(*) from public.profiles where role = 'admin' and account_status = 'active') <= 1 then raise exception 'The last active admin cannot be deactivated.' using errcode = '23514'; end if;
    event_action := case when p_status = 'active' then 'USER_REACTIVATED' else 'USER_DEACTIVATED' end;
  else raise exception 'Invalid account action.' using errcode = '22023'; end if;
  if p_expected is not null and old_value is distinct from p_expected then raise exception 'Account changed. Refresh before trying again.' using errcode = '23514'; end if;
  if old_value = p_status then return target; end if;
  if p_kind = 'verification' then
    update public.profiles set verification_status = p_status,
      verified_at = case when p_status = 'verified' then now() else verified_at end,
      verification_rejection_reason = case when p_status = 'rejected' then p_reason else null end,
      verification_acknowledged = false, updated_at = now() where id = p_user returning * into target;
    insert into public.notifications(user_id,type,title,message,link) values(p_user,'verification',
      case when p_status = 'verified' then 'Account verified' else 'Verification declined' end,
      case when p_status = 'verified' then 'Your account has been approved by admin. Verified marketplace privileges are available for your role.' else 'Your account verification was declined: ' || p_reason end, '/profile');
  else
    update public.profiles set account_status = p_status, updated_at = now() where id = p_user returning * into target;
  end if;
  insert into public.account_admin_events(admin_id,user_id,action,reason,previous_value,new_value) values(p_actor,p_user,event_action,p_reason,old_value,p_status);
  return target;
end $$;
revoke all on function public.manage_admin_account(uuid,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.manage_admin_account(uuid,uuid,text,text,text,text) to service_role;
notify pgrst, 'reload schema';
commit;
