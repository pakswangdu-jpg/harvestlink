begin;

alter table public.ratings
  add column if not exists product_id_snapshot uuid;

update public.ratings as rating
set product_id_snapshot = coalesce(order_row.product_id_snapshot, order_row.product_id)
from public.orders as order_row
where rating.order_id = order_row.id
  and rating.product_id_snapshot is null
  and coalesce(order_row.product_id_snapshot, order_row.product_id) is not null;

create index if not exists ratings_product_id_snapshot_idx
  on public.ratings (product_id_snapshot)
  where product_id_snapshot is not null;

notify pgrst, 'reload schema';
commit;
