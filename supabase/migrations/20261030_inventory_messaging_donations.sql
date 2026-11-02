-- Atomic marketplace reservations, product-aware messaging, and expiring donation claims.
-- Apply after the existing HarvestLink migrations. This file is rerunnable.
begin;

-- ---------------------------------------------------------------------------
-- Product inventory ledger
-- ---------------------------------------------------------------------------
alter table public.products add column if not exists reserved_quantity numeric(12,2) not null default 0;
alter table public.products add column if not exists sold_quantity numeric(12,2) not null default 0;
alter table public.products drop constraint if exists products_reserved_quantity_check;
alter table public.products add constraint products_reserved_quantity_check check (reserved_quantity >= 0);
alter table public.products drop constraint if exists products_sold_quantity_check;
alter table public.products add constraint products_sold_quantity_check check (sold_quantity >= 0);

alter table public.orders add column if not exists stock_state text not null default 'legacy';
alter table public.orders drop constraint if exists orders_stock_state_check;
alter table public.orders add constraint orders_stock_state_check
  check (stock_state in ('pending', 'reserved', 'released', 'sold', 'legacy'));

-- Existing confirmed orders already deducted product.quantity under the old rule.
-- Mark them as reserved/sold so future cancellation/completion transitions remain safe.
update public.orders
set stock_state = case
  when status = 'completed' then 'sold'
  when status = 'confirmed' then 'reserved'
  when status in ('rejected', 'cancelled') then 'released'
  else 'pending'
end
where stock_state = 'legacy';

do $$
begin
  if not exists (select 1 from public.products where reserved_quantity > 0 or sold_quantity > 0) then
    update public.products p set
      reserved_quantity = coalesce((select sum(o.quantity) from public.orders o where o.product_id = p.id and o.status = 'confirmed'), 0),
      sold_quantity = coalesce((select sum(o.quantity) from public.orders o where o.product_id = p.id and o.status = 'completed'), 0)
    where exists (select 1 from public.orders o where o.product_id = p.id and o.status in ('confirmed', 'completed'));
  end if;
end;
$$;

create index if not exists products_inventory_idx on public.products (id, quantity, reserved_quantity, sold_quantity);
create index if not exists orders_stock_state_idx on public.orders (product_id, stock_state);

-- A single transaction locks the product, reserves stock, validates the server-computed
-- price/total, inserts the order, and writes its first timeline event.
create or replace function public.create_marketplace_order(p_actor uuid, p_order jsonb)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  actor public.profiles;
  farmer public.profiles;
  listing public.products;
  existing_order public.orders;
  created_order public.orders;
  product_id_value uuid := nullif(p_order->>'product_id', '')::uuid;
  quantity_value numeric := nullif(p_order->>'quantity', '')::numeric;
  delivery_fee_value numeric := coalesce(nullif(p_order->>'delivery_fee', '')::numeric, 0);
  unit_price_value numeric := nullif(p_order->>'unit_price', '')::numeric;
  total_value numeric := nullif(p_order->>'total_amount', '')::numeric;
  expected_unit_price numeric;
  expected_total numeric;
  checkout_key_value uuid := nullif(p_order->>'checkout_key', '')::uuid;
  fingerprint_value text := nullif(p_order->>'checkout_fingerprint', '');
  message_value text := coalesce(p_order->>'message', '');
  stock_state_value text := 'reserved';
