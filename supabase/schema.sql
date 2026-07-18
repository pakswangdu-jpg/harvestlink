-- HarvestLink — Supabase schema (skeleton pass: profiles, products, orders, notifications, messages)
--
-- Run this whole file once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query)
-- against a fresh project. Safe to re-run: every statement is guarded with
-- IF NOT EXISTS / OR REPLACE / DROP ... IF EXISTS so re-running after a partial failure
-- won't error out on "already exists".
--
-- Scope: donations, market-price overrides, reports, demand forecast, geocoding, and
-- translation caches are NOT part of this schema — those stay on localStorage / free
-- public APIs for now (see backend/README.md for why).

-- ============================================================================
-- Extensions
-- ============================================================================
create extension if not exists pgcrypto; -- gen_random_uuid()

-- ============================================================================
-- profiles — one row per account, 1:1 with auth.users. Farmer/stakeholder-only
-- columns are simply nullable rather than split into subtype tables, matching
-- how the app already treats a "user" as one flat object everywhere.
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('farmer','buyer','stakeholder','admin')),
  email text not null unique,
  first_name text not null default '',
  middle_name text not null default '',
  last_name text not null default '',
  name text not null default '',
  contact_number text,
  address text,
  zip_code text,
  municipality text,
  account_status text not null default 'active' check (account_status in ('active','suspended')),
  -- Shared by every role (farmer/buyer/stakeholder) — a public-bucket URL, same shape as
  -- products.image_url. Nullable: falls back to initials (see getInitials) until set.
  avatar_url text,

  -- farmer-only
  farm_name text,
  birthday date,
  gov_id_file_url text,
  verification_status text check (verification_status in ('pending','verified','rejected')),
  verification_acknowledged boolean not null default true,
  verified_at timestamptz,

  -- stakeholder-only
  organization_name text,
  organization_type text,
  contact_person text,
  accreditation_file_url text,

  -- Touched by the backend's requireAuth middleware on any authenticated request (throttled
  -- to roughly once a minute per account, not every single request) — used to show an
  -- Online/Offline presence indicator (e.g. on the Farmer Map) rather than for anything
  -- security-sensitive.
  last_active_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);

-- Safe to re-run against an already-created table from an earlier version of this schema.
alter table public.profiles add column if not exists last_active_at timestamptz;
alter table public.profiles add column if not exists avatar_url text;

-- ============================================================================
-- products
-- ============================================================================
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.profiles(id),
  name text not null,
  category text not null,
  grade text not null default 'A' check (grade in ('A','B')),
  selling_type text not null default 'retail' check (selling_type in ('retail','bulk')),
  bulk_min_quantity numeric(12,2),
  price numeric(12,2) not null check (price >= 0),
  unit text not null,
  kg_per_unit numeric(12,3),
  quantity numeric(12,2) not null default 0 check (quantity >= 0),
  location text not null,
  description text,
  image_url text,
  status text not null default 'active' check (status in ('active','inactive')),
  original_price numeric(12,2),
  discount_percent numeric(5,2),
  price_review jsonb,
  -- Optional — a farmer's own cost per unit (harvesting, inputs, labor), never shown to
  -- buyers. Powers the profit figure on the farmer dashboard (see reportService.js);
  -- null means "not recorded," not "zero cost." Snapshotted onto each order at checkout
  -- (orders.unit_cost_price below) so profit stays accurate even if this later changes.
  cost_price numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_farmer_id_idx on public.products (farmer_id);
create index if not exists products_status_idx on public.products (status);

alter table public.products add column if not exists cost_price numeric(12,2);

