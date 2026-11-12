begin;

update public.messages
set text = regexp_replace(
  regexp_replace(
    text,
    '([0-9]+)\.([0-9]*[1-9])0+([[:space:]]+)',
    E'\\1.\\2\\3',
    'g'
  ),
  '([0-9]+)\.0+([[:space:]]+)',
  E'\\1\\2',
  'g'
)
where message_type = 'system'
  and context_donation_id is not null
  and text ~ '[0-9]+\.[0-9]+[[:space:]]+';

create or replace function public.record_donation_claim_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  donation public.donations;
  event_sender uuid;
  event_recipient uuid;
  event_text text;
  thread_id uuid;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select * into donation
  from public.donations
  where id = new.donation_id;
  if not found then
    return new;
  end if;

  if tg_op = 'INSERT' and new.status = 'pending' then
    event_sender := new.stakeholder_id;
    event_recipient := donation.farmer_id;
    event_text := format('%s requested %s %s of %s. Awaiting farmer approval.',
      new.stakeholder_name, trim_scale(new.quantity)::text, donation.unit, donation.product_name);
  elsif new.status = 'scheduled' then
    event_sender := donation.farmer_id;
    event_recipient := new.stakeholder_id;
    event_text := format('Pickup scheduled for %s %s of %s on %s.',
      trim_scale(new.quantity)::text, donation.unit, donation.product_name, new.pickup_date);
  elsif new.status = 'rejected' then
    event_sender := donation.farmer_id;
    event_recipient := new.stakeholder_id;
    event_text := format('The farmer declined the claim for %s %s of %s.',
      trim_scale(new.quantity)::text, donation.unit, donation.product_name);
  elsif new.status = 'cancelled' then
    event_sender := new.stakeholder_id;
    event_recipient := donation.farmer_id;
    event_text := format('%s cancelled the claim for %s %s of %s.',
      new.stakeholder_name, trim_scale(new.quantity)::text, donation.unit, donation.product_name);
  elsif new.status = 'completed' then
    event_sender := new.stakeholder_id;
    event_recipient := donation.farmer_id;
    event_text := format('%s confirmed receipt of %s %s of %s.',
      new.stakeholder_name, trim_scale(new.quantity)::text, donation.unit, donation.product_name);
  elsif new.status = 'expired' then
    event_sender := new.stakeholder_id;
    event_recipient := donation.farmer_id;
    event_text := format('The claim for %s %s of %s expired.',
      trim_scale(new.quantity)::text, donation.unit, donation.product_name);
  else
    return new;
  end if;

  thread_id := public.ensure_direct_conversation(event_sender, event_recipient);
  insert into public.messages (
    conversation_id, recipient_id, sender_id, sender_name, sender_role, text, message_type,
    context_donation_id, context_donation_name, context_donation_image_url,
    context_donation_description, context_donation_quantity, context_donation_unit,
    context_donation_location, context_donation_expiration_at, context_donation_expiration_date, context_donation_farmer_id,
    context_donation_farmer_name, context_donation_status
  )
  values (
    thread_id, event_recipient, event_sender, 'HarvestLink', 'system', event_text, 'system',
    donation.id, donation.product_name, donation.image_url, donation.description,
    donation.available_quantity, donation.unit, donation.location, donation.expiration_at, donation.expiration_date,
    donation.farmer_id, donation.farmer_name, donation.status
  );

  return new;
end;
$$;

notify pgrst, 'reload schema';
commit;