begin
  select * into actor from public.profiles where id = p_actor for share;
  if not found or actor.account_status <> 'active' or actor.role not in ('buyer', 'stakeholder') then
    raise exception 'This account cannot place orders.' using errcode = '42501';
  end if;

  if checkout_key_value is not null then
    select * into existing_order from public.orders
    where buyer_id = p_actor and checkout_key = checkout_key_value;
    if found then
      if existing_order.checkout_fingerprint is distinct from fingerprint_value then
        raise exception 'This checkout request was already used for another order.' using errcode = '23505';
      end if;
      return existing_order;
    end if;
  end if;

  if product_id_value is null or quantity_value is null or quantity_value <= 0
    or quantity_value = 'NaN'::numeric or quantity_value <> round(quantity_value, 2) then
    raise exception 'Enter a valid order quantity.' using errcode = '23514';
  end if;
  if length(message_value) > 200 then
    raise exception 'Order notes must be 200 characters or fewer.' using errcode = '23514';
  end if;

  select * into listing from public.products where id = product_id_value for update;
  if not found or listing.status <> 'active' or listing.quantity <= 0
    or listing.quantity < quantity_value
    or listing.quantity = 'NaN'::numeric then
    raise exception 'Requested quantity is no longer available.' using errcode = '23514';
  end if;
  if listing.price_review->>'status' in ('pending', 'needs_adjustment', 'declined') then
    raise exception 'This product cannot be ordered while its price is under review.' using errcode = '23514';
  end if;
  if listing.expiration_date is not null and listing.expiration_date < (now() at time zone 'Asia/Manila')::date then
    raise exception 'This product has expired.' using errcode = '23514';
  end if;
  if listing.farmer_id = p_actor then
    raise exception 'You cannot order your own product.' using errcode = '42501';
  end if;
  if listing.selling_type = 'wholesale' and listing.moq is not null and quantity_value < listing.moq then
    raise exception using message = format('Minimum order quantity is %s %s.', listing.moq, listing.unit), errcode = '23514';
  end if;

  expected_unit_price := case
    when listing.selling_type = 'wholesale'
      and listing.wholesale_price is not null
      and listing.wholesale_min_quantity is not null
      and quantity_value >= listing.wholesale_min_quantity
      then listing.wholesale_price
    else listing.price
  end;
  if unit_price_value is null or round(unit_price_value, 2) <> round(expected_unit_price, 2) then
    raise exception 'The product price changed. Refresh the order and try again.' using errcode = '23514';
  end if;
  expected_total := round(expected_unit_price * quantity_value + delivery_fee_value, 2);
  if delivery_fee_value < 0 or total_value is null or round(total_value, 2) <> expected_total then
    raise exception 'The order total changed. Refresh the order and try again.' using errcode = '23514';
  end if;
  if p_order->>'payment_method' not in ('cod', 'gcash')
    or p_order->>'delivery_method' not in ('farmer_delivery', 'buyer_pickup', 'courier') then
    raise exception 'Choose a valid payment and delivery method.' using errcode = '23514';
  end if;

  select * into farmer from public.profiles where id = listing.farmer_id for share;
  if not found or farmer.account_status = 'suspended' then
    raise exception 'This farmer is not currently accepting orders.' using errcode = '23514';
  end if;
  if p_order->>'payment_method' = 'gcash'
    and (farmer.gcash_account_name is null or farmer.gcash_qr_url is null) then
    raise exception 'This farmer has not finished setting up GCash payments. Please choose COD.' using errcode = '23514';
  end if;

  update public.products
  set quantity = quantity - quantity_value,
      reserved_quantity = reserved_quantity + quantity_value,
      status = case when quantity = quantity_value then 'inactive' else status end,
      updated_at = now()
  where id = listing.id;

  insert into public.orders(
    product_id, product_name, product_image_url, unit, unit_price, unit_cost_price,
    farmer_id, farmer_name, farmer_avatar_url, farmer_farm_name, farmer_verification_status,
    buyer_id, buyer_name, buyer_avatar_url, quantity, delivery_fee, delivery_distance_km,
    delivery_duration_minutes, delivery_fee_tier, total_amount, checkout_key, checkout_fingerprint,
    message, payment_method, payment_status, delivery_method, delivery_status,
    origin_municipality, delivery_municipality, status, stock_state, created_at, updated_at
  ) values (
    listing.id, listing.name, listing.image_url, listing.unit, expected_unit_price, listing.cost_price,
    listing.farmer_id, coalesce(farmer.name, 'Local farmer'), farmer.avatar_url, farmer.farm_name,
    farmer.verification_status, actor.id, actor.name, actor.avatar_url, quantity_value, delivery_fee_value,
    nullif(p_order->>'delivery_distance_km', '')::numeric,
    nullif(p_order->>'delivery_duration_minutes', '')::numeric,
    nullif(p_order->>'delivery_fee_tier', ''), total_value, checkout_key_value, fingerprint_value,
    message_value, p_order->>'payment_method', 'pending', p_order->>'delivery_method', 'pending',
    p_order->>'origin_municipality', p_order->>'delivery_municipality', 'pending', stock_state_value,
    coalesce(nullif(p_order->>'created_at', '')::timestamptz, now()), now()
  ) returning * into created_order;

  insert into public.order_delivery_events(order_id, status, title, description, source)
  values(created_order.id, 'pending', 'Order placed', 'Your order has been placed and the requested stock is reserved.', 'system');

  return created_order;
