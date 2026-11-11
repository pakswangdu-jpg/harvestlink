begin;

alter table public.donations
  add column if not exists pickup_status text not null default 'none'
    check (pickup_status in ('none', 'requested', 'accepted', 'awaiting_pickup', 'on_the_way', 'arrived', 'awaiting_confirmation', 'confirmed', 'cancelled')),
  add column if not exists current_lat double precision
    check (current_lat is null or (current_lat between -90 and 90)),
  add column if not exists current_lng double precision
    check (current_lng is null or (current_lng between -180 and 180)),
  add column if not exists current_accuracy double precision
    check (current_accuracy is null or current_accuracy >= 0),
  add column if not exists current_heading double precision
    check (current_heading is null or (current_heading >= 0 and current_heading <= 360)),
  add column if not exists current_speed double precision
    check (current_speed is null or current_speed >= 0),
  add column if not exists location_updated_at timestamptz,
  add column if not exists transit_started_at timestamptz,
  add column if not exists consecutive_arrival_readings integer not null default 0
    check (consecutive_arrival_readings >= 0),
  add column if not exists arrived_at timestamptz,
  add column if not exists arrival_notified_at timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists tracked_distance_km double precision not null default 0
    check (tracked_distance_km >= 0),
  add column if not exists tracked_duration_seconds double precision not null default 0
    check (tracked_duration_seconds >= 0);

alter table public.donation_claims
  add column if not exists pickup_status text not null default 'requested'
    check (pickup_status in ('none', 'requested', 'accepted', 'awaiting_pickup', 'on_the_way', 'arrived', 'awaiting_confirmation', 'confirmed', 'cancelled')),
  add column if not exists current_lat double precision
    check (current_lat is null or (current_lat between -90 and 90)),
  add column if not exists current_lng double precision
    check (current_lng is null or (current_lng between -180 and 180)),
  add column if not exists current_accuracy double precision
    check (current_accuracy is null or current_accuracy >= 0),
  add column if not exists current_heading double precision
    check (current_heading is null or (current_heading >= 0 and current_heading <= 360)),
  add column if not exists current_speed double precision
    check (current_speed is null or current_speed >= 0),
  add column if not exists location_updated_at timestamptz,
  add column if not exists transit_started_at timestamptz,
  add column if not exists consecutive_arrival_readings integer not null default 0
    check (consecutive_arrival_readings >= 0),
  add column if not exists arrived_at timestamptz,
  add column if not exists arrival_notified_at timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists tracked_distance_km double precision not null default 0
    check (tracked_distance_km >= 0),
  add column if not exists tracked_duration_seconds double precision not null default 0
    check (tracked_duration_seconds >= 0);

update public.donations
set pickup_status = case
  when status = 'requested' then 'requested'
  when status = 'scheduled' then 'awaiting_pickup'
  when status = 'completed' then 'confirmed'
  when status = 'cancelled' then 'cancelled'
  else 'none'
end
where pickup_status = 'none' and status in ('requested', 'scheduled', 'completed', 'cancelled');

update public.donation_claims
set pickup_status = case
  when status = 'pending' then 'requested'
  when status = 'scheduled' then 'awaiting_pickup'
  when status = 'completed' then 'confirmed'
  when status in ('rejected', 'cancelled') then 'cancelled'
  else pickup_status
end;

create or replace function public.claim_surplus_donation(
  actor_id uuid, target_donation_id uuid, requested_quantity numeric
)
returns public.donation_claims
language plpgsql security definer set search_path = public
as $$
declare
  actor public.profiles;
  donation public.donations;
  claim public.donation_claims;
