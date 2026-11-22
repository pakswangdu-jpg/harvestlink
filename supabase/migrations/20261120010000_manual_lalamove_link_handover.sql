create or replace function public.handover_lalamove_share_link_order(p_actor uuid, p_order uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  target public.orders;
  courier public.deliveries;
begin
  select * into target from public.orders where id = p_order for update;
  if not found then raise exception 'Order was not found.' using errcode = 'P0002'; end if;
  if target.farmer_id is distinct from p_actor or not exists (
    select 1 from public.profiles where id = p_actor and role = 'farmer' and account_status = 'active'
  ) then raise exception 'Only the owning farmer can confirm handover.' using errcode = '42501'; end if;
  if target.delivery_method is distinct from 'courier' or target.status is distinct from 'confirmed'
    or target.delivery_status is distinct from 'packed' then
    raise exception 'A confirmed, packed Lalamove order is required.' using errcode = '23514';
  end if;
  if target.payment_method is distinct from 'cod' and target.payment_status is distinct from 'paid' then
    raise exception 'Payment must be verified before handover.' using errcode = '23514';
  end if;
  if target.manual_lalamove_tracking_url is null then
    raise exception 'Save the official Lalamove share link before handover.' using errcode = '23514';
  end if;

  update public.orders set delivery_status = 'out_for_delivery', transit_started_at = now(), updated_at = now()
  where id = target.id returning * into target;
  update public.deliveries set delivery_status = 'out_for_delivery', handed_over_at = now(), updated_at = now()
  where order_id = target.id and courier_company = 'Lalamove' and lalamove_order_id is null
  returning * into courier;
  insert into public.order_delivery_events(order_id, status, title, description, source)
  values(target.id, 'out_for_delivery', 'Handed to Lalamove',
    'The farmer confirmed physical handover to the courier.', 'farmer');
  return jsonb_build_object('order', to_jsonb(target), 'delivery', case when courier.id is not null then to_jsonb(courier) end);
end;
$$;

revoke all on function public.handover_lalamove_share_link_order(uuid,uuid) from public, anon, authenticated;
grant execute on function public.handover_lalamove_share_link_order(uuid,uuid) to service_role;
notify pgrst, 'reload schema';