-- ============================================================================
-- orders — product_name/unit/unit_price/farmer_name/buyer_name are deliberately
-- SNAPSHOTTED at creation time (not joined live) — an order is a receipt of what
-- was actually transacted, so it must stay correct even if the product is later
-- renamed, re-priced, or deleted. This mirrors today's createOrder() behavior.
-- ============================================================================
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  -- Nullable + on delete set null (not "not null"/restrict) — product_name/unit/unit_price
  -- etc. are already snapshotted below, so an order stays fully readable even after its
  -- product is deleted; the FK should reflect that, not silently block the farmer from ever
  -- deleting a product once a single order has been placed against it.
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit text not null,
  unit_price numeric(12,2) not null,
  -- Snapshot of products.cost_price at checkout — null if the farmer never recorded a cost
  -- for this product. Same "receipt of what actually happened" reasoning as the other
  -- snapshotted fields above: profit (see reportService.js) must stay correct even if the
  -- farmer edits or deletes the product afterward.
  unit_cost_price numeric(12,2),
  farmer_id uuid not null references public.profiles(id),
  farmer_name text not null,
  buyer_id uuid not null references public.profiles(id),
  buyer_name text not null,
  quantity numeric(12,2) not null,
  -- Computed server-side via the Smart Distance-Based Delivery Fee System — real road
  -- distance (OSRM) priced against configurable tiers (see backend/src/lib/deliveryFee.js
  -- and deliveryFeeConfig.js) — 0/null for buyer_pickup, since the buyer travels there on
  -- their own schedule. delivery_fee is already folded into total_amount; all four are
  -- stored separately too so the checkout/order-detail/receipt UI can show the full
  -- distance/duration/tier/fee breakdown exactly as it was at order time.
  delivery_fee numeric(12,2) not null default 0,
  delivery_distance_km numeric(8,2),
  delivery_duration_minutes numeric(8,2),
  delivery_fee_tier text,
  total_amount numeric(12,2) not null,
  message text,
  payment_method text not null check (payment_method in ('cod','gcash')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','refunded')),
  delivery_method text not null check (delivery_method in ('farmer_delivery','buyer_pickup','courier')),
  delivery_status text not null default 'pending' check (delivery_status in
    ('pending','preparing','packed','ready_for_pickup','out_for_delivery','picked_up','delivered','cancelled')),
  origin_municipality text not null,
  delivery_municipality text not null,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected','completed','cancelled')),
  -- Farmer's live device GPS while an order is out for delivery (see the Socket.IO
  -- 'farmer-location' handler in backend/src/realtime/orderTracking.js and
  -- src/hooks/useFarmerActiveDeliverySharing.js) — null whenever the farmer hasn't got an
  -- active delivery, or their tab/app has been closed. The buyer's map falls back to a
  -- time-estimated position once this goes stale (see getLiveTransitProgress).
  current_lat double precision,
  current_lng double precision,
  -- Raw device sensor readings alongside the position fix — heading/speed are only ever
  -- meaningful once currentLat/currentLng are themselves fresh (see location_updated_at);
  -- both are frequently null even while moving (many devices don't report a heading/speed
  -- fix at all below a certain walking/driving speed), so the UI always treats them as
  -- optional enrichment, never a required field.
  current_heading double precision,
  current_speed double precision,
  current_accuracy double precision,
  location_updated_at timestamptz,
  -- Set once, the moment delivery_status first becomes 'out_for_delivery' (see
  -- advanceDelivery) — the anchor getLiveTransitProgress's time-estimated fallback measures
  -- elapsed transit time from. Deliberately separate from updated_at, since that column is
  -- also bumped by every location ping while GPS sharing is active (see the trigger below),
  -- which would otherwise reset the elapsed-time estimate on every single GPS update.
  transit_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_buyer_id_idx on public.orders (buyer_id);
create index if not exists orders_farmer_id_idx on public.orders (farmer_id);
create index if not exists orders_product_id_idx on public.orders (product_id);

-- Safe to re-run against an already-created table from an earlier version of this schema.
alter table public.orders add column if not exists delivery_fee numeric(12,2) not null default 0;
alter table public.orders add column if not exists current_lat double precision;
alter table public.orders add column if not exists current_lng double precision;
alter table public.orders add column if not exists current_heading double precision;
alter table public.orders add column if not exists current_speed double precision;
alter table public.orders add column if not exists current_accuracy double precision;
alter table public.orders add column if not exists location_updated_at timestamptz;
alter table public.orders add column if not exists transit_started_at timestamptz;
alter table public.orders add column if not exists unit_cost_price numeric(12,2);

-- Demo GCash payment module — set only by backend/src/controllers/payments.controller.js
-- once the simulated payment flow completes, never by the client directly.
alter table public.orders add column if not exists transaction_id text;
alter table public.orders add column if not exists paid_at timestamptz;

