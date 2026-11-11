begin;

alter table public.donations
  add column if not exists arrival_notified_at timestamptz;

alter table public.donation_claims
  add column if not exists arrival_notified_at timestamptz;

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