end;
$$;
revoke all on function public.create_marketplace_order(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_marketplace_order(uuid, jsonb) to service_role;

-- Replace the old confirmation-time deduction with reservation release logic. New orders are
-- already reserved; legacy pending orders are reserved here once so old records remain usable.
create or replace function public.transition_marketplace_order(
  p_actor uuid, p_order uuid, p_action text, p_reason text default null
) returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  target public.orders;
  listing public.products;
  reason text := nullif(btrim(p_reason), '');
  next_stock_state text;
begin
  if not exists(select 1 from public.profiles where id = p_actor and account_status = 'active') then
    raise exception 'This account cannot modify orders.' using errcode = '42501';
  end if;
  select * into target from public.orders where id = p_order for update;
  if not found then raise exception 'Order was not found.' using errcode = 'P0002'; end if;
  next_stock_state := target.stock_state;

  if p_action in ('confirmed', 'rejected') then
    if target.farmer_id <> p_actor then raise exception 'Only the farmer can review this order.' using errcode = '42501'; end if;
    if target.status <> 'pending' then raise exception 'This order has already been reviewed.' using errcode = '23514'; end if;
  elsif p_action = 'cancelled' then
    if target.buyer_id <> p_actor then raise exception 'Only the buyer can cancel this order.' using errcode = '42501'; end if;
    if not (target.status = 'pending' or (target.status = 'confirmed' and target.delivery_status = 'pending')) then
      raise exception 'This order can no longer be cancelled.' using errcode = '23514';
    end if;
  else
    raise exception 'Invalid order action.' using errcode = '23514';
  end if;
  if length(reason) > 500 then raise exception 'Reason must be 500 characters or fewer.' using errcode = '23514'; end if;

  if p_action = 'confirmed' and target.stock_state = 'pending' then
    select * into listing from public.products where id = target.product_id for update;
    if not found or listing.quantity < target.quantity then
      raise exception 'Requested quantity is no longer available.' using errcode = '23514';
    end if;
    update public.products set quantity = quantity - target.quantity,
      reserved_quantity = reserved_quantity + target.quantity,
      status = case when quantity = target.quantity then 'inactive' else status end,
      updated_at = now() where id = listing.id;
    next_stock_state := 'reserved';
  elsif p_action in ('rejected', 'cancelled') and target.stock_state = 'reserved' then
    select * into listing from public.products where id = target.product_id for update;
    if found then
      update public.products set quantity = quantity + target.quantity,
        reserved_quantity = greatest(0, reserved_quantity - target.quantity),
        status = case when status = 'inactive' and quantity = 0
          and coalesce(price_review->>'status','') <> 'declined'
          and (expiration_date is null or expiration_date >= (now() at time zone 'Asia/Manila')::date)
          then 'active' else status end,
        updated_at = now() where id = listing.id;
    end if;
    next_stock_state := 'released';
  end if;

  update public.orders set status = p_action,
    stock_state = next_stock_state,
    delivery_status = case when p_action = 'cancelled' then 'cancelled' else delivery_status end,
    current_lat = case when p_action = 'cancelled' then null else current_lat end,
    current_lng = case when p_action = 'cancelled' then null else current_lng end,
    location_updated_at = case when p_action = 'cancelled' then null else location_updated_at end,
    cancellation_reason = case when p_action = 'cancelled' then reason else cancellation_reason end,
    rejection_reason = case when p_action = 'rejected' then reason else rejection_reason end,
    updated_at = now()
    where id = target.id returning * into target;
  insert into public.order_delivery_events(order_id,status,title,description,source)
    values(target.id, p_action,
      case p_action when 'confirmed' then 'Order confirmed' when 'rejected' then 'Order rejected' else 'Order cancelled' end,
      coalesce(reason, case p_action when 'confirmed' then 'The farmer confirmed this order.' when 'rejected' then 'The farmer rejected this order.' else 'The buyer cancelled this order.' end),
      case when p_action = 'cancelled' then 'buyer' else 'farmer' end);
  return target;
end;
$$;
revoke all on function public.transition_marketplace_order(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.transition_marketplace_order(uuid,uuid,text,text) to service_role;

create or replace function public.complete_marketplace_order(
  p_actor uuid, p_order uuid, p_delivery_status text, p_payment_status text default 'pending'
) returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  target public.orders;
  listing public.products;
begin
  if not exists(select 1 from public.profiles where id = p_actor and account_status = 'active') then
    raise exception 'This account cannot complete orders.' using errcode = '42501';
  end if;
  select * into target from public.orders where id = p_order for update;
  if not found then raise exception 'Order was not found.' using errcode = 'P0002'; end if;
  if target.buyer_id <> p_actor or target.status <> 'confirmed' then
    raise exception 'Only the buyer can complete a confirmed order.' using errcode = '42501';
  end if;
  if p_delivery_status not in ('delivered', 'picked_up') then
    raise exception 'Invalid completion status.' using errcode = '23514';
  end if;

  if target.stock_state = 'reserved' then
    select * into listing from public.products where id = target.product_id for update;
    if found then
      update public.products set reserved_quantity = greatest(0, reserved_quantity - target.quantity),
        sold_quantity = sold_quantity + target.quantity, updated_at = now()
        where id = listing.id;
    end if;
  end if;

  update public.orders set status = 'completed', delivery_status = p_delivery_status,
    payment_status = p_payment_status, stock_state = case when stock_state = 'reserved' then 'sold' else stock_state end,
    paid_at = case when p_payment_status = 'paid' then coalesce(paid_at, now()) else paid_at end,
    current_lat = null, current_lng = null, location_updated_at = null, updated_at = now()
    where id = target.id returning * into target;
  insert into public.order_delivery_events(order_id,status,title,description,source)
    values(target.id, p_delivery_status,
      case when p_delivery_status = 'picked_up' then 'Order picked up' else 'Order delivered' end,
      case when p_delivery_status = 'picked_up' then 'You confirmed picking up your order.' else 'You confirmed receiving your order.' end,
      'buyer');
  return target;
end;
$$;
revoke all on function public.complete_marketplace_order(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.complete_marketplace_order(uuid,uuid,text,text) to service_role;

-- ---------------------------------------------------------------------------
-- Product context on direct messages
-- ---------------------------------------------------------------------------
alter table public.messages add column if not exists context_product_id uuid references public.products(id) on delete set null;
alter table public.messages add column if not exists context_product_name text;
alter table public.messages add column if not exists context_product_image_url text;
alter table public.messages add column if not exists context_product_unit text;
alter table public.messages add column if not exists context_product_price numeric(12,2);
create index if not exists messages_context_product_idx on public.messages (context_product_id) where context_product_id is not null;

-- ---------------------------------------------------------------------------
-- Donation expiry and quantity claims
-- ---------------------------------------------------------------------------
alter table public.donations add column if not exists expiration_at timestamptz;
alter table public.donations add column if not exists available_quantity numeric(12,2);
alter table public.donations add column if not exists claimed_quantity numeric(12,2) not null default 0;
update public.donations set available_quantity = quantity where available_quantity is null;
alter table public.donations alter column available_quantity set default 0;
alter table public.donations alter column available_quantity set not null;
alter table public.donations drop constraint if exists donations_status_check;
alter table public.donations add constraint donations_status_check
  check (status in ('available','requested','scheduled','completed','cancelled','expired','fully_claimed'));
alter table public.donations drop constraint if exists donations_available_quantity_check;
alter table public.donations add constraint donations_available_quantity_check check (available_quantity >= 0 and available_quantity <= quantity);
alter table public.donations drop constraint if exists donations_claimed_quantity_check;
alter table public.donations add constraint donations_claimed_quantity_check check (claimed_quantity >= 0 and claimed_quantity <= quantity);

create index if not exists donations_expiration_idx on public.donations (expiration_at, status);

create table if not exists public.donation_claims (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references public.donations(id) on delete cascade,
  stakeholder_id uuid not null references public.profiles(id) on delete cascade,
  stakeholder_name text not null,
  quantity numeric(12,2) not null check (quantity > 0),
  status text not null default 'pending' check (status in ('pending','scheduled','completed','cancelled','rejected','expired')),
  pickup_date date,
  rated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.donation_claims add column if not exists rated boolean not null default false;
create index if not exists donation_claims_donation_idx on public.donation_claims (donation_id, status, created_at desc);
create index if not exists donation_claims_stakeholder_idx on public.donation_claims (stakeholder_id, status, created_at desc);
create unique index if not exists donation_claims_active_unique
  on public.donation_claims (donation_id, stakeholder_id) where status in ('pending','scheduled');
alter table public.donation_claims enable row level security;
revoke all on public.donation_claims from anon, authenticated;
grant all on public.donation_claims to service_role;

create or replace function public.expire_donations()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  changed integer;
begin
  update public.donation_claims claim
  set status = 'expired', updated_at = now()
  where claim.status in ('pending', 'scheduled')
    and exists (
      select 1 from public.donations donation
      where donation.id = claim.donation_id
        and (donation.expiration_at is not null and donation.expiration_at <= now()
          or donation.expiration_at is null and donation.expiration_date is not null
            and donation.expiration_date < (now() at time zone 'Asia/Manila')::date)
    );

  with expired as (
    update public.donations
    set status = 'expired', updated_at = now()
    where status in ('available','requested','scheduled','fully_claimed')
      and (expiration_at is not null and expiration_at <= now()
        or expiration_at is null and expiration_date is not null
          and expiration_date < (now() at time zone 'Asia/Manila')::date)
    returning farmer_id, product_name
  )
  insert into public.notifications(user_id, type, title, message, link)
  select farmer_id, 'donation', 'Donation expired', product_name || ' is no longer available for donation.', '/farmer-donations'
  from expired;
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.expire_donations() from public, anon, authenticated;
grant execute on function public.expire_donations() to service_role;

create or replace function public.create_surplus_donation(
  actor_id uuid, source_product_id uuid, p_expiration_at timestamptz
)
returns public.donations
language plpgsql security definer set search_path = public
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
  if p_expiration_at is null or p_expiration_at <= now() then
    raise exception 'Choose a future donation expiration date and time.' using errcode = '22007';
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
  insert into public.donations(product_id, product_name, unit, quantity, available_quantity, claimed_quantity,
    location, image_url, expiration_date, expiration_at, farmer_id, farmer_name, restore_status, status)
  values(product.id, product.name, product.unit, product.quantity, product.quantity, 0,
    product.location, product.image_url, product.expiration_date, p_expiration_at,
    actor.id, actor.name, product.status, 'available')
  returning * into donation;
  update public.products set quantity = 0, status = 'inactive', updated_at = now() where id = product.id;
  insert into public.notifications(user_id, type, title, message, link)
    select id, 'donation', 'New surplus donation available',
      actor.name || ' donated ' || donation.quantity || ' ' || donation.unit || ' of ' || donation.product_name || '.',
      '/stakeholder-donations'
    from public.profiles where role = 'stakeholder' and account_status = 'active' and verification_status = 'verified';
  return donation;
end;
$$;
revoke all on function public.create_surplus_donation(uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.create_surplus_donation(uuid,uuid,timestamptz) to service_role;

create or replace function public.withdraw_surplus_donation(actor_id uuid, target_donation_id uuid)
returns public.donations
language plpgsql security definer set search_path = public
as $$
declare
  actor public.profiles;
  donation public.donations;
  product public.products;
  restore_quantity numeric;
  recipient uuid;
begin
  select * into actor from public.profiles where id = actor_id for share;
  if not found or actor.role <> 'farmer' or actor.account_status <> 'active' then
    raise exception 'Only active farmer accounts can withdraw donations.' using errcode = '42501';
  end if;
  select * into donation from public.donations where id = target_donation_id for update;
  if not found then raise exception 'Donation was not found.' using errcode = 'P0002'; end if;
  if donation.farmer_id <> actor_id then raise exception 'You cannot withdraw another farmer''s donation.' using errcode = '42501'; end if;
  if donation.status not in ('available','requested','scheduled') then
    raise exception 'This donation can no longer be withdrawn.' using errcode = '23514';
  end if;
  if exists(select 1 from public.donation_claims where donation_id = donation.id and status in ('pending','scheduled')) then
    raise exception 'Resolve the active donation claims before withdrawing this offer.' using errcode = '23514';
  end if;

  restore_quantity := case when donation.expiration_at is null then donation.quantity else donation.available_quantity end;
  if donation.product_id is not null and restore_quantity > 0 then
    select * into product from public.products where id = donation.product_id for update;
    if found then
      update public.products set quantity = quantity + restore_quantity,
        status = case when product.status = 'inactive'
          and coalesce(product.price_review->>'status','') <> 'declined'
          and (product.expiration_date is null or product.expiration_date >= (now() at time zone 'Asia/Manila')::date)
          then donation.restore_status else product.status end,
        updated_at = now() where id = product.id;
    end if;
  end if;
  recipient := donation.requested_by_id;
  update public.donations set status = 'cancelled', requested_by_id = null, requested_by_name = null, updated_at = now()
    where id = donation.id returning * into donation;
  if recipient is not null then
    insert into public.notifications(user_id, type, title, message, link)
      values(recipient, 'donation', 'Donation withdrawn', donation.product_name || ' is no longer available.', '/stakeholder-requests');
  end if;
  return donation;
end;
$$;
revoke all on function public.withdraw_surplus_donation(uuid,uuid) from public, anon, authenticated;
grant execute on function public.withdraw_surplus_donation(uuid,uuid) to service_role;

create or replace function public.create_surplus_donation(actor_id uuid, source_product_id uuid)
returns public.donations
language plpgsql security definer set search_path = public
as $$
begin
  raise exception 'A donation expiration date and time is required.' using errcode = '22007';
end;
$$;
revoke all on function public.create_surplus_donation(uuid,uuid) from public, anon, authenticated;
grant execute on function public.create_surplus_donation(uuid,uuid) to service_role;

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
  insert into public.donation_claims(donation_id, stakeholder_id, stakeholder_name, quantity)
  values(donation.id, actor.id, coalesce(nullif(actor.organization_name, ''), actor.name), requested_quantity)
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
    update public.donation_claims set status = 'scheduled', pickup_date = scheduled_date, updated_at = now()
      where id = claim.id returning * into claim;
    recipient := claim.stakeholder_id;
    insert into public.notifications(user_id, type, title, message, link)
      values(recipient, 'donation', 'Donation pickup scheduled', donation.product_name || ': pickup scheduled for ' || scheduled_date || '.', '/stakeholder-requests');
  elsif action_name = 'reject' or action_name = 'cancel' then
    update public.donation_claims set status = case when action_name = 'reject' then 'rejected' else 'cancelled' end, updated_at = now()
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
    update public.donation_claims set status = 'completed', updated_at = now() where id = claim.id returning * into claim;
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

-- Supabase Cron is optional. When pg_cron is enabled, this keeps expiry independent of API uptime.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule(jobid) from cron.job where jobname = 'harvestlink-expire-donations';
    exception when undefined_table or undefined_function then
      null;
    end;
    begin
      perform cron.schedule('harvestlink-expire-donations', '* * * * *', 'select public.expire_donations()');
    exception when undefined_table or undefined_function then
      null;
    end;
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
