alter table public.products
  add column if not exists price_updated_at timestamptz;

create or replace function public.record_product_price_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(new.price, new.original_price, new.discount_percent, new.wholesale_price, new.wholesale_min_quantity)
     is distinct from
     row(old.price, old.original_price, old.discount_percent, old.wholesale_price, old.wholesale_min_quantity) then
    new.price_updated_at := statement_timestamp();
  end if;
  return new;
end;
$$;

drop trigger if exists record_product_price_update on public.products;
create trigger record_product_price_update
  before update of price, original_price, discount_percent, wholesale_price, wholesale_min_quantity
  on public.products
  for each row
  execute function public.record_product_price_update();

notify pgrst, 'reload schema';
