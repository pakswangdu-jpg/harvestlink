-- Unified direct conversations for product and donation inquiries.
-- Apply after the base schema, shared donations, and inventory messaging migrations.
begin;

create table if not exists public.direct_conversations (
  id uuid primary key default gen_random_uuid(),
  participant_one_id uuid not null references public.profiles(id) on delete cascade,
  participant_two_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint direct_conversations_distinct_participants check (participant_one_id < participant_two_id),
  constraint direct_conversations_pair_unique unique (participant_one_id, participant_two_id)
);

alter table public.messages add column if not exists conversation_id uuid
  references public.direct_conversations(id) on delete set null;

insert into public.direct_conversations (participant_one_id, participant_two_id)
select distinct least(sender_id, recipient_id), greatest(sender_id, recipient_id)
from public.messages
where recipient_id is not null and sender_id <> recipient_id
on conflict (participant_one_id, participant_two_id) do nothing;

insert into public.direct_conversations (participant_one_id, participant_two_id)
select distinct least(message.sender_id, party.other_id), greatest(message.sender_id, party.other_id)
from public.messages message
join public.orders order_row on order_row.id = message.order_id
cross join lateral (
  select case
    when message.sender_id = order_row.buyer_id then order_row.farmer_id
    when message.sender_id = order_row.farmer_id then order_row.buyer_id
    else null
  end as other_id
) party
where message.order_id is not null and party.other_id is not null and message.sender_id <> party.other_id
on conflict (participant_one_id, participant_two_id) do nothing;

update public.messages message
set conversation_id = conversation.id
from public.direct_conversations conversation
where message.conversation_id is null
  and message.recipient_id is not null
  and message.sender_id <> message.recipient_id
  and conversation.participant_one_id = least(message.sender_id, message.recipient_id)
  and conversation.participant_two_id = greatest(message.sender_id, message.recipient_id);

update public.messages message
set conversation_id = conversation.id
from public.orders order_row, public.direct_conversations conversation
where message.conversation_id is null
  and message.order_id = order_row.id
  and message.sender_id in (order_row.buyer_id, order_row.farmer_id)
  and conversation.participant_one_id = least(order_row.buyer_id, order_row.farmer_id)
  and conversation.participant_two_id = greatest(order_row.buyer_id, order_row.farmer_id);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

alter table public.donations add column if not exists description text;
update public.donations donation
set description = product.description
from public.products product
where donation.product_id = product.id and donation.description is null;

create or replace function public.snapshot_donation_description()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.description is null and new.product_id is not null then
    select product.description into new.description
    from public.products product
    where product.id = new.product_id;
  end if;
  return new;
end;
$$;

drop trigger if exists donations_snapshot_description on public.donations;
create trigger donations_snapshot_description
before insert on public.donations
for each row execute function public.snapshot_donation_description();

alter table public.messages add column if not exists context_donation_id uuid;
alter table public.messages add column if not exists context_donation_name text;
alter table public.messages add column if not exists context_donation_image_url text;
alter table public.messages add column if not exists context_donation_description text;
alter table public.messages add column if not exists context_donation_quantity numeric(12,2);
alter table public.messages add column if not exists context_donation_unit text;
alter table public.messages add column if not exists context_donation_location text;
alter table public.messages add column if not exists context_donation_expiration_at timestamptz;
alter table public.messages add column if not exists context_donation_expiration_date date;
alter table public.messages add column if not exists context_donation_farmer_id uuid;
alter table public.messages add column if not exists context_donation_farmer_name text;
alter table public.messages add column if not exists context_donation_status text;

create index if not exists messages_context_donation_idx
  on public.messages (context_donation_id, sender_id, recipient_id, created_at)
  where context_donation_id is not null;

alter table public.messages drop constraint if exists messages_message_type_check;
alter table public.messages add constraint messages_message_type_check
  check (message_type in ('text', 'image', 'file', 'system'));