begin
  perform public.expire_donations();
  select * into actor from public.profiles where id = actor_id for share;
  if not found or actor.role <> 'stakeholder' or actor.account_status <> 'active'
    or actor.verification_status is distinct from 'verified' then
    raise exception 'Your active, verified organization is required to claim donations.' using errcode = '42501';
  end if;
  if requested_quantity is null or requested_quantity < 1 or requested_quantity = 'NaN'::numeric
    or requested_quantity <> round(requested_quantity, 2) then
    raise exception 'Enter a positive donation quantity.' using errcode = '23514';
  end if;
  select * into donation from public.donations where id = target_donation_id for update;
  if not found then raise exception 'Donation was not found.' using errcode = 'P0002'; end if;
  if donation.status <> 'available' or donation.expiration_at is not null and donation.expiration_at <= now() then
    raise exception 'This donation is no longer available.' using errcode = '23514';
  end if;
  if requested_quantity > donation.available_quantity then
    raise exception using message = format('Only %s %s remains available.', donation.available_quantity, donation.unit), errcode = '23514';
  end if;
  if exists(select 1 from public.donation_claims where donation_id = donation.id and stakeholder_id = actor_id and status in ('pending','scheduled')) then
    raise exception 'You already have a pending claim for this donation.' using errcode = '23505';
  end if;
  insert into public.donation_claims(donation_id, stakeholder_id, stakeholder_name, quantity, pickup_status)
  values(donation.id, actor.id, coalesce(nullif(actor.organization_name, ''), actor.name), requested_quantity, 'requested')
  returning * into claim;
  update public.donations set available_quantity = available_quantity - requested_quantity,
    claimed_quantity = claimed_quantity + requested_quantity,
    status = case when available_quantity = requested_quantity then 'fully_claimed' else 'available' end,
    updated_at = now() where id = donation.id;
  insert into public.notifications(user_id, type, title, message, link)
  values(donation.farmer_id, 'donation', 'Donation claim received', claim.stakeholder_name || ' claimed ' || claim.quantity || ' ' || donation.unit || ' of ' || donation.product_name || '.', '/farmer-donations');
  return claim;
end;
$$;
revoke all on function public.claim_surplus_donation(uuid,uuid,numeric) from public, anon, authenticated;
grant execute on function public.claim_surplus_donation(uuid,uuid,numeric) to service_role;

create or replace function public.transition_surplus_donation(
  actor_id uuid,
  donation_id uuid,
  action_name text,
  scheduled_date date default null
)
returns public.donations
language plpgsql security definer set search_path = public
as $$
declare
  actor public.profiles;
  donation public.donations;
  recipient uuid;
  notification_title text;
  notification_message text;
  notification_link text;