-- Maya/card/bank transfer were removed as selectable payment methods — HarvestLink now
-- only offers GCash (via the demo payment module) and Cash on Delivery.
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check check (payment_method in ('cod','gcash'));

-- Smart Distance-Based Delivery Fee System — snapshotted alongside delivery_fee at order
-- creation (see backend/src/lib/deliveryFee.js) so a placed order's breakdown stays exactly
-- reproducible even if the road distance or pricing tiers change afterward. All three are
-- null for a buyer-pickup order, which has no delivery leg to measure or price.
alter table public.orders add column if not exists delivery_distance_km numeric(8,2);
alter table public.orders add column if not exists delivery_duration_minutes numeric(8,2);
alter table public.orders add column if not exists delivery_fee_tier text;

-- Lets a farmer delete a product even after orders exist against it — previously this FK
-- had no ON DELETE clause (defaulting to RESTRICT), which silently blocked every such
-- delete with a foreign-key-violation error the frontend didn't surface either. Orders
-- already snapshot product_name/unit/unit_price etc., so they stay fully valid afterward.
alter table public.orders alter column product_id drop not null;
alter table public.orders drop constraint if exists orders_product_id_fkey;
alter table public.orders add constraint orders_product_id_fkey
  foreign key (product_id) references public.products(id) on delete set null;

-- ============================================================================
-- notifications
-- ============================================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  type text not null check (type in ('verification','order','donation')),
  title text not null,
  message text not null,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_read_idx on public.notifications (user_id, read);

-- ============================================================================
-- messages — either order-scoped (order_id set, recipient_id null: chat between the buyer
-- and farmer on that order) OR a general direct conversation between any two accounts
-- (order_id null, recipient_id set: e.g. contacting someone from the map before any order
-- exists between you). Exactly one of the two is set, never both, never neither — see
-- backend/src/controllers/messages.controller.js. sender_name/sender_role are snapshotted
-- at send time, same reasoning as orders' own snapshotted product_name/farmer_name/buyer_name.
-- ============================================================================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  recipient_id uuid references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  sender_name text not null,
  sender_role text not null,
  text text not null,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  constraint messages_exactly_one_target check ((order_id is not null) <> (recipient_id is not null))
);

create index if not exists messages_order_id_idx on public.messages (order_id, created_at);
create index if not exists messages_direct_idx on public.messages (recipient_id, sender_id, created_at) where order_id is null;

-- Safe to re-run against an already-created table from an earlier version of this schema.
alter table public.messages alter column order_id drop not null;
alter table public.messages add column if not exists recipient_id uuid references public.profiles(id) on delete cascade;
alter table public.messages drop constraint if exists messages_exactly_one_target;
alter table public.messages add constraint messages_exactly_one_target check ((order_id is not null) <> (recipient_id is not null));

-- ============================================================================
-- ratings — a buyer rates the farmer after confirming receipt of a completed order
-- (order_id set, one rating per order); a stakeholder rates the farmer after confirming
-- receipt of a donation (order_id null, since donations aren't backend-tracked — see
-- src/services/donationService.js). Farmer's own average is computed on read (see
-- backend/src/controllers/profiles.controller.js), not stored, so it's never stale.
-- ============================================================================
create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.profiles(id) on delete cascade,
  rater_id uuid not null references public.profiles(id) on delete cascade,
  rater_role text not null check (rater_role in ('buyer','stakeholder')),
  order_id uuid references public.orders(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists ratings_farmer_id_idx on public.ratings (farmer_id);
-- A buyer can only rate a given order once — no such constraint for stakeholder ratings
-- (order_id null), since those aren't anchored to a unique backend record.
create unique index if not exists ratings_order_id_unique on public.ratings (order_id) where order_id is not null;

-- ============================================================================
-- updated_at maintenance trigger
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Row Level Security — enabled on every table; only ONE real policy exists
-- (orders_select_own, below), added specifically so Supabase Realtime can push live
-- GPS/status updates straight to an order's own buyer/farmer without a round trip through
-- the backend (see src/features/orders/OrderTracking.jsx). Every other read/write still
-- goes exclusively through the backend's service_role key (which bypasses RLS
-- unconditionally), so this remains one narrow, explicit exception, not a general opening —
-- the anon/authenticated keys the frontend holds still can't read or write anything else on
-- these tables, even via a future accidental `supabase.from('products')` call.
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.notifications enable row level security;
alter table public.messages enable row level security;
alter table public.ratings enable row level security;

