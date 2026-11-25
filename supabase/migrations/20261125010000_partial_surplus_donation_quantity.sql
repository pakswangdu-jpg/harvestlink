begin;

-- Supports partial stock donations while retaining the existing three-argument
-- function for callers that donate the complete product quantity.
create or replace function public.create_surplus_donation_with_quantity(
  actor_id uuid, source_product_id uuid, p_expiration_at timestamptz, p_quantity numeric
)
returns public.donations
language plpgsql security definer set search_path = public
as $$
declare
  actor public.profiles;
  product public.products;
  donation public.donations;
  donate_quantity numeric;
  product_images text[];
begin
  select * into actor from public.profiles where id = actor_id for share;
  if not found or actor.role <> 'farmer' or actor.account_status <> 'active' then
    raise exception 'Only active farmer accounts can list donations.' using errcode = '42501';
  end if;
  if p_expiration_at is null or p_expiration_at <= now() then
    raise exception 'Choose a future donation expiration date and time.' using errcode = '22007';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Enter a valid donation quantity.' using errcode = '22023';
  end if;

  select * into product from public.products where id = source_product_id for update;
  if not found then raise exception 'Product was not found.' using errcode = 'P0002'; end if;
  if product.farmer_id <> actor_id then
    raise exception 'You cannot donate another farmer''s product.' using errcode = '42501';
  end if;
  if product.quantity <= 0 then
    raise exception 'This product has no remaining stock to donate.' using errcode = '23514';
  end if;
  if p_quantity > product.quantity then
    raise exception 'Donation quantity cannot exceed the available stock.' using errcode = '22023';
  end if;
  if product.expiration_date < (now() at time zone 'Asia/Manila')::date then
    raise exception 'Expired produce cannot be donated.' using errcode = '23514';
  end if;

  donate_quantity := p_quantity;
  product_images := public.merge_donation_image_urls(array[product.image_url], product.image_urls);

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
  for update limit 1;

  if found and exists (select 1 from public.donation_claims where donation_id = donation.id and status in ('pending', 'scheduled')) then
    donation := null;
  end if;

  if donation.id is not null then
    update public.donations
    set quantity = quantity + donate_quantity,
        available_quantity = available_quantity + donate_quantity,
        image_url = coalesce(nullif(image_url, ''), product_images[1]),
        image_urls = public.merge_donation_image_urls(image_urls, product_images),
        updated_at = now()
    where id = donation.id
    returning * into donation;
  else
    insert into public.donations(product_id, product_name, unit, quantity, available_quantity, claimed_quantity,
      location, image_url, image_urls, expiration_date, expiration_at, farmer_id, farmer_name, restore_status, status)
    values(product.id, product.name, product.unit, donate_quantity, donate_quantity, 0,
      product.location, product_images[1], product_images, product.expiration_date, p_expiration_at,
      actor.id, actor.name, product.status, 'available')
    returning * into donation;
  end if;

  update public.products
  set quantity = product.quantity - donate_quantity,
      status = case when product.quantity - donate_quantity > 0 then product.status else 'inactive' end,
      updated_at = now()
  where id = product.id;

  insert into public.notifications(user_id, type, title, message, link)
    select id, 'donation', 'New surplus donation available',
      actor.name || ' donated ' || donation.quantity || ' ' || donation.unit || ' of ' || donation.product_name || '.',
      '/stakeholder-donations'
    from public.profiles where role = 'stakeholder' and account_status = 'active' and verification_status = 'verified';
  return donation;
end;
$$;

revoke all on function public.create_surplus_donation_with_quantity(uuid,uuid,timestamptz,numeric) from public, anon, authenticated;
grant execute on function public.create_surplus_donation_with_quantity(uuid,uuid,timestamptz,numeric) to service_role;

notify pgrst, 'reload schema';
commit;
