-- Once a Farmer confirms an order, the Buyer can no longer cancel it.
-- Pending orders remain cancellable; all order and inventory changes continue
-- to go through the existing atomic transition function.
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
    if target.status <> 'pending' then
      raise exception 'Only pending orders can be cancelled. Contact the farmer if you need help.' using errcode = '23514';
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