-- Lets the buyer or farmer on an order receive Supabase Realtime updates for that row
-- directly — Realtime enforces RLS just like any other read, so without this policy the
-- client would never receive postgres_changes events at all, even for its own order. Scoped
-- to exactly "you are a party to this order," nothing broader.
drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders
  for select
  using ((select auth.uid()) = buyer_id or (select auth.uid()) = farmer_id);

-- Required for postgres_changes events to fire for this table at all — idempotent (skips
-- if the table was already added, e.g. via the Database -> Replication toggle in the
-- Supabase dashboard instead of this SQL).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

-- ============================================================================
-- Storage buckets
--   product-images        public  — product photos, freely viewable in the marketplace
--   avatars                public  — farmer/buyer/stakeholder profile pictures
--   verification-documents private — gov ID / accreditation proof, sensitive
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('verification-documents', 'verification-documents', false)
on conflict (id) do nothing;

-- product-images: a user may only write into a folder named after their own
-- auth uid (upload path convention: product-images/{farmerId}/{uuid}.{ext}).
-- Public reads (e.g. an <img> tag using getPublicUrl) are served straight off the
-- public CDN URL and never go through RLS — but a SELECT policy is still required
-- here: Storage's own upload endpoint does an INSERT ... RETURNING under the hood,
-- and Postgres enforces RLS on that implicit read-back too. Without this, every
-- authenticated upload fails with "new row violates row-level security policy"
-- even though the INSERT's own WITH CHECK is satisfied.
drop policy if exists "product-images insert own folder" on storage.objects;
create policy "product-images insert own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'product-images'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "product-images select own folder" on storage.objects;
create policy "product-images select own folder"
  on storage.objects for select
  using (
    bucket_id = 'product-images'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "product-images update own folder" on storage.objects;
create policy "product-images update own folder"
  on storage.objects for update
  using (
    bucket_id = 'product-images'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "product-images delete own folder" on storage.objects;
create policy "product-images delete own folder"
  on storage.objects for delete
  using (
    bucket_id = 'product-images'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

-- avatars: same owner-folder convention as product-images (upload path convention:
-- avatars/{userId}/{uuid}.{ext}) — any of the three roles may upload their own.
drop policy if exists "avatars insert own folder" on storage.objects;
create policy "avatars insert own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars select own folder" on storage.objects;
create policy "avatars select own folder"
  on storage.objects for select
  using (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars update own folder" on storage.objects;
create policy "avatars update own folder"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars delete own folder" on storage.objects;
create policy "avatars delete own folder"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

-- verification-documents: owner-only read AND write (private bucket). Admin
-- review of OTHER users' documents is deliberately NOT a bucket policy — it
-- goes through the backend's service-role key instead (see
-- backend/src/controllers/profiles.controller.js -> getVerificationDocuments),
-- which issues short-lived signed URLs. Keeping this policy owner-only-simple
-- avoids needing a custom "is admin" JWT claim wired into Storage RLS.
drop policy if exists "verification-documents insert own folder" on storage.objects;
create policy "verification-documents insert own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'verification-documents'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "verification-documents select own folder" on storage.objects;
create policy "verification-documents select own folder"
  on storage.objects for select
  using (
    bucket_id = 'verification-documents'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

-- ============================================================================
-- Done. Next steps (see backend/README.md):
--   1. Dashboard -> Authentication -> Providers -> Email -> turn OFF "Confirm email"
--      (this prototype logs a user in immediately at registration, with no
--      transactional email step).
--   2. Copy Project URL / anon key / service_role key from
--      Dashboard -> Settings -> API into your Render + Vercel env vars.
--   3. Run backend/scripts/seedAdmin.js once to create the real admin account
--      (replaces the old hardcoded admin@harvestlink.com / admin plaintext login).
-- ============================================================================
