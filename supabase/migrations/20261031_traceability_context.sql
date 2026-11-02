-- ---------------------------------------------------------------------------
-- Immutable product and order context for direct conversations
-- ---------------------------------------------------------------------------
-- Direct messages can start before an order exists. These columns keep the
-- exact listing details that were shown at inquiry time and later associate
-- the conversation message with the order that was actually created.
-- The snapshot identifiers intentionally have no foreign key: deleting a
-- listing or retaining an order must never erase the identifier from history.

alter table public.orders add column if not exists product_id_snapshot uuid;
update public.orders
set product_id_snapshot = product_id
where product_id_snapshot is null and product_id is not null;

create or replace function public.snapshot_order_product_id()
returns trigger
language plpgsql
as $$
begin
  new.product_id_snapshot := coalesce(new.product_id_snapshot, new.product_id);
  return new;
end;
$$;
drop trigger if exists orders_product_id_snapshot on public.orders;
create trigger orders_product_id_snapshot
before insert on public.orders
for each row execute function public.snapshot_order_product_id();

alter table public.messages drop constraint if exists messages_context_product_id_fkey;
alter table public.messages add column if not exists context_product_category text;
alter table public.messages add column if not exists context_product_farmer_id uuid;
alter table public.messages add column if not exists context_product_farmer_name text;
alter table public.messages add column if not exists context_product_quantity numeric(12,2);
alter table public.messages add column if not exists context_product_status text;
alter table public.messages add column if not exists context_order_id uuid;

create index if not exists messages_context_order_idx
  on public.messages (context_order_id, created_at)
  where context_order_id is not null;
create index if not exists messages_context_product_pair_idx
  on public.messages (context_product_id, sender_id, recipient_id, created_at)
  where context_product_id is not null and order_id is null;

notify pgrst, 'reload schema';