begin
  select * into actor from public.profiles where id = actor_id for share;
  if not found or actor.account_status <> 'active' then
    raise exception 'An active account is required.' using errcode = '42501';
  end if;
  select * into donation from public.donations where id = donation_id for update;
  if not found then raise exception 'Donation was not found.' using errcode = 'P0002'; end if;

  if action_name in ('request','receive','rate') then
    if actor.role <> 'stakeholder' then
      raise exception 'Only stakeholder accounts can receive donations.' using errcode = '42501';
    end if;
    if action_name = 'request' and actor.verification_status is distinct from 'verified' then
      raise exception 'Your organization must be verified before requesting donations.' using errcode = '42501';
    end if;
    if action_name <> 'request' and donation.requested_by_id is distinct from actor.id then
      raise exception 'This donation belongs to another organization.' using errcode = '42501';
    end if;
  elsif action_name in ('schedule','decline','cancel') then
    if actor.role <> 'farmer' or donation.farmer_id <> actor.id then
      raise exception 'Only the donating farmer can manage this donation.' using errcode = '42501';
    end if;
  else
    raise exception 'Unknown donation action.' using errcode = '23514';
  end if;

  if action_name = 'request' then
    if donation.status <> 'available' then
      raise exception 'This donation is no longer available.' using errcode = '23514';
    end if;
    if donation.expiration_date < (now() at time zone 'Asia/Manila')::date then
      raise exception 'This donation has expired.' using errcode = '23514';
    end if;
    donation.status := 'requested';
    donation.pickup_status := 'requested';
    donation.requested_by_id := actor.id;
    donation.requested_by_name := coalesce(nullif(actor.organization_name, ''), actor.name);
    recipient := donation.farmer_id;
    notification_title := 'Donation requested';
    notification_message := donation.product_name || ': ' || notification_title || '.';
    notification_link := '/farmer-donations';
  elsif action_name in ('schedule','decline') then
    if donation.status <> 'requested' then
      raise exception 'Only requested donations can be accepted or declined.' using errcode = '23514';
    end if;
    recipient := donation.requested_by_id;
    notification_link := '/stakeholder-requests';
    if action_name = 'schedule' then
      if scheduled_date is null or scheduled_date < (now() at time zone 'Asia/Manila')::date then
        raise exception 'Choose a pickup date that is today or later.' using errcode = '22007';
      end if;
      if scheduled_date > donation.expiration_date then
        raise exception 'Pickup must be on or before the expiration date.' using errcode = '22007';
      end if;
      donation.status := 'scheduled';
      donation.pickup_status := 'awaiting_pickup';
      donation.pickup_date := scheduled_date;
      donation.current_lat := null;
      donation.current_lng := null;
      donation.current_accuracy := null;
      donation.current_heading := null;
      donation.current_speed := null;
      donation.location_updated_at := null;
      donation.consecutive_arrival_readings := 0;
      donation.arrived_at := null;
      donation.arrival_notified_at := null;
      donation.confirmed_at := null;
      notification_title := 'Donation request accepted';
      notification_message := donation.farmer_name || ' accepted your donation request for ' || donation.product_name || '. Live pickup tracking to the farm is now ready.';
    else
      donation.status := 'available';
      donation.pickup_status := 'none';
      donation.requested_by_id := null;
      donation.requested_by_name := null;
      notification_title := 'Donation request declined';
      notification_message := donation.product_name || ': ' || notification_title || '.';
    end if;
  elsif action_name = 'receive' then
    if donation.status <> 'scheduled' then
      raise exception 'Only scheduled donations can be confirmed as received.' using errcode = '23514';
    end if;
    donation.status := 'completed';
    donation.pickup_status := 'confirmed';
    donation.confirmed_at := coalesce(donation.confirmed_at, now());
    donation.current_lat := null;
    donation.current_lng := null;
    donation.current_accuracy := null;
    donation.current_heading := null;
    donation.current_speed := null;
    donation.location_updated_at := null;
    recipient := donation.farmer_id;
    notification_title := 'Donation received';
    notification_message := donation.product_name || ': ' || notification_title || '.';
    notification_link := '/farmer-donations';
  elsif action_name = 'rate' then
    if donation.status <> 'completed' then
      raise exception 'Only received donations can be rated.' using errcode = '23514';
    end if;
    donation.rated := true;
  elsif action_name = 'cancel' then
    if donation.status in ('completed','cancelled') then
      raise exception 'This donation can no longer be cancelled.' using errcode = '23514';
    end if;
    update public.products set quantity = quantity + donation.quantity,
      status = case when quantity = 0 and status = 'inactive' and price_review->>'status' is distinct from 'declined'
        then donation.restore_status else status end,
      updated_at = now()
    where id = donation.product_id;
    donation.status := 'cancelled';
    donation.pickup_status := 'cancelled';
    donation.current_lat := null;
    donation.current_lng := null;
    donation.current_accuracy := null;
    donation.current_heading := null;
    donation.current_speed := null;
    donation.location_updated_at := null;
    recipient := donation.requested_by_id;
    notification_title := 'Donation cancelled';
    notification_message := donation.product_name || ': ' || notification_title || '.';
    notification_link := '/stakeholder-requests';
  end if;

  update public.donations set
    status = donation.status,
    pickup_status = donation.pickup_status,
    requested_by_id = donation.requested_by_id,
    requested_by_name = donation.requested_by_name,
    pickup_date = donation.pickup_date,
    current_lat = donation.current_lat,
    current_lng = donation.current_lng,
    current_accuracy = donation.current_accuracy,
    current_heading = donation.current_heading,
    current_speed = donation.current_speed,
    location_updated_at = donation.location_updated_at,
    consecutive_arrival_readings = donation.consecutive_arrival_readings,
    arrived_at = donation.arrived_at,
    confirmed_at = donation.confirmed_at,
    rated = donation.rated,
    updated_at = now()
  where id = donation.id returning * into donation;

  if recipient is not null then
    insert into public.notifications(user_id, type, title, message, link)
    values(recipient, 'donation', notification_title, notification_message, notification_link);
  end if;
  return donation;
end $$;

revoke all on function public.transition_surplus_donation(uuid, uuid, text, date) from public, anon, authenticated;
grant execute on function public.transition_surplus_donation(uuid, uuid, text, date) to service_role;

create or replace function public.transition_surplus_donation_claim(
  actor_id uuid, target_claim_id uuid, action_name text, scheduled_date date default null
)
returns public.donation_claims
language plpgsql security definer set search_path = public
as $$
declare
  actor public.profiles;
  claim public.donation_claims;
  donation public.donations;
  next_donation_status text;
  recipient uuid;
