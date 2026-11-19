create or replace function public.publish_product_inventory_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if row(new.quantity, new.status, new.price, new.original_price, new.discount_percent,
         new.wholesale_price, new.wholesale_min_quantity, new.price_review->>'status')
     is distinct from
     row(old.quantity, old.status, old.price, old.original_price, old.discount_percent,
         old.wholesale_price, old.wholesale_min_quantity, old.price_review->>'status') then
    insert into public.product_inventory_events (product_id, farmer_id, quantity, status, is_public)
    values (
      new.id,
      new.farmer_id,
      new.quantity,
      new.status,
      (new.status = 'active' or (new.status = 'inactive' and new.quantity = 0))
        and (new.price_review->>'status' is null or new.price_review->>'status' = 'approved')
        and (new.expiration_date is null or new.expiration_date >= (now() at time zone 'Asia/Manila')::date)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists publish_product_inventory_change on public.products;
create trigger publish_product_inventory_change
  after update of quantity, status, price, original_price, discount_percent,
    wholesale_price, wholesale_min_quantity, price_review on public.products
  for each row
  execute function public.publish_product_inventory_change();