create or replace function public.ensure_direct_conversation(user_a uuid, user_b uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_id uuid;
begin
  if user_a is null or user_b is null or user_a = user_b then
    raise exception 'A conversation requires two different participants.' using errcode = '23514';
  end if;

  insert into public.direct_conversations (participant_one_id, participant_two_id)
  values (least(user_a, user_b), greatest(user_a, user_b))
  on conflict (participant_one_id, participant_two_id)
  do update set updated_at = now()
  returning id into conversation_id;

  return conversation_id;
end;
$$;
revoke all on function public.ensure_direct_conversation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ensure_direct_conversation(uuid, uuid) to service_role;

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
      new.stakeholder_name, new.quantity, donation.unit, donation.product_name);
  elsif new.status = 'scheduled' then
    event_sender := donation.farmer_id;
    event_recipient := new.stakeholder_id;
    event_text := format('Pickup scheduled for %s %s of %s on %s.',
      new.quantity, donation.unit, donation.product_name, new.pickup_date);
  elsif new.status = 'rejected' then
    event_sender := donation.farmer_id;
    event_recipient := new.stakeholder_id;
    event_text := format('The farmer declined the claim for %s %s of %s.',
      new.quantity, donation.unit, donation.product_name);
  elsif new.status = 'cancelled' then
    event_sender := new.stakeholder_id;
    event_recipient := donation.farmer_id;
    event_text := format('%s cancelled the claim for %s %s of %s.',
      new.stakeholder_name, new.quantity, donation.unit, donation.product_name);
  elsif new.status = 'completed' then
    event_sender := new.stakeholder_id;
    event_recipient := donation.farmer_id;
    event_text := format('%s confirmed receipt of %s %s of %s.',
      new.stakeholder_name, new.quantity, donation.unit, donation.product_name);
  elsif new.status = 'expired' then
    event_sender := new.stakeholder_id;
    event_recipient := donation.farmer_id;
    event_text := format('The claim for %s %s of %s expired.',
      new.quantity, donation.unit, donation.product_name);
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

drop trigger if exists donation_claim_message_events on public.donation_claims;
create trigger donation_claim_message_events
after insert or update of status on public.donation_claims
for each row execute function public.record_donation_claim_message();

alter table public.direct_conversations enable row level security;
drop policy if exists direct_conversations_select_participant on public.direct_conversations;
create policy direct_conversations_select_participant on public.direct_conversations
  for select to authenticated
  using ((select auth.uid()) in (participant_one_id, participant_two_id));

alter table public.messages enable row level security;
drop policy if exists messages_select_participant on public.messages;
create policy messages_select_participant on public.messages
  for select to authenticated
  using (
    exists (
      select 1
      from public.direct_conversations conversation
      where conversation.id = messages.conversation_id
        and (select auth.uid()) in (conversation.participant_one_id, conversation.participant_two_id)
    )
    or (
      messages.conversation_id is null
      and (
        (messages.recipient_id is not null and (select auth.uid()) in (messages.sender_id, messages.recipient_id))
        or exists (
          select 1 from public.orders order_row
          where order_row.id = messages.order_id
            and (select auth.uid()) in (order_row.buyer_id, order_row.farmer_id)
        )
      )
    )
  );

revoke all on public.direct_conversations from anon, authenticated;
grant select on public.direct_conversations to authenticated;
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant all on public.direct_conversations, public.messages to service_role;

do $$
declare
  realtime_exists boolean;
  realtime_table_exists boolean;
begin
  if to_regclass('pg_catalog.pg_publication') is null then
    return;
  end if;
  execute 'select exists (select 1 from pg_catalog.pg_publication where pubname = $1)'
    into realtime_exists using 'supabase_realtime';
  if realtime_exists then
    execute 'select exists (select 1 from pg_catalog.pg_publication_tables where pubname = $1 and schemaname = $2 and tablename = $3)'
      into realtime_table_exists using 'supabase_realtime', 'public', 'messages';
  end if;
  if realtime_exists and not realtime_table_exists then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