begin
  perform public.expire_donations();
  select * into actor from public.profiles where id = actor_id for share;
  if not found or actor.account_status <> 'active' then
    raise exception 'An active account is required.' using errcode = '42501';
  end if;
  select * into claim from public.donation_claims where id = target_claim_id for update;
  if not found then raise exception 'Donation claim was not found.' using errcode = 'P0002'; end if;
  select * into donation from public.donations where id = claim.donation_id for update;
  if donation.status = 'expired' and action_name in ('schedule','cancel','reject') then
    raise exception 'This donation has expired.' using errcode = '23514';
  end if;

  if action_name = 'schedule' or action_name = 'reject' then
    if actor.role <> 'farmer' or donation.farmer_id <> actor.id or claim.status <> 'pending' then
      raise exception 'Only the donating farmer can review this claim.' using errcode = '42501';
    end if;
  elsif action_name = 'cancel' or action_name = 'receive' or action_name = 'rate' then
    if actor.role <> 'stakeholder' or claim.stakeholder_id <> actor.id then
      raise exception 'Only the claiming organization can manage this claim.' using errcode = '42501';
    end if;
  else
    raise exception 'Unknown donation claim action.' using errcode = '23514';
  end if;

  if action_name = 'schedule' then
    if scheduled_date is null or scheduled_date < (now() at time zone 'Asia/Manila')::date
      or (donation.expiration_at is not null and scheduled_date > (donation.expiration_at at time zone 'Asia/Manila')::date) then
      raise exception 'Choose a pickup date on or before the donation expiration.' using errcode = '22007';
    end if;
    update public.donation_claims set
      status = 'scheduled',
      pickup_status = 'awaiting_pickup',
      pickup_date = scheduled_date,
      current_lat = null,
      current_lng = null,
      current_accuracy = null,
      current_heading = null,
      current_speed = null,
      location_updated_at = null,
      consecutive_arrival_readings = 0,
      arrived_at = null,
      arrival_notified_at = null,
      confirmed_at = null,
      updated_at = now()
      where id = claim.id returning * into claim;
    recipient := claim.stakeholder_id;
    insert into public.notifications(user_id, type, title, message, link)
      values(recipient, 'donation', 'Donation request accepted', donation.farmer_name || ' accepted your donation request for ' || donation.product_name || ' (pickup scheduled for ' || scheduled_date || '). Live pickup tracking to the farm is now ready.', '/stakeholder-requests');
  elsif action_name = 'reject' or action_name = 'cancel' then
    update public.donation_claims set
      status = case when action_name = 'reject' then 'rejected' else 'cancelled' end,
      pickup_status = 'cancelled',
      current_lat = null,
      current_lng = null,
      current_accuracy = null,
      current_heading = null,
      current_speed = null,
      location_updated_at = null,
      updated_at = now()
      where id = claim.id returning * into claim;
    next_donation_status := case
      when donation.expiration_at is not null and donation.expiration_at <= now() then 'expired'
      when donation.available_quantity + claim.quantity >= donation.quantity then 'available'
      else 'available'
    end;
    update public.donations set available_quantity = available_quantity + claim.quantity,
      claimed_quantity = greatest(0, claimed_quantity - claim.quantity), status = next_donation_status, updated_at = now()
      where id = donation.id;
    recipient := case when action_name = 'reject' then claim.stakeholder_id else donation.farmer_id end;
    insert into public.notifications(user_id, type, title, message, link)
      values(recipient, 'donation', case when action_name = 'reject' then 'Donation claim declined' else 'Donation claim cancelled' end,
        donation.product_name || ': ' || case when action_name = 'reject' then 'the farmer declined your claim.' else 'the claim was cancelled.' end,
        case when action_name = 'reject' then '/stakeholder-requests' else '/farmer-donations' end);
  elsif action_name = 'receive' then
    if claim.status <> 'scheduled' then raise exception 'Only scheduled claims can be confirmed as received.' using errcode = '23514'; end if;
    update public.donation_claims set
      status = 'completed',
      pickup_status = 'confirmed',
      confirmed_at = coalesce(confirmed_at, now()),
      current_lat = null,
      current_lng = null,
      current_accuracy = null,
      current_heading = null,
      current_speed = null,
      location_updated_at = null,
      updated_at = now()
      where id = claim.id returning * into claim;
    recipient := donation.farmer_id;
    insert into public.notifications(user_id, type, title, message, link)
      values(recipient, 'donation', 'Donation received', claim.stakeholder_name || ' received ' || claim.quantity || ' ' || donation.unit || ' of ' || donation.product_name || '.', '/farmer-donations');
  elsif action_name = 'rate' then
    if claim.status <> 'completed' then raise exception 'You can only rate a received donation.' using errcode = '23514'; end if;
    if claim.rated then raise exception 'You already rated this donation.' using errcode = '23505'; end if;
    update public.donation_claims set rated = true, updated_at = now() where id = claim.id returning * into claim;
  end if;
  return claim;
