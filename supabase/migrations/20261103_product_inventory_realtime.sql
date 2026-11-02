create table if not exists public.product_inventory_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  farmer_id uuid not null references public.profiles(id) on delete cascade,
  quantity numeric not null,
  status text not null,
  is_public boolean not null default false,
  recorded_at timestamptz not null default now()
);

create index if not exists product_inventory_events_product_recorded_idx
  on public.product_inventory_events (product_id, recorded_at desc);

alter table public.product_inventory_events enable row level security;
revoke all on public.product_inventory_events from public, anon, authenticated;
grant select on public.product_inventory_events to authenticated;
grant all on public.product_inventory_events to service_role;

drop policy if exists product_inventory_events_read on public.product_inventory_events;
create policy product_inventory_events_read on public.product_inventory_events
  for select to authenticated
  using (is_public or farmer_id = (select auth.uid()));

create or replace function public.publish_product_inventory_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.quantity is distinct from old.quantity or new.status is distinct from old.status then
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
  after update of quantity, status on public.products
  for each row
  execute function public.publish_product_inventory_change();

do $$
begin
  if to_regclass('pg_catalog.pg_publication_tables') is not null
    and exists (
      select 1 from pg_publication where pubname = 'supabase_realtime'
    )
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'product_inventory_events'
    ) then
      execute 'alter publication supabase_realtime add table public.product_inventory_events';
  end if;
end
$$;
