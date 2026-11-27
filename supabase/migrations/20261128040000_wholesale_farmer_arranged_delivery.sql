-- Wholesale Farmer-Arranged Delivery Workflow
-- Strictly scoped to Wholesale orders (selling_type = 'wholesale').
-- Preserves all Retail orders, Retail Lalamove quote flow, and Stakeholder Donations.

alter table public.orders
  add column if not exists selling_type text not null default 'retail'
    check (selling_type in ('retail', 'wholesale')),
  add column if not exists delivery_arrangement_status text
    check (delivery_arrangement_status in ('pending_farmer', 'pending_buyer_confirmation', 'confirmed')),
  add column if not exists delivery_address text,
  add column if not exists estimated_pickup_time text,
  add column if not exists estimated_delivery_at timestamptz,
  add column if not exists courier_booking_reference text,
  add column if not exists delivery_instructions text,
  add column if not exists delivery_arranged_at timestamptz,
  add column if not exists buyer_confirmed_total_at timestamptz,
  add column if not exists buyer_confirmed_total numeric(12,2);

-- Allow 'farmer_arranged' delivery_method if a check constraint exists on public.orders.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'orders'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%delivery_method%'
  loop
    execute format('alter table public.orders drop constraint if exists %I', constraint_name);
  end loop;

  alter table public.orders
    add constraint orders_delivery_method_check
    check (delivery_method in ('farmer_delivery', 'buyer_pickup', 'courier', 'farmer_arranged'));

  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'orders'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%delivery_status%'
  loop
    execute format('alter table public.orders drop constraint if exists %I', constraint_name);
  end loop;

  alter table public.orders
    add constraint orders_delivery_status_check
    check (delivery_status in (
      'pending', 'preparing', 'packed', 'ready_for_pickup',
      'waiting_for_courier', 'out_for_delivery', 'in_transit',
      'picked_up', 'delivered', 'completed', 'cancelled'
    ));
end $$;

-- Update create_marketplace_order to persist selling_type from listing and support
-- farmer_arranged wholesale checkout with atomic stock reservation.
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
  delivery_address_value text := nullif(trim(coalesce(p_order->>'delivery_address', '')), '');
  is_wholesale boolean := false;
  resolved_delivery_method text;
  arrangement_status_value text := null;
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

  is_wholesale := (listing.selling_type = 'wholesale');
  if is_wholesale and listing.moq is not null and quantity_value < listing.moq then
    raise exception using message = format('Minimum order quantity is %s %s.', listing.moq, listing.unit), errcode = '23514';
  end if;

  expected_unit_price := case
    when listing.selling_type = 'retail'
      and listing.wholesale_price is not null
      and listing.wholesale_min_quantity is not null
      and quantity_value >= listing.wholesale_min_quantity
      then listing.wholesale_price
    else listing.price
  end;
  if unit_price_value is null or round(unit_price_value, 2) <> round(expected_unit_price, 2) then
    raise exception 'The product price changed. Refresh the order and try again.' using errcode = '23514';
  end if;

  if is_wholesale then
    resolved_delivery_method := 'farmer_arranged';
    delivery_fee_value := 0;
    arrangement_status_value := 'pending_farmer';
  else
    resolved_delivery_method := p_order->>'delivery_method';
    if resolved_delivery_method not in ('farmer_delivery', 'buyer_pickup', 'courier') then
      raise exception 'Choose a valid payment and delivery method.' using errcode = '23514';
    end if;
  end if;

  expected_total := round(expected_unit_price * quantity_value + delivery_fee_value, 2);
  if delivery_fee_value < 0 or total_value is null or round(total_value, 2) <> expected_total then
    raise exception 'The order total changed. Refresh the order and try again.' using errcode = '23514';
  end if;
  if p_order->>'payment_method' not in ('cod', 'gcash') then
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
    origin_municipality, delivery_municipality, status, stock_state,
    selling_type, delivery_arrangement_status, delivery_address,
    created_at, updated_at
  ) values (
    listing.id, listing.name, listing.image_url, listing.unit, expected_unit_price, listing.cost_price,
    listing.farmer_id, coalesce(farmer.name, 'Local farmer'), farmer.avatar_url, farmer.farm_name,
    farmer.verification_status, actor.id, actor.name, actor.avatar_url, quantity_value, delivery_fee_value,
    nullif(p_order->>'delivery_distance_km', '')::numeric,
    nullif(p_order->>'delivery_duration_minutes', '')::numeric,
    case when is_wholesale then 'Farmer-arranged' else nullif(p_order->>'delivery_fee_tier', '') end,
    total_value, checkout_key_value, fingerprint_value,
    message_value, p_order->>'payment_method', 'pending', resolved_delivery_method, 'pending',
    p_order->>'origin_municipality', p_order->>'delivery_municipality', 'pending', stock_state_value,
    listing.selling_type, arrangement_status_value, delivery_address_value,
    coalesce(nullif(p_order->>'created_at', '')::timestamptz, now()), now()
  ) returning * into created_order;

  insert into public.order_delivery_events(order_id, status, title, description, source)
  values(
    created_order.id,
    'pending',
    case when is_wholesale then 'Order Placed' else 'Order placed' end,
    case
      when is_wholesale then 'Your wholesale order has been successfully submitted.'
      else 'Your order has been placed and the requested stock is reserved.'
    end,
    'system'
  );

  return created_order;
