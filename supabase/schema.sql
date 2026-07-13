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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_farmer_id_idx on public.products (farmer_id);
create index if not exists products_status_idx on public.products (status);

-- ============================================================================
-- orders — product_name/unit/unit_price/farmer_name/buyer_name are deliberately
-- SNAPSHOTTED at creation time (not joined live) — an order is a receipt of what
-- was actually transacted, so it must stay correct even if the product is later
-- renamed, re-priced, or deleted. This mirrors today's createOrder() behavior.
-- ============================================================================
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  product_name text not null,
  unit text not null,
  unit_price numeric(12,2) not null,
  farmer_id uuid not null references public.profiles(id),
  farmer_name text not null,
  buyer_id uuid not null references public.profiles(id),
  buyer_name text not null,
  quantity numeric(12,2) not null,
  -- Computed server-side from municipality-to-municipality distance at order creation (see
  -- backend/src/lib/deliveryFee.js) — 0 for buyer_pickup, since the buyer travels there on
  -- their own schedule. Already folded into total_amount; stored separately too so the
  -- checkout/order-detail UI can show a "product cost + delivery fee" breakdown.
  delivery_fee numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null,
  message text,
  payment_method text not null check (payment_method in ('cod','gcash','maya','card','bank')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','refunded')),
  delivery_method text not null check (delivery_method in ('farmer_delivery','buyer_pickup','courier')),
  delivery_status text not null default 'pending' check (delivery_status in
    ('pending','preparing','packed','ready_for_pickup','out_for_delivery','picked_up','delivered','cancelled')),
  origin_municipality text not null,
  delivery_municipality text not null,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_buyer_id_idx on public.orders (buyer_id);
create index if not exists orders_farmer_id_idx on public.orders (farmer_id);
create index if not exists orders_product_id_idx on public.orders (product_id);

-- Safe to re-run against an already-created table from an earlier version of this schema.
alter table public.orders add column if not exists delivery_fee numeric(12,2) not null default 0;

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
-- messages — order-scoped chat between the buyer and farmer on that order. There is no
-- such thing as a message with no order behind it (see backend/src/controllers/
-- messages.controller.js) — sender_name/sender_role are snapshotted at send time, same
-- reasoning as orders' own snapshotted product_name/farmer_name/buyer_name.
-- ============================================================================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  sender_name text not null,
  sender_role text not null,
  text text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists messages_order_id_idx on public.messages (order_id, created_at);

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
-- Row Level Security — enabled with ZERO policies on every table.
--
-- Only the backend's service_role key ever touches these four tables (it
-- bypasses RLS unconditionally, policies or not), so this costs nothing
-- operationally. The payoff: it guarantees the anon/authenticated keys the
-- frontend holds (used ONLY for Supabase Auth, per this project's design —
-- the frontend never queries these tables directly) can never read or write
-- profiles/products/orders/notifications, even via a future accidental
-- `supabase.from('orders')` call added to frontend code.
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.notifications enable row level security;
alter table public.messages enable row level security;

-- ============================================================================
-- Storage buckets
--   product-images        public  — product photos, freely viewable in the marketplace
--   verification-documents private — gov ID / accreditation proof, sensitive
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
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
