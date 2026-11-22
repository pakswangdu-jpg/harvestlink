alter table public.orders
  add column if not exists lalamove_quote_status text
    check (lalamove_quote_status in ('pending', 'proposed', 'accepted', 'declined')),
  add column if not exists lalamove_quoted_at timestamptz,
  add column if not exists lalamove_accepted_at timestamptz,
  add column if not exists lalamove_accepted_total numeric(12,2);

create or replace function public.guard_lalamove_delivery_quote()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.delivery_method = 'courier' then
      new.lalamove_quote_status := 'pending';
    end if;
    return new;
  end if;

  if old.lalamove_quote_status is null then return new; end if;
  if new.manual_lalamove_tracking_url is distinct from old.manual_lalamove_tracking_url
    and (old.lalamove_quote_status <> 'accepted' or old.delivery_status not in ('packed', 'out_for_delivery', 'delivered')) then
    raise exception 'Mark the order ready for pickup before editing its tracking link.' using errcode = '23514';
  end if;
  if old.delivery_status is distinct from new.delivery_status and new.delivery_status = 'out_for_delivery'
    and new.manual_lalamove_tracking_url is null then
    raise exception 'Add the official Lalamove tracking link before starting delivery.' using errcode = '23514';
  end if;
  if old.lalamove_quote_status = 'accepted' and old.payment_method = 'gcash'
    and (old.payment_status = 'paid' or old.payment_verification_status = 'pending')
    and new.status is distinct from old.status and new.status in ('cancelled', 'rejected') then
    raise exception 'Resolve the GCash payment before cancelling this order.' using errcode = '23514';
  end if;
  if old.lalamove_quote_status = 'accepted' and (
    row(new.delivery_fee, new.total_amount, new.lalamove_quote_status, new.lalamove_quoted_at,
        new.lalamove_accepted_at, new.lalamove_accepted_total)
    is distinct from
    row(old.delivery_fee, old.total_amount, old.lalamove_quote_status, old.lalamove_quoted_at,
        old.lalamove_accepted_at, old.lalamove_accepted_total)
  ) then raise exception 'The accepted Lalamove total is locked.' using errcode = '23514'; end if;

  if new.lalamove_quote_status is distinct from 'accepted' and (
    (new.status is distinct from old.status and new.status = 'confirmed')
    or row(new.payment_status, new.payment_verification_status, new.payment_receipt_url)
       is distinct from row(old.payment_status, old.payment_verification_status, old.payment_receipt_url)
  ) then raise exception 'The buyer must accept the Lalamove total first.' using errcode = '23514'; end if;
  if new.payment_method = 'gcash' and new.payment_status is distinct from 'paid' and (
    (new.status is distinct from old.status and new.status = 'confirmed')
    or (new.delivery_status is distinct from old.delivery_status and new.delivery_status in ('preparing', 'packed', 'out_for_delivery', 'delivered'))
  ) then raise exception 'Verify GCash payment before fulfilling this Lalamove order.' using errcode = '23514'; end if;
  return new;
end;
$$;

drop trigger if exists guard_lalamove_delivery_quote on public.orders;
create trigger guard_lalamove_delivery_quote before insert or update on public.orders
for each row execute function public.guard_lalamove_delivery_quote();

create or replace function public.create_lalamove_quote_order(p_actor uuid, p_order jsonb)
returns public.orders language plpgsql security definer set search_path = ''
as $$
begin
  if p_order->>'delivery_method' is distinct from 'courier'
    or (p_order->>'delivery_fee')::numeric is distinct from 0 then
    raise exception 'A Lalamove quote request must exclude delivery charges.' using errcode = '23514';
  end if;
  return public.create_marketplace_order(p_actor, p_order);
end;
$$;
revoke all on function public.create_lalamove_quote_order(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.create_lalamove_quote_order(uuid,jsonb) to service_role;

create or replace function public.manage_lalamove_delivery_quote(
  p_actor uuid, p_order uuid, p_action text, p_fee numeric default null, p_quoted_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  target public.orders;
  actor_role text;
begin
  select role into actor_role from public.profiles where id = p_actor and account_status = 'active';
  select * into target from public.orders where id = p_order for update;
  if not found then raise exception 'Order was not found.' using errcode = 'P0002'; end if;
  if p_action = 'propose' then
    if actor_role is distinct from 'farmer' or target.farmer_id is distinct from p_actor then
      raise exception 'Only the owning farmer can set the delivery fee.' using errcode = '42501';
    end if;
  elsif p_action in ('accept', 'decline') then
    if actor_role is null or actor_role not in ('buyer', 'stakeholder') or target.buyer_id is distinct from p_actor then
      raise exception 'Only the order recipient can respond to the delivery quote.' using errcode = '42501';
    end if;
  else
    raise exception 'Invalid delivery quote action.' using errcode = '23514';
  end if;
  if target.delivery_method is distinct from 'courier' or target.lalamove_quote_status is null then
    raise exception 'This order does not use manual delivery pricing.' using errcode = '23514';
  end if;

  if p_action = 'propose' then
    if target.status <> 'pending' or target.lalamove_quote_status not in ('pending', 'proposed') then
      raise exception 'This delivery quote can no longer be changed.' using errcode = '23514';
    end if;
    if p_fee is null or p_fee < 0 or p_fee > 10000 or round(p_fee, 2) <> p_fee then
      raise exception 'Enter a delivery fee from PHP 0 to PHP 10,000 with up to two decimals.' using errcode = '23514';
    end if;
    if target.lalamove_quote_status = 'proposed' and target.delivery_fee = p_fee then
      return jsonb_build_object('order', to_jsonb(target), 'changed', false);
    end if;
    update public.orders set delivery_fee = p_fee, delivery_fee_tier = 'Farmer quote',
      total_amount = round(unit_price * quantity, 2) + p_fee,
      lalamove_quote_status = 'proposed', lalamove_quoted_at = clock_timestamp(), updated_at = now()
    where id = target.id returning * into target;
  else
    if p_quoted_at is null or p_quoted_at is distinct from target.lalamove_quoted_at then
      raise exception 'The quote changed. Refresh and review the latest total.' using errcode = '23514';
    end if;
    if (p_action = 'accept' and target.lalamove_quote_status = 'accepted')
       or (p_action = 'decline' and target.lalamove_quote_status = 'declined') then
      return jsonb_build_object('order', to_jsonb(target), 'changed', false);
    end if;
    if target.status <> 'pending' or target.lalamove_quote_status <> 'proposed' then
      raise exception 'This delivery quote is no longer awaiting a response.' using errcode = '23514';
    end if;
    if p_action = 'accept' then
      update public.orders set lalamove_quote_status = 'accepted', lalamove_accepted_at = now(),
        lalamove_accepted_total = total_amount, updated_at = now()
      where id = target.id returning * into target;
    else
      perform public.transition_marketplace_order(p_actor, p_order, 'cancelled', 'Recipient declined the Lalamove delivery quote.');
      update public.orders set lalamove_quote_status = 'declined' where id = target.id returning * into target;
    end if;
  end if;
  return jsonb_build_object('order', to_jsonb(target), 'changed', true);
end;
$$;

revoke all on function public.manage_lalamove_delivery_quote(uuid,uuid,text,numeric,timestamptz) from public, anon, authenticated;
grant execute on function public.manage_lalamove_delivery_quote(uuid,uuid,text,numeric,timestamptz) to service_role;
notify pgrst, 'reload schema';