end;
$$;
revoke all on function public.transition_surplus_donation_claim(uuid,uuid,text,date) from public, anon, authenticated;
grant execute on function public.transition_surplus_donation_claim(uuid,uuid,text,date) to service_role;

create or replace function public.confirm_surplus_donation_handover(
  actor_id uuid,
  target_donation_id uuid,
  target_claim_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  actor public.profiles;
  donation public.donations;
  claim public.donation_claims;
  recipient uuid;
begin
  select * into actor from public.profiles where id = actor_id for share;
  if not found or actor.role <> 'farmer' or actor.account_status <> 'active' then
    raise exception 'Only the donating farmer can confirm donation handover.' using errcode = '42501';
  end if;

  if target_claim_id is not null then
    select * into claim from public.donation_claims where id = target_claim_id for update;
    if not found then
      raise exception 'Donation claim was not found.' using errcode = 'P0002';
    end if;
    select * into donation from public.donations where id = claim.donation_id for update;
    if not found or donation.farmer_id <> actor.id then
      raise exception 'Only the donating farmer can confirm donation handover.' using errcode = '42501';
    end if;
    if claim.status = 'completed' or claim.pickup_status = 'confirmed' then
      raise exception 'Donation handover has already been confirmed.' using errcode = '23505';
    end if;
    if claim.status <> 'scheduled' then
      raise exception 'Only accepted and scheduled donations can be confirmed.' using errcode = '23514';
    end if;
    if claim.arrival_notified_at is null then
      raise exception 'The Stakeholder must poke the farmer to request handover confirmation first.' using errcode = '23514';
    end if;

    update public.donation_claims set
      status = 'completed',
      pickup_status = 'confirmed',
      confirmed_at = now(),
      current_lat = null,
      current_lng = null,
      current_accuracy = null,
      current_heading = null,
      current_speed = null,
      location_updated_at = null,
      updated_at = now()
    where id = claim.id returning * into claim;

    recipient := claim.stakeholder_id;
    insert into public.notifications(user_id, type, title, message, link)
    values(
      recipient,
      'donation',
      'Donation Confirmed',
      donation.farmer_name || ' confirmed the handover of ' || claim.quantity || ' ' || donation.unit || ' of ' || donation.product_name || '.',
      '/stakeholder-requests'
    );
    return to_jsonb(claim);
  else
    select * into donation from public.donations where id = target_donation_id for update;
    if not found then
      raise exception 'Donation was not found.' using errcode = 'P0002';
    end if;
    if donation.farmer_id <> actor.id then
      raise exception 'Only the donating farmer can confirm donation handover.' using errcode = '42501';
    end if;
    if donation.status = 'completed' or donation.pickup_status = 'confirmed' then
      raise exception 'Donation handover has already been confirmed.' using errcode = '23505';
    end if;
    if donation.status <> 'scheduled' then
      raise exception 'Only accepted and scheduled donations can be confirmed.' using errcode = '23514';
    end if;
    if donation.arrival_notified_at is null then
      raise exception 'The Stakeholder must poke the farmer to request handover confirmation first.' using errcode = '23514';
    end if;

    update public.donations set
      status = 'completed',
      pickup_status = 'confirmed',
      confirmed_at = now(),
      current_lat = null,
      current_lng = null,
      current_accuracy = null,
      current_heading = null,
      current_speed = null,
      location_updated_at = null,
      updated_at = now()
    where id = donation.id returning * into donation;

    recipient := donation.requested_by_id;
    if recipient is not null then
      insert into public.notifications(user_id, type, title, message, link)
      values(
        recipient,
        'donation',
        'Donation Confirmed',
        donation.farmer_name || ' confirmed the handover of ' || donation.quantity || ' ' || donation.unit || ' of ' || donation.product_name || '.',
        '/stakeholder-requests'
      );
    end if;
    return to_jsonb(donation);
  end if;
end;
$$;

revoke all on function public.confirm_surplus_donation_handover(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_surplus_donation_handover(uuid, uuid, uuid) to service_role;

notify pgrst, 'reload schema';
commit;
