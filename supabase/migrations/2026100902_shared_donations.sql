-- Shared donation handoffs. Only the authenticated backend may mutate these rows.
begin;

create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit text not null,
  quantity numeric(12,2) not null check (quantity > 0),
  location text not null,
  image_url text,
  expiration_date date,
  farmer_id uuid not null references public.profiles(id),
  farmer_name text not null,
  restore_status text not null check (restore_status in ('active', 'inactive')),
  status text not null default 'available' check (status in ('available','requested','scheduled','completed','cancelled')),
  requested_by_id uuid references public.profiles(id),
  requested_by_name text,
  pickup_date date,
  rated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('requested','scheduled','completed') or requested_by_id is not null),
  check (status not in ('scheduled','completed') or pickup_date is not null)
);
create index if not exists donations_farmer_idx on public.donations(farmer_id, created_at desc);
create index if not exists donations_recipient_idx on public.donations(requested_by_id, created_at desc);
create index if not exists donations_status_idx on public.donations(status, created_at desc);
alter table public.donations enable row level security;
revoke all on public.donations from anon, authenticated;
grant all on public.donations to service_role;

create or replace function public.create_surplus_donation(actor_id uuid, source_product_id uuid)
returns public.donations
language plpgsql set search_path = public
as $$
declare
  actor public.profiles;
  product public.products;
  donation public.donations;
begin
  select * into actor from public.profiles where id = actor_id for share;
  if not found or actor.role <> 'farmer' or actor.account_status <> 'active' then
    raise exception 'Only active farmer accounts can list donations.' using errcode = '42501';
  end if;
  select * into product from public.products where id = source_product_id for update;
  if not found then raise exception 'Product was not found.' using errcode = 'P0002'; end if;
  if product.farmer_id <> actor_id then
    raise exception 'You cannot donate another farmer''s product.' using errcode = '42501';
  end if;
  if product.quantity <= 0 then
    raise exception 'This product has no remaining stock to donate.' using errcode = '23514';
  end if;
  if product.expiration_date < (now() at time zone 'Asia/Manila')::date then
    raise exception 'Expired produce cannot be donated.' using errcode = '23514';
  end if;
  insert into public.donations(product_id, product_name, unit, quantity, location, image_url,
    expiration_date, farmer_id, farmer_name, restore_status)
  values(product.id, product.name, product.unit, product.quantity, product.location, product.image_url,
    product.expiration_date, actor.id, actor.name, product.status)
  returning * into donation;
  update public.products set quantity = 0, status = 'inactive', updated_at = now() where id = product.id;
  insert into public.notifications(user_id, type, title, message, link)
    select id, 'donation', 'New surplus donation available',
      actor.name || ' donated ' || donation.quantity || ' ' || donation.unit || ' of ' || donation.product_name || '.',
      '/stakeholder-donations'
    from public.profiles where role = 'stakeholder' and account_status = 'active' and verification_status = 'verified';
  return donation;
end $$;

create or replace function public.transition_surplus_donation(
  actor_id uuid, donation_id uuid, action_name text, scheduled_date date default null
)
returns public.donations
language plpgsql set search_path = public
as $$
declare
  actor public.profiles;
  donation public.donations;
  recipient uuid;
  notification_title text;
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
    donation.requested_by_id := actor.id;
    donation.requested_by_name := coalesce(nullif(actor.organization_name, ''), actor.name);
    recipient := donation.farmer_id;
    notification_title := 'Donation requested';
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
      donation.pickup_date := scheduled_date;
      notification_title := 'Donation pickup scheduled';
    else
      donation.status := 'available';
      donation.requested_by_id := null;
      donation.requested_by_name := null;
      notification_title := 'Donation request declined';
    end if;
  elsif action_name = 'receive' then
    if donation.status <> 'scheduled' then
      raise exception 'Only scheduled donations can be confirmed as received.' using errcode = '23514';
    end if;
    donation.status := 'completed';
    recipient := donation.farmer_id;
    notification_title := 'Donation received';
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
    recipient := donation.requested_by_id;
    notification_title := 'Donation cancelled';
    notification_link := '/stakeholder-requests';
  end if;

  update public.donations set status = donation.status, requested_by_id = donation.requested_by_id,
    requested_by_name = donation.requested_by_name, pickup_date = donation.pickup_date,
    rated = donation.rated, updated_at = now()
  where id = donation.id returning * into donation;
  if recipient is not null then
    insert into public.notifications(user_id, type, title, message, link)
    values(recipient, 'donation', notification_title, donation.product_name || ': ' || notification_title || '.', notification_link);
  end if;
  return donation;
end $$;

revoke all on function public.create_surplus_donation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.transition_surplus_donation(uuid, uuid, text, date) from public, anon, authenticated;
grant execute on function public.create_surplus_donation(uuid, uuid) to service_role;
grant execute on function public.transition_surplus_donation(uuid, uuid, text, date) to service_role;
notify pgrst, 'reload schema';
commit;
