begin;

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
  notification_title text;
  notification_message text;
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

  perform pg_advisory_xact_lock(hashtext(
    actor.id::text || ':' || lower(btrim(product.name)) || ':' || lower(btrim(product.unit)) || ':' || extract(epoch from p_expiration_at)::text
  ));

  select * into donation
  from public.donations
  where farmer_id = actor.id
    and lower(btrim(product_name)) = lower(btrim(product.name))
    and lower(btrim(unit)) = lower(btrim(product.unit))
    and expiration_at = p_expiration_at
    and expiration_at > now()
    and status = 'available'
    and available_quantity > 0
  order by created_at, id
  for update
  limit 1;

  if found and exists (
    select 1 from public.donation_claims
    where donation_id = donation.id and status in ('pending', 'scheduled')
  ) then
    donation := null;
  end if;

  if donation.id is not null then
    update public.donations
    set quantity = quantity + product.quantity,
        available_quantity = available_quantity + product.quantity,
        updated_at = now()
    where id = donation.id
    returning * into donation;
    notification_title := 'Donation stock increased';
    notification_message := actor.name || ' added ' || product.quantity || ' ' || product.unit
      || ' of ' || product.name || '. ' || donation.available_quantity || ' ' || donation.unit || ' is now available.';
  else
    insert into public.donations(product_id, product_name, unit, quantity, available_quantity, claimed_quantity,
      location, image_url, expiration_date, expiration_at, farmer_id, farmer_name, restore_status, status)
    values(product.id, product.name, product.unit, product.quantity, product.quantity, 0,
      product.location, product.image_url, product.expiration_date, p_expiration_at,
      actor.id, actor.name, product.status, 'available')
    returning * into donation;
    notification_title := 'New surplus donation available';
    notification_message := actor.name || ' donated ' || donation.quantity || ' ' || donation.unit || ' of ' || donation.product_name || '.';
  end if;

  update public.products set quantity = 0, status = 'inactive', updated_at = now() where id = product.id;
  insert into public.notifications(user_id, type, title, message, link)
    select id, 'donation', notification_title, notification_message, '/stakeholder-donations'
    from public.profiles where role = 'stakeholder' and account_status = 'active' and verification_status = 'verified';
  return donation;
end;
$$;

revoke all on function public.create_surplus_donation(uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.create_surplus_donation(uuid,uuid,timestamptz) to service_role;

notify pgrst, 'reload schema';
commit;