end;
$$;

revoke all on function public.create_marketplace_order(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_marketplace_order(uuid, jsonb) to service_role;

-- Atomic RPC for farmer submitting or revising a wholesale delivery arrangement.
create or replace function public.arrange_wholesale_delivery(
  p_actor uuid,
  p_order uuid,
  p_delivery_method text,
  p_delivery_fee numeric,
  p_estimated_pickup_time text default null,
  p_estimated_delivery_at timestamptz default null,
  p_booking_reference text default null,
  p_delivery_instructions text default null
) returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  target public.orders;
  actor_role text;
  subtotal numeric;
begin
  select role into actor_role from public.profiles where id = p_actor and account_status = 'active';
  select * into target from public.orders where id = p_order for update;
  if not found then
    raise exception 'Order was not found.' using errcode = 'P0002';
  end if;
  if actor_role is distinct from 'farmer' or target.farmer_id is distinct from p_actor then
    raise exception 'Only the owning farmer can arrange delivery for this wholesale order.' using errcode = '42501';
  end if;
  if target.selling_type is distinct from 'wholesale' then
    raise exception 'Farmer-arranged delivery is only available for wholesale orders.' using errcode = '23514';
  end if;
  if target.status not in ('pending') then
    raise exception 'Delivery arrangements can only be updated before the order is confirmed.' using errcode = '23514';
  end if;
  if p_delivery_method not in ('farmer_delivery', 'courier', 'buyer_pickup') then
    raise exception 'Select a valid delivery method.' using errcode = '23514';
  end if;
  if p_delivery_fee is null or p_delivery_fee < 0 or round(p_delivery_fee, 2) <> p_delivery_fee then
    raise exception 'Enter a valid non-negative delivery fee.' using errcode = '23514';
  end if;

  subtotal := round(target.unit_price * target.quantity, 2);

  update public.orders
  set delivery_method = p_delivery_method,
      delivery_fee = p_delivery_fee,
      delivery_fee_tier = case
        when p_delivery_method = 'courier' then 'Lalamove (Farmer-arranged)'
        when p_delivery_method = 'buyer_pickup' then 'Buyer Pickup'
        else 'Farmer Delivery'
      end,
      total_amount = round(subtotal + p_delivery_fee, 2),
      estimated_pickup_time = nullif(trim(coalesce(p_estimated_pickup_time, '')), ''),
      estimated_delivery_at = p_estimated_delivery_at,
      courier_booking_reference = nullif(trim(coalesce(p_booking_reference, '')), ''),
      delivery_instructions = nullif(trim(coalesce(p_delivery_instructions, '')), ''),
      delivery_arrangement_status = 'pending_buyer_confirmation',
      delivery_arranged_at = clock_timestamp(),
      buyer_confirmed_total_at = null,
      buyer_confirmed_total = null,
      updated_at = now()
  where id = target.id
  returning * into target;

  return target;
end;
$$;

revoke all on function public.arrange_wholesale_delivery(uuid, uuid, text, numeric, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.arrange_wholesale_delivery(uuid, uuid, text, numeric, text, timestamptz, text, text) to service_role;

-- Atomic RPC for buyer confirming the farmer's wholesale delivery arrangement and final total.
create or replace function public.confirm_wholesale_delivery(
  p_actor uuid,
  p_order uuid,
  p_arranged_at timestamptz
) returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  target public.orders;
  actor_role text;
begin
  select role into actor_role from public.profiles where id = p_actor and account_status = 'active';
  select * into target from public.orders where id = p_order for update;
  if not found then
    raise exception 'Order was not found.' using errcode = 'P0002';
  end if;
  if actor_role is null or actor_role not in ('buyer', 'stakeholder') or target.buyer_id is distinct from p_actor then
    raise exception 'Only the buyer can confirm the wholesale delivery total.' using errcode = '42501';
  end if;
  if target.selling_type is distinct from 'wholesale' then
    raise exception 'This order does not use wholesale delivery confirmation.' using errcode = '23514';
  end if;
  if target.status <> 'pending' or target.delivery_arrangement_status <> 'pending_buyer_confirmation' then
    raise exception 'This delivery arrangement is not awaiting buyer confirmation.' using errcode = '23514';
  end if;
  if p_arranged_at is null or p_arranged_at is distinct from target.delivery_arranged_at then
    raise exception 'The delivery fee or arrangement was updated. Please review and confirm the revised total.' using errcode = '23514';
  end if;

  update public.orders
  set delivery_arrangement_status = 'confirmed',
      buyer_confirmed_total_at = now(),
      buyer_confirmed_total = target.total_amount,
      updated_at = now()
  where id = target.id
  returning * into target;

  return target;
end;
$$;

revoke all on function public.confirm_wholesale_delivery(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.confirm_wholesale_delivery(uuid, uuid, timestamptz) to service_role;

notify pgrst, 'reload schema';
