-- Apply before deploying the dual-price API. Existing listings keep their price and MOQ.
begin;

alter table public.products add column if not exists wholesale_price numeric(12,2);
alter table public.products add column if not exists wholesale_min_quantity numeric(12,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.products'::regclass and conname = 'products_wholesale_pricing_check'
  ) then
    alter table public.products add constraint products_wholesale_pricing_check check (
      (wholesale_price is null and wholesale_min_quantity is null)
      or (wholesale_price is not null and wholesale_min_quantity is not null
        and wholesale_price > 0 and wholesale_price < price
        and wholesale_min_quantity > 0 and wholesale_min_quantity <> 'NaN'::numeric)
    );
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
