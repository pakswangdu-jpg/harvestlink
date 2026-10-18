begin;

alter table public.deliveries add column if not exists vehicle_plate_number text;
alter table public.deliveries add column if not exists handed_over_at timestamptz;

-- Lock the order first for every courier action, keeping booking and handover atomic.
create or replace function public.manage_manual_courier(
  p_actor uuid, p_order uuid, p_action text, p_details jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  target public.orders;
  courier public.deliveries;
  reference text := nullif(btrim(p_details->>'booking_reference'), '');
  tracking text := nullif(btrim(p_details->>'tracking_url'), '');
  driver text := nullif(btrim(p_details->>'driver_name'), '');
  plate text := nullif(upper(btrim(p_details->>'vehicle_plate_number')), '');
begin
  select * into target from public.orders where id = p_order for update;
  if not found then raise exception 'Order was not found.' using errcode = 'P0002'; end if;
  if target.farmer_id is distinct from p_actor or not exists(
    select 1 from public.profiles where id = p_actor and role = 'farmer' and account_status = 'active'
  ) then raise exception 'Only the owning farmer can manage this courier.' using errcode = '42501'; end if;
  if target.delivery_method <> 'courier' or target.status <> 'confirmed' then
    raise exception 'A confirmed third-party courier order is required.' using errcode = '23514';
  end if;
  if target.delivery_status not in ('packed','out_for_delivery') then
    raise exception 'Pack this order before booking a courier.' using errcode = '23514';
  end if;
  if p_action in ('book','handover') and target.delivery_status <> 'packed' then
    raise exception 'This order has already been handed over.' using errcode = '23514';
  end if;
  if p_action in ('book','handover') and target.payment_method <> 'cod' and target.payment_status <> 'paid' then
    raise exception 'Payment must be verified before booking or handover.' using errcode = '23514';
  end if;
  select * into courier from public.deliveries where order_id = target.id for update;
  if p_action = 'book' and courier.id is not null then
    raise exception 'A courier is already booked. Edit the existing details.' using errcode = '23505';
  elsif p_action in ('edit','handover') and courier.id is null then
    raise exception 'Save courier booking details first.' using errcode = 'P0002';
  end if;
  if courier.id is not null and courier.courier_company is distinct from 'Lalamove' then
    raise exception 'This booking is not a Lalamove delivery.' using errcode = '23514';
  end if;
  if p_action in ('book','edit') then
    if reference is null or length(reference) > 100 or reference ~ '[[:cntrl:]]'
      or tracking is null or length(tracking) > 2048
      or tracking !~* '^https://([a-z0-9-]+\.)*lalamove\.com(:443)?([/?#]|$)'
      or tracking ~ '[[:space:]\\]'
      or length(driver) > 120 or driver ~ '[[:cntrl:]]'
      or length(plate) > 15 or plate !~ '^[A-Z0-9 -]+$' then
      raise exception 'Valid booking number, official HTTPS tracking link and courier details are required.' using errcode = '23514';
    end if;
    if p_action = 'book' then
      insert into public.deliveries(order_id,courier_company,booking_reference,tracking_url,driver_name,vehicle_plate_number,delivery_status)
        values(target.id,'Lalamove',reference,tracking,driver,plate,'booked') returning * into courier;
      insert into public.order_delivery_events(order_id,status,title,description,source)
        values(target.id,'booked','Lalamove courier booked','Tracking details saved. Awaiting physical handover.','farmer');
    else
      update public.deliveries set booking_reference=reference,tracking_url=tracking,driver_name=driver,
        vehicle_plate_number=plate,updated_at=now() where id=courier.id returning * into courier;
    end if;
  elsif p_action = 'handover' then
    if courier.courier_company <> 'Lalamove' or nullif(btrim(courier.booking_reference),'') is null
      or courier.tracking_url is null
      or courier.tracking_url !~* '^https://([a-z0-9-]+\.)*lalamove\.com(:443)?([/?#]|$)'
      or courier.tracking_url ~ '[[:space:]\\]'
      or courier.delivery_status not in ('booked','waiting_for_pickup','assigning_driver','driver_assigned') then
      raise exception 'Valid Lalamove booking details are required before handover.' using errcode = '23514';
    end if;
    update public.orders set delivery_status='out_for_delivery',transit_started_at=now(),updated_at=now()
      where id=target.id returning * into target;
    update public.deliveries set delivery_status='out_for_delivery',handed_over_at=now(),updated_at=now()
      where id=courier.id returning * into courier;
    insert into public.order_delivery_events(order_id,status,title,description,source)
      values(target.id,'out_for_delivery','Handed to Lalamove','The farmer confirmed physical handover to the courier.','farmer');
  else raise exception 'Invalid courier action.' using errcode = '23514'; end if;
  return jsonb_build_object('order',to_jsonb(target),'delivery',to_jsonb(courier));
end;
$$;
revoke all on function public.manage_manual_courier(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.manage_manual_courier(uuid,uuid,text,jsonb) to service_role;

-- The existing Buyer receipt action remains the completion path for manual bookings.
create or replace function public.sync_manual_courier_receipt() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.delivery_method = 'courier' and new.status = 'completed' and new.delivery_status = 'delivered' then
    update public.deliveries set delivery_status='delivered',updated_at=now()
      where order_id=new.id and courier_company='Lalamove' and lalamove_order_id is null;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_manual_courier_receipt() from public, anon, authenticated;
drop trigger if exists sync_manual_courier_receipt on public.orders;
create trigger sync_manual_courier_receipt after update of status,delivery_status on public.orders
  for each row execute function public.sync_manual_courier_receipt();

notify pgrst, 'reload schema';
commit;
