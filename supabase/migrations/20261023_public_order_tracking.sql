-- Public delivery tracking uses a separate identifier so internal order UUIDs
-- are never exposed or accepted by the public tracking endpoint.
alter table public.orders add column if not exists tracking_id text;

create extension if not exists pgcrypto;

update public.orders
set tracking_id = 'HL-' || upper(encode(extensions.gen_random_bytes(5), 'hex'))
where tracking_id is null;

alter table public.orders alter column tracking_id set not null;
create unique index if not exists orders_tracking_id_idx on public.orders (tracking_id);

alter table public.orders alter column tracking_id set default ('HL-' || upper(encode(extensions.gen_random_bytes(5), 'hex')));
