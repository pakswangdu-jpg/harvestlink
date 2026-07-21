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
  selling_type text not null default 'retail' check (selling_type in ('retail','wholesale')),
  -- Minimum Order Quantity — only meaningful when selling_type = 'wholesale'. Column used to
  -- be named bulk_min_quantity from when "Sales Type" was called "Bulk / Retail"; see the
  -- rename migration below for already-existing installs.
  moq numeric(12,2),
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
  -- Optional — when this batch/harvest goes bad. Nullable: most listings won't set one.
  -- Surfaced on the farmer's own listing card (expiring-soon/expired badge) and carried
  -- onto a donation record when the listing is donated, since near-expiry stock is exactly
  -- the kind of surplus donation partners most need to know about before pickup.
  expiration_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_farmer_id_idx on public.products (farmer_id);
create index if not exists products_status_idx on public.products (status);

alter table public.products add column if not exists cost_price numeric(12,2);
alter table public.products add column if not exists expiration_date date;

-- Sales Type rename migration (Bulk/Retail -> Retail/Wholesale) — safe to re-run: only acts
-- on an already-existing install that still has the old bulk_min_quantity column/constraint;
-- a fresh install already gets the renamed column/constraint from the create table above.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'bulk_min_quantity'
  ) then
    alter table public.products rename column bulk_min_quantity to moq;
  end if;
end $$;

alter table public.products drop constraint if exists products_selling_type_check;
update public.products set selling_type = 'wholesale' where selling_type = 'bulk';
alter table public.products add constraint products_selling_type_check check (selling_type in ('retail','wholesale'));

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
-- categories / products_catalog / units / product_units — the canonical,
-- admin-editable product catalog backing Category -> Product -> Unit cascading
-- selection everywhere in the app (product form, marketplace/listing filters,
-- demand forecast). Supersedes the earlier crop_categories/crops tables (which
-- stored a flat text[] of units per category, never deployed to production) with
-- a fully relational model that supports per-product unit overrides — an admin
-- can add/rename/deactivate a category, catalog product, or unit — and attach/
-- detach/reorder which units apply to which product and which is the default —
-- from the Admin dashboard with no code deploy (see
-- backend/src/controllers/catalog.controller.js).
--
-- products.category/products.name stay plain text (no FK to these tables) so
-- existing/legacy product rows whose category or name isn't in this catalog
-- keep working and keep displaying their legacy unit unchanged — validation
-- against this catalog only applies to NEW category/product/unit choices, never
-- to a product's own already-saved values (see products.controller.js).
-- ============================================================================
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products_catalog (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, name)
);

create index if not exists products_catalog_category_id_idx on public.products_catalog (category_id);

-- Master list of every measurement unit offered anywhere in the catalog — a
-- product references the ones that apply to it via product_units below, rather
-- than each product/category storing its own copy of the unit's name/abbreviation.
create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  abbreviation text,
  created_at timestamptz not null default now()
);

-- Which units are valid for a given catalog product, and which one is
-- pre-selected by default (see requirement 4's "automatically select the most
-- common unit whenever possible") — this is what makes the Unit dropdown fully
-- dynamic per Product instead of per Category.
create table if not exists public.product_units (
  product_id uuid not null references public.products_catalog(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  primary key (product_id, unit_id)
);

create index if not exists product_units_product_id_idx on public.product_units (product_id);
-- At most one default unit per product.
create unique index if not exists product_units_one_default_idx on public.product_units (product_id) where is_default;

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

drop trigger if exists set_categories_updated_at on public.categories;
create trigger set_categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

drop trigger if exists set_products_catalog_updated_at on public.products_catalog;
create trigger set_products_catalog_updated_at before update on public.products_catalog
  for each row execute function public.set_updated_at();

-- ============================================================================
-- categories / products_catalog / units / product_units seed data — the
-- professional agricultural taxonomy described above. Safe to re-run: ON
-- CONFLICT DO NOTHING means an admin's later edits (rename, deactivate,
-- reorder, added products/units) are never overwritten by re-running this file.
--
-- "Organic Products" has no flat category-level unit list of its own (per spec:
-- "use the same units as the corresponding product") — its seeded entries below
-- each mirror their non-organic counterpart's unit set directly. "Other" gets no
-- seeded products or units at all — administrator-defined, per spec.
-- ============================================================================
insert into public.categories (name, sort_order) values
  ('Vegetables', 1), ('Fruits', 2), ('Grains & Cereals', 3), ('Root & Tuber Crops', 4),
  ('Legumes & Pulses', 5), ('Herbs & Aromatics', 6), ('Spices & Condiments', 7),
  ('Coconut & Oil Crops', 8), ('Sugar Crops', 9), ('Beverage Crops', 10), ('Mushrooms', 11),
  ('Flowers & Ornamentals', 12), ('Medicinal Plants', 13), ('Fiber Crops', 14),
  ('Seeds, Seedlings & Nursery', 15), ('Fodder & Forage', 16), ('Livestock Products', 17),
  ('Fisheries & Aquaculture', 18), ('Organic Products', 19), ('Processed Farm Products', 20),
  ('Other', 21)
on conflict (name) do nothing;

insert into public.units (name, abbreviation) values
  ('Kilogram', 'kg'), ('Gram', 'g'), ('Piece', 'pc'), ('Bundle', null), ('Crate', null),
  ('Sack', null), ('Box', null), ('Bunch', null), ('Basket', null), ('Dozen', 'dz'),
  ('Bag', null), ('Ton', 't'), ('Pack', null), ('Bottle', null), ('Tray', null), ('Pot', null),
  ('Stem', null), ('Bouquet', null), ('Seed', null), ('Packet', null), ('Seedling', null),
  ('Bale', null), ('Liter', 'L'), ('Milliliter', 'mL'), ('Net Bag', null), ('Hand', null)
on conflict (name) do nothing;

insert into public.products_catalog (category_id, name, sort_order)
select c.id, v.product_name, v.sort_order
from (values
  ('Vegetables', 'Cabbage', 1), ('Vegetables', 'Tomato', 2), ('Vegetables', 'Eggplant', 3),
  ('Vegetables', 'Ampalaya', 4), ('Vegetables', 'Okra', 5), ('Vegetables', 'Pechay', 6),
  ('Vegetables', 'Sitaw', 7), ('Vegetables', 'Kalabasa', 8), ('Vegetables', 'Bell Pepper', 9),
  ('Vegetables', 'Carrot', 10), ('Vegetables', 'Lettuce', 11), ('Vegetables', 'Cauliflower', 12),
  ('Vegetables', 'Broccoli', 13), ('Vegetables', 'Onion', 14), ('Vegetables', 'Garlic', 15),

  ('Fruits', 'Mango', 1), ('Fruits', 'Banana', 2), ('Fruits', 'Pineapple', 3),
  ('Fruits', 'Papaya', 4), ('Fruits', 'Watermelon', 5), ('Fruits', 'Melon', 6),
  ('Fruits', 'Avocado', 7), ('Fruits', 'Calamansi', 8), ('Fruits', 'Guyabano', 9),
  ('Fruits', 'Jackfruit', 10), ('Fruits', 'Durian', 11), ('Fruits', 'Lanzones', 12),
  ('Fruits', 'Rambutan', 13), ('Fruits', 'Mangosteen', 14),

  ('Grains & Cereals', 'Rice', 1), ('Grains & Cereals', 'Corn', 2), ('Grains & Cereals', 'Sorghum', 3),

  ('Root & Tuber Crops', 'Potato', 1), ('Root & Tuber Crops', 'Sweet Potato', 2),
  ('Root & Tuber Crops', 'Cassava', 3), ('Root & Tuber Crops', 'Gabi', 4),
  ('Root & Tuber Crops', 'Ube', 5), ('Root & Tuber Crops', 'Yam', 6),

  ('Legumes & Pulses', 'Mung Bean', 1), ('Legumes & Pulses', 'Peanut', 2),
  ('Legumes & Pulses', 'Soybean', 3), ('Legumes & Pulses', 'String Beans', 4),

  ('Herbs & Aromatics', 'Basil', 1), ('Herbs & Aromatics', 'Mint', 2),
  ('Herbs & Aromatics', 'Oregano', 3), ('Herbs & Aromatics', 'Rosemary', 4),
  ('Herbs & Aromatics', 'Lemongrass', 5), ('Herbs & Aromatics', 'Cilantro', 6),

  ('Spices & Condiments', 'Ginger', 1), ('Spices & Condiments', 'Turmeric', 2),
  ('Spices & Condiments', 'Garlic', 3), ('Spices & Condiments', 'Onion', 4),
  ('Spices & Condiments', 'Black Pepper', 5), ('Spices & Condiments', 'Chili Pepper', 6),

  ('Coconut & Oil Crops', 'Coconut', 1), ('Coconut & Oil Crops', 'Oil Palm', 2),
  ('Coconut & Oil Crops', 'Sesame', 3), ('Coconut & Oil Crops', 'Sunflower', 4),

  ('Sugar Crops', 'Sugarcane', 1), ('Sugar Crops', 'Sugar Beet', 2),

  ('Beverage Crops', 'Coffee', 1), ('Beverage Crops', 'Cacao', 2), ('Beverage Crops', 'Tea', 3),

  ('Mushrooms', 'Oyster Mushroom', 1), ('Mushrooms', 'Button Mushroom', 2), ('Mushrooms', 'Shiitake', 3),

  ('Flowers & Ornamentals', 'Rose', 1), ('Flowers & Ornamentals', 'Orchid', 2),
  ('Flowers & Ornamentals', 'Sunflower', 3), ('Flowers & Ornamentals', 'Anthurium', 4),

  ('Medicinal Plants', 'Lagundi', 1), ('Medicinal Plants', 'Sambong', 2),
  ('Medicinal Plants', 'Aloe Vera', 3), ('Medicinal Plants', 'Yerba Buena', 4),

  ('Fiber Crops', 'Abaca', 1), ('Fiber Crops', 'Cotton', 2), ('Fiber Crops', 'Jute', 3),

  ('Seeds, Seedlings & Nursery', 'Vegetable Seeds', 1), ('Seeds, Seedlings & Nursery', 'Fruit Tree Seedlings', 2),
  ('Seeds, Seedlings & Nursery', 'Coconut Seedlings', 3), ('Seeds, Seedlings & Nursery', 'Rice Seedlings', 4),

  ('Fodder & Forage', 'Napier Grass', 1), ('Fodder & Forage', 'Guinea Grass', 2),
  ('Fodder & Forage', 'Corn Silage', 3), ('Fodder & Forage', 'Alfalfa', 4),

  ('Livestock Products', 'Eggs', 1), ('Livestock Products', 'Milk', 2), ('Livestock Products', 'Honey', 3),

  ('Fisheries & Aquaculture', 'Fresh Fish', 1), ('Fisheries & Aquaculture', 'Shrimp', 2),
  ('Fisheries & Aquaculture', 'Crab', 3), ('Fisheries & Aquaculture', 'Shellfish', 4),
  ('Fisheries & Aquaculture', 'Seaweed', 5),

  ('Organic Products', 'Organic Rice', 1), ('Organic Products', 'Organic Vegetables', 2),
  ('Organic Products', 'Organic Cabbage', 3), ('Organic Products', 'Organic Coffee', 4),
  ('Organic Products', 'Organic Cacao', 5), ('Organic Products', 'Organic Honey', 6),
  ('Organic Products', 'Organic Eggs', 7), ('Organic Products', 'Organic Brown Sugar', 8),

  ('Processed Farm Products', 'Rice Flour', 1), ('Processed Farm Products', 'Corn Flour', 2),
  ('Processed Farm Products', 'Ground Coffee', 3), ('Processed Farm Products', 'Cocoa Powder', 4),
  ('Processed Farm Products', 'Coconut Oil', 5), ('Processed Farm Products', 'Brown Sugar', 6),
  ('Processed Farm Products', 'Dried Fruits', 7)
) as v(category_name, product_name, sort_order)
join public.categories c on c.name = v.category_name
on conflict (category_id, name) do nothing;

-- Product-level unit overrides (requirement 6) plus the full explicit lists for
-- Livestock Products / Fisheries & Aquaculture / Processed Farm Products (which
-- have no flat category default per requirement 5) and Organic Products (which
-- mirrors its corresponding non-organic product's units). Must run BEFORE the
-- category-default insert below, which only fills in products that still have
-- zero units at that point.
insert into public.product_units (product_id, unit_id, is_default, sort_order)
select p.id, u.id, (v.sort_order = 1), v.sort_order
from (values
  ('Grains & Cereals','Rice','Kilogram',1), ('Grains & Cereals','Rice','Sack',2), ('Grains & Cereals','Rice','Ton',3),
  ('Grains & Cereals','Corn','Kilogram',1), ('Grains & Cereals','Corn','Sack',2), ('Grains & Cereals','Corn','Ton',3),
  ('Fruits','Banana','Bunch',1), ('Fruits','Banana','Hand',2), ('Fruits','Banana','Kilogram',3), ('Fruits','Banana','Crate',4),
  ('Fruits','Mango','Piece',1), ('Fruits','Mango','Kilogram',2), ('Fruits','Mango','Crate',3), ('Fruits','Mango','Box',4),
  ('Fruits','Pineapple','Piece',1), ('Fruits','Pineapple','Kilogram',2), ('Fruits','Pineapple','Crate',3),
  ('Vegetables','Tomato','Kilogram',1), ('Vegetables','Tomato','Crate',2), ('Vegetables','Tomato','Box',3),
  ('Vegetables','Cabbage','Piece',1), ('Vegetables','Cabbage','Kilogram',2), ('Vegetables','Cabbage','Crate',3),
  ('Vegetables','Onion','Kilogram',1), ('Vegetables','Onion','Sack',2), ('Vegetables','Onion','Net Bag',3),
  ('Spices & Condiments','Onion','Kilogram',1), ('Spices & Condiments','Onion','Sack',2), ('Spices & Condiments','Onion','Net Bag',3),
  ('Vegetables','Garlic','Kilogram',1), ('Vegetables','Garlic','Net Bag',2),
  ('Spices & Condiments','Garlic','Kilogram',1), ('Spices & Condiments','Garlic','Net Bag',2),
  ('Root & Tuber Crops','Potato','Kilogram',1), ('Root & Tuber Crops','Potato','Sack',2), ('Root & Tuber Crops','Potato','Crate',3),
  ('Vegetables','Carrot','Kilogram',1), ('Vegetables','Carrot','Bundle',2), ('Vegetables','Carrot','Crate',3),
  ('Beverage Crops','Coffee','Kilogram',1), ('Beverage Crops','Coffee','Sack',2),
  ('Beverage Crops','Cacao','Kilogram',1), ('Beverage Crops','Cacao','Sack',2),
  ('Sugar Crops','Sugarcane','Bundle',1), ('Sugar Crops','Sugarcane','Ton',2),

  ('Livestock Products','Eggs','Piece',1), ('Livestock Products','Eggs','Dozen',2), ('Livestock Products','Eggs','Tray',3),
  ('Livestock Products','Milk','Liter',1), ('Livestock Products','Milk','Milliliter',2),
  ('Livestock Products','Honey','Bottle',1), ('Livestock Products','Honey','Liter',2),

  ('Fisheries & Aquaculture','Fresh Fish','Kilogram',1), ('Fisheries & Aquaculture','Fresh Fish','Piece',2), ('Fisheries & Aquaculture','Fresh Fish','Crate',3),
  ('Fisheries & Aquaculture','Shrimp','Kilogram',1), ('Fisheries & Aquaculture','Shrimp','Box',2),
  ('Fisheries & Aquaculture','Crab','Kilogram',1), ('Fisheries & Aquaculture','Crab','Piece',2),
  ('Fisheries & Aquaculture','Shellfish','Kilogram',1), ('Fisheries & Aquaculture','Shellfish','Sack',2), ('Fisheries & Aquaculture','Shellfish','Crate',3),
  ('Fisheries & Aquaculture','Seaweed','Kilogram',1), ('Fisheries & Aquaculture','Seaweed','Bundle',2), ('Fisheries & Aquaculture','Seaweed','Sack',3),

  ('Processed Farm Products','Rice Flour','Kilogram',1), ('Processed Farm Products','Rice Flour','Gram',2), ('Processed Farm Products','Rice Flour','Pack',3),
  ('Processed Farm Products','Corn Flour','Kilogram',1), ('Processed Farm Products','Corn Flour','Gram',2), ('Processed Farm Products','Corn Flour','Pack',3),
  ('Processed Farm Products','Ground Coffee','Gram',1), ('Processed Farm Products','Ground Coffee','Kilogram',2), ('Processed Farm Products','Ground Coffee','Pack',3),
  ('Processed Farm Products','Cocoa Powder','Gram',1), ('Processed Farm Products','Cocoa Powder','Kilogram',2), ('Processed Farm Products','Cocoa Powder','Pack',3),
  ('Processed Farm Products','Coconut Oil','Bottle',1), ('Processed Farm Products','Coconut Oil','Liter',2), ('Processed Farm Products','Coconut Oil','Milliliter',3),
  ('Processed Farm Products','Brown Sugar','Kilogram',1), ('Processed Farm Products','Brown Sugar','Gram',2), ('Processed Farm Products','Brown Sugar','Sack',3),
  ('Processed Farm Products','Dried Fruits','Gram',1), ('Processed Farm Products','Dried Fruits','Kilogram',2), ('Processed Farm Products','Dried Fruits','Pack',3),

  ('Organic Products','Organic Rice','Kilogram',1), ('Organic Products','Organic Rice','Sack',2), ('Organic Products','Organic Rice','Ton',3),
  ('Organic Products','Organic Vegetables','Kilogram',1), ('Organic Products','Organic Vegetables','Gram',2),
  ('Organic Products','Organic Vegetables','Piece',3), ('Organic Products','Organic Vegetables','Bundle',4), ('Organic Products','Organic Vegetables','Crate',5),
  ('Organic Products','Organic Cabbage','Piece',1), ('Organic Products','Organic Cabbage','Kilogram',2), ('Organic Products','Organic Cabbage','Crate',3),
  ('Organic Products','Organic Coffee','Kilogram',1), ('Organic Products','Organic Coffee','Sack',2),
  ('Organic Products','Organic Cacao','Kilogram',1), ('Organic Products','Organic Cacao','Sack',2),
  ('Organic Products','Organic Honey','Bottle',1), ('Organic Products','Organic Honey','Liter',2),
  ('Organic Products','Organic Eggs','Piece',1), ('Organic Products','Organic Eggs','Dozen',2), ('Organic Products','Organic Eggs','Tray',3),
  ('Organic Products','Organic Brown Sugar','Kilogram',1), ('Organic Products','Organic Brown Sugar','Gram',2), ('Organic Products','Organic Brown Sugar','Sack',3)
) as v(category_name, product_name, unit_name, sort_order)
join public.categories c on c.name = v.category_name
join public.products_catalog p on p.category_id = c.id and p.name = v.product_name
join public.units u on u.name = v.unit_name
on conflict (product_id, unit_id) do nothing;

-- Category-level default units (requirement 5) — applied only to a catalog
-- product that doesn't already have units assigned above, so this never
-- overrides a product-level override or the explicit Livestock/Fisheries/
-- Organic/Processed lists.
insert into public.product_units (product_id, unit_id, is_default, sort_order)
select p.id, u.id, (cd.sort_order = 1), cd.sort_order
from public.products_catalog p
join public.categories c on c.id = p.category_id
join (values
  ('Vegetables','Kilogram',1),('Vegetables','Gram',2),('Vegetables','Piece',3),('Vegetables','Bundle',4),('Vegetables','Crate',5),('Vegetables','Sack',6),('Vegetables','Box',7),
  ('Fruits','Kilogram',1),('Fruits','Gram',2),('Fruits','Piece',3),('Fruits','Bunch',4),('Fruits','Basket',5),('Fruits','Crate',6),('Fruits','Box',7),('Fruits','Dozen',8),
  ('Grains & Cereals','Kilogram',1),('Grains & Cereals','Sack',2),('Grains & Cereals','Bag',3),('Grains & Cereals','Ton',4),
  ('Root & Tuber Crops','Kilogram',1),('Root & Tuber Crops','Gram',2),('Root & Tuber Crops','Piece',3),('Root & Tuber Crops','Sack',4),('Root & Tuber Crops','Crate',5),
  ('Legumes & Pulses','Kilogram',1),('Legumes & Pulses','Gram',2),('Legumes & Pulses','Sack',3),('Legumes & Pulses','Bag',4),
  ('Herbs & Aromatics','Gram',1),('Herbs & Aromatics','Kilogram',2),('Herbs & Aromatics','Bundle',3),('Herbs & Aromatics','Bunch',4),('Herbs & Aromatics','Pack',5),
  ('Spices & Condiments','Gram',1),('Spices & Condiments','Kilogram',2),('Spices & Condiments','Pack',3),('Spices & Condiments','Bottle',4),
  ('Coconut & Oil Crops','Piece',1),('Coconut & Oil Crops','Kilogram',2),('Coconut & Oil Crops','Sack',3),('Coconut & Oil Crops','Ton',4),
  ('Sugar Crops','Kilogram',1),('Sugar Crops','Ton',2),('Sugar Crops','Bundle',3),
  ('Beverage Crops','Kilogram',1),('Beverage Crops','Sack',2),('Beverage Crops','Bag',3),
  ('Mushrooms','Gram',1),('Mushrooms','Kilogram',2),('Mushrooms','Tray',3),('Mushrooms','Pack',4),
  ('Flowers & Ornamentals','Stem',1),('Flowers & Ornamentals','Bouquet',2),('Flowers & Ornamentals','Pot',3),('Flowers & Ornamentals','Tray',4),
  ('Medicinal Plants','Gram',1),('Medicinal Plants','Kilogram',2),('Medicinal Plants','Bundle',3),
  ('Fiber Crops','Bundle',1),('Fiber Crops','Kilogram',2),('Fiber Crops','Ton',3),
  ('Seeds, Seedlings & Nursery','Seed',1),('Seeds, Seedlings & Nursery','Packet',2),('Seeds, Seedlings & Nursery','Tray',3),('Seeds, Seedlings & Nursery','Seedling',4),('Seeds, Seedlings & Nursery','Pot',5),
  ('Fodder & Forage','Bale',1),('Fodder & Forage','Bundle',2),('Fodder & Forage','Kilogram',3),('Fodder & Forage','Ton',4)
) as cd(category_name, unit_name, sort_order) on cd.category_name = c.name
join public.units u on u.name = cd.unit_name
where not exists (select 1 from public.product_units pu where pu.product_id = p.id)
on conflict (product_id, unit_id) do nothing;

-- ============================================================================
-- Per-product unit refinement pass — replaces the category-default units seeded above
-- with an exact, explicit unit list for every product named below (only "kg" is a real
-- abbreviation in practice; every other unit — gram, piece, dozen, ton, liter, milliliter —
-- is written and stored as the full word). Products not named below (e.g. Guyabano,
-- Jackfruit, Fresh Fish, Shellfish, Cocoa Powder) are untouched and keep whatever units they
-- already had. Safe to re-run: the delete+insert below only ever touches the exact
-- (category, product) pairs listed, and unit matching is case-insensitive against each
-- unit's stored value (abbreviation, or lowercased name).
-- ============================================================================
update public.units set abbreviation = null
where name in ('Gram', 'Piece', 'Dozen', 'Ton', 'Liter', 'Milliliter') and abbreviation is not null;

-- Tilapia/Bangus are new, more specific catalog entries than the earlier generic "Fresh Fish".
insert into public.products_catalog (category_id, name, sort_order)
select c.id, v.product_name, v.sort_order
from (values
  ('Fisheries & Aquaculture', 'Tilapia', 6),
  ('Fisheries & Aquaculture', 'Bangus', 7)
) as v(category_name, product_name, sort_order)
join public.categories c on c.name = v.category_name
on conflict (category_id, name) do nothing;

delete from public.product_units
where product_id in (
  select p.id
  from public.products_catalog p
  join public.categories c on c.id = p.category_id
  join (values
    ('Vegetables','Tomato'), ('Vegetables','Cabbage'), ('Vegetables','Eggplant'), ('Vegetables','Okra'),
    ('Vegetables','Pechay'), ('Vegetables','Sitaw'), ('Vegetables','Bell Pepper'), ('Vegetables','Carrot'),
    ('Vegetables','Broccoli'), ('Vegetables','Cauliflower'), ('Vegetables','Lettuce'), ('Vegetables','Onion'),
    ('Vegetables','Garlic'), ('Vegetables','Ampalaya'), ('Vegetables','Kalabasa'),
    ('Fruits','Banana'), ('Fruits','Mango'), ('Fruits','Pineapple'), ('Fruits','Papaya'),
    ('Fruits','Watermelon'), ('Fruits','Melon'), ('Fruits','Avocado'), ('Fruits','Durian'),
    ('Fruits','Rambutan'), ('Fruits','Mangosteen'), ('Fruits','Calamansi'), ('Fruits','Lanzones'),
    ('Grains & Cereals','Rice'), ('Grains & Cereals','Corn'), ('Grains & Cereals','Sorghum'),
    ('Root & Tuber Crops','Potato'), ('Root & Tuber Crops','Sweet Potato'), ('Root & Tuber Crops','Cassava'),
    ('Root & Tuber Crops','Gabi'), ('Root & Tuber Crops','Ube'), ('Root & Tuber Crops','Yam'),
    ('Legumes & Pulses','Mung Bean'), ('Legumes & Pulses','Soybean'), ('Legumes & Pulses','Peanut'),
    ('Legumes & Pulses','String Beans'),
    ('Herbs & Aromatics','Basil'), ('Herbs & Aromatics','Mint'), ('Herbs & Aromatics','Rosemary'),
    ('Herbs & Aromatics','Oregano'), ('Herbs & Aromatics','Lemongrass'), ('Herbs & Aromatics','Cilantro'),
    ('Spices & Condiments','Ginger'), ('Spices & Condiments','Turmeric'),
    ('Spices & Condiments','Black Pepper'), ('Spices & Condiments','Chili Pepper'),
    ('Coconut & Oil Crops','Coconut'), ('Coconut & Oil Crops','Oil Palm'),
    ('Coconut & Oil Crops','Sesame'), ('Coconut & Oil Crops','Sunflower'),
    ('Sugar Crops','Sugarcane'), ('Sugar Crops','Sugar Beet'),
    ('Beverage Crops','Coffee'), ('Beverage Crops','Cacao'), ('Beverage Crops','Tea'),
    ('Mushrooms','Oyster Mushroom'), ('Mushrooms','Button Mushroom'), ('Mushrooms','Shiitake'),
    ('Flowers & Ornamentals','Rose'), ('Flowers & Ornamentals','Orchid'),
    ('Flowers & Ornamentals','Sunflower'), ('Flowers & Ornamentals','Anthurium'),
    ('Medicinal Plants','Lagundi'), ('Medicinal Plants','Sambong'),
    ('Medicinal Plants','Aloe Vera'), ('Medicinal Plants','Yerba Buena'),
    ('Fiber Crops','Abaca'), ('Fiber Crops','Cotton'), ('Fiber Crops','Jute'),
    ('Seeds, Seedlings & Nursery','Vegetable Seeds'), ('Seeds, Seedlings & Nursery','Fruit Tree Seedlings'),
    ('Seeds, Seedlings & Nursery','Rice Seedlings'), ('Seeds, Seedlings & Nursery','Coconut Seedlings'),
    ('Fodder & Forage','Napier Grass'), ('Fodder & Forage','Guinea Grass'),
    ('Fodder & Forage','Corn Silage'), ('Fodder & Forage','Alfalfa'),
    ('Livestock Products','Eggs'), ('Livestock Products','Milk'), ('Livestock Products','Honey'),
    ('Fisheries & Aquaculture','Tilapia'), ('Fisheries & Aquaculture','Bangus'),
    ('Fisheries & Aquaculture','Shrimp'), ('Fisheries & Aquaculture','Crab'), ('Fisheries & Aquaculture','Seaweed'),
    ('Processed Farm Products','Rice Flour'), ('Processed Farm Products','Corn Flour'),
    ('Processed Farm Products','Ground Coffee'), ('Processed Farm Products','Coconut Oil'),
    ('Processed Farm Products','Brown Sugar'), ('Processed Farm Products','Dried Fruits')
  ) as v(category_name, product_name) on v.category_name = c.name and v.product_name = p.name
);

insert into public.product_units (product_id, unit_id, is_default, sort_order)
select p.id, u.id, (v.sort_order = 1), v.sort_order
from (values
  ('Vegetables','Tomato','kg',1), ('Vegetables','Tomato','crate',2), ('Vegetables','Tomato','box',3),
  ('Vegetables','Cabbage','piece',1), ('Vegetables','Cabbage','kg',2), ('Vegetables','Cabbage','crate',3),
  ('Vegetables','Eggplant','kg',1), ('Vegetables','Eggplant','crate',2), ('Vegetables','Eggplant','box',3),
  ('Vegetables','Okra','kg',1), ('Vegetables','Okra','bundle',2), ('Vegetables','Okra','crate',3),
  ('Vegetables','Pechay','bundle',1), ('Vegetables','Pechay','piece',2), ('Vegetables','Pechay','kg',3),
  ('Vegetables','Sitaw','bundle',1), ('Vegetables','Sitaw','kg',2),
  ('Vegetables','Bell Pepper','kg',1), ('Vegetables','Bell Pepper','crate',2), ('Vegetables','Bell Pepper','box',3),
  ('Vegetables','Carrot','kg',1), ('Vegetables','Carrot','bundle',2), ('Vegetables','Carrot','crate',3),
  ('Vegetables','Broccoli','kg',1), ('Vegetables','Broccoli','piece',2), ('Vegetables','Broccoli','crate',3),
  ('Vegetables','Cauliflower','piece',1), ('Vegetables','Cauliflower','kg',2), ('Vegetables','Cauliflower','crate',3),
  ('Vegetables','Lettuce','piece',1), ('Vegetables','Lettuce','kg',2), ('Vegetables','Lettuce','crate',3),
  ('Vegetables','Onion','kg',1), ('Vegetables','Onion','sack',2), ('Vegetables','Onion','net bag',3),
  ('Vegetables','Garlic','kg',1), ('Vegetables','Garlic','net bag',2),
  ('Vegetables','Ampalaya','kg',1), ('Vegetables','Ampalaya','crate',2),
  ('Vegetables','Kalabasa','piece',1), ('Vegetables','Kalabasa','kg',2),

  ('Fruits','Banana','bunch',1), ('Fruits','Banana','hand',2), ('Fruits','Banana','kg',3), ('Fruits','Banana','crate',4),
  ('Fruits','Mango','piece',1), ('Fruits','Mango','kg',2), ('Fruits','Mango','crate',3), ('Fruits','Mango','box',4),
  ('Fruits','Pineapple','piece',1), ('Fruits','Pineapple','crate',2), ('Fruits','Pineapple','kg',3),
  ('Fruits','Papaya','piece',1), ('Fruits','Papaya','kg',2), ('Fruits','Papaya','crate',3),
  ('Fruits','Watermelon','piece',1), ('Fruits','Watermelon','kg',2),
  ('Fruits','Melon','piece',1), ('Fruits','Melon','kg',2),
  ('Fruits','Avocado','piece',1), ('Fruits','Avocado','kg',2), ('Fruits','Avocado','crate',3),
  ('Fruits','Durian','piece',1), ('Fruits','Durian','kg',2), ('Fruits','Durian','crate',3),
  ('Fruits','Rambutan','kg',1), ('Fruits','Rambutan','bunch',2), ('Fruits','Rambutan','crate',3),
  ('Fruits','Mangosteen','kg',1), ('Fruits','Mangosteen','crate',2),
  ('Fruits','Calamansi','kg',1), ('Fruits','Calamansi','sack',2), ('Fruits','Calamansi','crate',3),
  ('Fruits','Lanzones','kg',1), ('Fruits','Lanzones','crate',2),

  ('Grains & Cereals','Rice','kg',1), ('Grains & Cereals','Rice','sack',2), ('Grains & Cereals','Rice','ton',3),
  ('Grains & Cereals','Corn','kg',1), ('Grains & Cereals','Corn','sack',2), ('Grains & Cereals','Corn','ton',3),
  ('Grains & Cereals','Sorghum','kg',1), ('Grains & Cereals','Sorghum','sack',2),

  ('Root & Tuber Crops','Potato','kg',1), ('Root & Tuber Crops','Potato','sack',2), ('Root & Tuber Crops','Potato','crate',3),
  ('Root & Tuber Crops','Sweet Potato','kg',1), ('Root & Tuber Crops','Sweet Potato','sack',2),
  ('Root & Tuber Crops','Cassava','kg',1), ('Root & Tuber Crops','Cassava','bundle',2),
  ('Root & Tuber Crops','Gabi','kg',1), ('Root & Tuber Crops','Gabi','sack',2),
  ('Root & Tuber Crops','Ube','kg',1), ('Root & Tuber Crops','Ube','sack',2),
  ('Root & Tuber Crops','Yam','kg',1), ('Root & Tuber Crops','Yam','sack',2),

  ('Legumes & Pulses','Mung Bean','kg',1), ('Legumes & Pulses','Mung Bean','sack',2),
  ('Legumes & Pulses','Soybean','kg',1), ('Legumes & Pulses','Soybean','sack',2),
  ('Legumes & Pulses','Peanut','kg',1), ('Legumes & Pulses','Peanut','sack',2),
  ('Legumes & Pulses','String Beans','bundle',1), ('Legumes & Pulses','String Beans','kg',2),

  ('Herbs & Aromatics','Basil','bunch',1), ('Herbs & Aromatics','Basil','gram',2),
  ('Herbs & Aromatics','Mint','bunch',1), ('Herbs & Aromatics','Mint','gram',2),
  ('Herbs & Aromatics','Rosemary','bunch',1), ('Herbs & Aromatics','Rosemary','gram',2),
  ('Herbs & Aromatics','Oregano','bunch',1), ('Herbs & Aromatics','Oregano','gram',2),
  ('Herbs & Aromatics','Lemongrass','bundle',1), ('Herbs & Aromatics','Lemongrass','piece',2),
  ('Herbs & Aromatics','Cilantro','bunch',1), ('Herbs & Aromatics','Cilantro','gram',2),

  ('Spices & Condiments','Ginger','kg',1), ('Spices & Condiments','Ginger','sack',2),
  ('Spices & Condiments','Turmeric','kg',1), ('Spices & Condiments','Turmeric','sack',2),
  ('Spices & Condiments','Black Pepper','kg',1), ('Spices & Condiments','Black Pepper','gram',2),
  ('Spices & Condiments','Chili Pepper','kg',1), ('Spices & Condiments','Chili Pepper','crate',2),

  ('Coconut & Oil Crops','Coconut','piece',1), ('Coconut & Oil Crops','Coconut','sack',2),
  ('Coconut & Oil Crops','Oil Palm','kg',1), ('Coconut & Oil Crops','Oil Palm','ton',2),
  ('Coconut & Oil Crops','Sesame','kg',1), ('Coconut & Oil Crops','Sesame','sack',2),
  ('Coconut & Oil Crops','Sunflower','bundle',1), ('Coconut & Oil Crops','Sunflower','piece',2),

  ('Sugar Crops','Sugarcane','bundle',1), ('Sugar Crops','Sugarcane','ton',2),
  ('Sugar Crops','Sugar Beet','kg',1), ('Sugar Crops','Sugar Beet','ton',2),

  ('Beverage Crops','Coffee','kg',1), ('Beverage Crops','Coffee','sack',2),
  ('Beverage Crops','Cacao','kg',1), ('Beverage Crops','Cacao','sack',2),
  ('Beverage Crops','Tea','kg',1), ('Beverage Crops','Tea','pack',2),

  ('Mushrooms','Oyster Mushroom','pack',1), ('Mushrooms','Oyster Mushroom','kg',2),
  ('Mushrooms','Button Mushroom','pack',1), ('Mushrooms','Button Mushroom','kg',2),
  ('Mushrooms','Shiitake','pack',1), ('Mushrooms','Shiitake','kg',2),

  ('Flowers & Ornamentals','Rose','stem',1), ('Flowers & Ornamentals','Rose','bouquet',2),
  ('Flowers & Ornamentals','Orchid','pot',1), ('Flowers & Ornamentals','Orchid','stem',2),
  ('Flowers & Ornamentals','Sunflower','stem',1), ('Flowers & Ornamentals','Sunflower','bouquet',2),
  ('Flowers & Ornamentals','Anthurium','pot',1), ('Flowers & Ornamentals','Anthurium','stem',2),

  ('Medicinal Plants','Lagundi','bundle',1), ('Medicinal Plants','Lagundi','kg',2),
  ('Medicinal Plants','Sambong','bundle',1), ('Medicinal Plants','Sambong','kg',2),
  ('Medicinal Plants','Aloe Vera','piece',1), ('Medicinal Plants','Aloe Vera','kg',2),
  ('Medicinal Plants','Yerba Buena','bundle',1), ('Medicinal Plants','Yerba Buena','gram',2),

  ('Fiber Crops','Abaca','bundle',1), ('Fiber Crops','Abaca','ton',2),
  ('Fiber Crops','Cotton','kg',1), ('Fiber Crops','Cotton','bale',2),
  ('Fiber Crops','Jute','bundle',1), ('Fiber Crops','Jute','bale',2),

  ('Seeds, Seedlings & Nursery','Vegetable Seeds','packet',1),
  ('Seeds, Seedlings & Nursery','Fruit Tree Seedlings','seedling',1), ('Seeds, Seedlings & Nursery','Fruit Tree Seedlings','pot',2),
  ('Seeds, Seedlings & Nursery','Rice Seedlings','tray',1),
  ('Seeds, Seedlings & Nursery','Coconut Seedlings','seedling',1),

  ('Fodder & Forage','Napier Grass','bale',1), ('Fodder & Forage','Napier Grass','bundle',2),
  ('Fodder & Forage','Guinea Grass','bale',1), ('Fodder & Forage','Guinea Grass','bundle',2),
  ('Fodder & Forage','Corn Silage','bale',1), ('Fodder & Forage','Corn Silage','ton',2),
  ('Fodder & Forage','Alfalfa','bale',1), ('Fodder & Forage','Alfalfa','bundle',2),

  ('Livestock Products','Eggs','piece',1), ('Livestock Products','Eggs','dozen',2), ('Livestock Products','Eggs','tray',3),
  ('Livestock Products','Milk','liter',1), ('Livestock Products','Milk','milliliter',2),
  ('Livestock Products','Honey','bottle',1), ('Livestock Products','Honey','liter',2), ('Livestock Products','Honey','milliliter',3),

  ('Fisheries & Aquaculture','Tilapia','kg',1), ('Fisheries & Aquaculture','Tilapia','piece',2), ('Fisheries & Aquaculture','Tilapia','crate',3),
  ('Fisheries & Aquaculture','Bangus','kg',1), ('Fisheries & Aquaculture','Bangus','piece',2), ('Fisheries & Aquaculture','Bangus','crate',3),
  ('Fisheries & Aquaculture','Shrimp','kg',1), ('Fisheries & Aquaculture','Shrimp','box',2),
  ('Fisheries & Aquaculture','Crab','kg',1), ('Fisheries & Aquaculture','Crab','piece',2),
  ('Fisheries & Aquaculture','Seaweed','kg',1), ('Fisheries & Aquaculture','Seaweed','bundle',2),

  ('Processed Farm Products','Rice Flour','kg',1), ('Processed Farm Products','Rice Flour','gram',2), ('Processed Farm Products','Rice Flour','pack',3),
  ('Processed Farm Products','Corn Flour','kg',1), ('Processed Farm Products','Corn Flour','gram',2), ('Processed Farm Products','Corn Flour','pack',3),
  ('Processed Farm Products','Ground Coffee','kg',1), ('Processed Farm Products','Ground Coffee','gram',2), ('Processed Farm Products','Ground Coffee','pack',3),
  ('Processed Farm Products','Coconut Oil','bottle',1), ('Processed Farm Products','Coconut Oil','liter',2), ('Processed Farm Products','Coconut Oil','milliliter',3),
  ('Processed Farm Products','Brown Sugar','kg',1), ('Processed Farm Products','Brown Sugar','sack',2),
  ('Processed Farm Products','Dried Fruits','pack',1), ('Processed Farm Products','Dried Fruits','kg',2)
) as v(category_name, product_name, unit_name, sort_order)
join public.categories c on c.name = v.category_name
join public.products_catalog p on p.category_id = c.id and p.name = v.product_name
join public.units u on lower(coalesce(u.abbreviation, u.name)) = v.unit_name
on conflict (product_id, unit_id) do nothing;

-- ============================================================================
-- Vegetables catalog replacement — a full, granular re-specification (58 products) that
-- supersedes the smaller starter list seeded above for this one category (e.g. the plain
-- "Bell Pepper"/"Onion" entries are superseded by their Green/Red/Yellow and White/Red/
-- Yellow variants below; "Eggplant" becomes "Eggplant (Talong)", etc.). Deleting this
-- category's old products_catalog rows is safe: products.name is plain free text (never a
-- foreign key to this catalog — see products.controller.js), so no existing farmer listing
-- can be broken by it, and cascades to remove their product_units automatically. Every other
-- category is untouched. Safe to re-run.
-- ============================================================================
delete from public.products_catalog
where category_id = (select id from public.categories where name = 'Vegetables');

insert into public.products_catalog (category_id, name, sort_order)
select (select id from public.categories where name = 'Vegetables'), v.product_name, v.sort_order
from (values
  ('Cabbage', 1), ('Chinese Cabbage (Pechay Baguio)', 2), ('Lettuce', 3), ('Romaine Lettuce', 4),
  ('Iceberg Lettuce', 5), ('Pechay', 6), ('Mustard Greens (Mustasa)', 7), ('Kangkong (Water Spinach)', 8),
  ('Spinach', 9), ('Malunggay Leaves', 10), ('Saluyot', 11), ('Alugbati (Malabar Spinach)', 12),
  ('Celery', 13), ('Parsley', 14), ('Tomato', 15), ('Cherry Tomato', 16), ('Eggplant (Talong)', 17),
  ('Bell Pepper (Green)', 18), ('Bell Pepper (Red)', 19), ('Bell Pepper (Yellow)', 20),
  ('Chili Pepper', 21), ('Green Chili (Siling Haba)', 22), ('Red Chili (Siling Labuyo)', 23),
  ('Okra', 24), ('Ampalaya (Bitter Gourd)', 25), ('Patola (Sponge Gourd)', 26), ('Upo (Bottle Gourd)', 27),
  ('Sayote (Chayote)', 28), ('Kalabasa (Squash)', 29), ('Cucumber', 30), ('Zucchini', 31),
  ('Carrot', 32), ('Radish (Labanos)', 33), ('Beetroot', 34), ('Turnip', 35),
  ('White Onion', 36), ('Red Onion', 37), ('Yellow Onion', 38), ('Garlic', 39),
  ('Leeks', 40), ('Spring Onion (Scallions)', 41), ('Shallots', 42),
  ('Broccoli', 43), ('Cauliflower', 44), ('Brussels Sprouts', 45), ('Bok Choy', 46),
  ('Sitaw (Yardlong Beans)', 47), ('French Beans', 48), ('Snap Beans', 49), ('Green Peas', 50),
  ('Snow Peas', 51), ('Sugar Snap Peas', 52), ('Sweet Corn', 53), ('Baby Corn', 54),
  ('Asparagus', 55), ('Artichoke', 56), ('Celeriac', 57), ('Fennel', 58)
) as v(product_name, sort_order)
on conflict (category_id, name) do nothing;

insert into public.product_units (product_id, unit_id, is_default, sort_order)
select p.id, u.id, (v.sort_order = 1), v.sort_order
from (values
  ('Cabbage','piece',1), ('Cabbage','kg',2), ('Cabbage','crate',3),
  ('Chinese Cabbage (Pechay Baguio)','piece',1), ('Chinese Cabbage (Pechay Baguio)','kg',2),
  ('Lettuce','piece',1), ('Lettuce','kg',2), ('Lettuce','crate',3),
  ('Romaine Lettuce','piece',1), ('Romaine Lettuce','crate',2),
  ('Iceberg Lettuce','piece',1), ('Iceberg Lettuce','crate',2),
  ('Pechay','bundle',1), ('Pechay','piece',2), ('Pechay','kg',3),
  ('Mustard Greens (Mustasa)','bundle',1), ('Mustard Greens (Mustasa)','kg',2),
  ('Kangkong (Water Spinach)','bundle',1), ('Kangkong (Water Spinach)','kg',2),
  ('Spinach','bundle',1), ('Spinach','kg',2),
  ('Malunggay Leaves','bundle',1), ('Malunggay Leaves','kg',2),
  ('Saluyot','bundle',1), ('Saluyot','kg',2),
  ('Alugbati (Malabar Spinach)','bundle',1), ('Alugbati (Malabar Spinach)','kg',2),
  ('Celery','bundle',1), ('Celery','kg',2),
  ('Parsley','bundle',1), ('Parsley','gram',2),
  ('Tomato','kg',1), ('Tomato','crate',2), ('Tomato','box',3),
  ('Cherry Tomato','kg',1), ('Cherry Tomato','crate',2), ('Cherry Tomato','box',3),
  ('Eggplant (Talong)','kg',1), ('Eggplant (Talong)','crate',2), ('Eggplant (Talong)','box',3),
  ('Bell Pepper (Green)','kg',1), ('Bell Pepper (Green)','crate',2), ('Bell Pepper (Green)','box',3),
  ('Bell Pepper (Red)','kg',1), ('Bell Pepper (Red)','crate',2), ('Bell Pepper (Red)','box',3),
  ('Bell Pepper (Yellow)','kg',1), ('Bell Pepper (Yellow)','crate',2), ('Bell Pepper (Yellow)','box',3),
  ('Chili Pepper','kg',1), ('Chili Pepper','crate',2),
  ('Green Chili (Siling Haba)','kg',1), ('Green Chili (Siling Haba)','crate',2),
  ('Red Chili (Siling Labuyo)','kg',1), ('Red Chili (Siling Labuyo)','crate',2),
  ('Okra','kg',1), ('Okra','bundle',2), ('Okra','crate',3),
  ('Ampalaya (Bitter Gourd)','kg',1), ('Ampalaya (Bitter Gourd)','crate',2),
  ('Patola (Sponge Gourd)','piece',1), ('Patola (Sponge Gourd)','kg',2),
  ('Upo (Bottle Gourd)','piece',1), ('Upo (Bottle Gourd)','kg',2),
  ('Sayote (Chayote)','piece',1), ('Sayote (Chayote)','kg',2), ('Sayote (Chayote)','sack',3),
  ('Kalabasa (Squash)','piece',1), ('Kalabasa (Squash)','kg',2),
  ('Cucumber','kg',1), ('Cucumber','crate',2),
  ('Zucchini','kg',1), ('Zucchini','crate',2),
  ('Carrot','kg',1), ('Carrot','bundle',2), ('Carrot','crate',3),
  ('Radish (Labanos)','bundle',1), ('Radish (Labanos)','kg',2),
  ('Beetroot','kg',1), ('Beetroot','bundle',2),
  ('Turnip','kg',1), ('Turnip','piece',2),
  ('White Onion','kg',1), ('White Onion','sack',2), ('White Onion','net bag',3),
  ('Red Onion','kg',1), ('Red Onion','sack',2), ('Red Onion','net bag',3),
  ('Yellow Onion','kg',1), ('Yellow Onion','sack',2),
  ('Garlic','kg',1), ('Garlic','net bag',2),
  ('Leeks','bundle',1), ('Leeks','kg',2),
  ('Spring Onion (Scallions)','bundle',1), ('Spring Onion (Scallions)','kg',2),
  ('Shallots','kg',1), ('Shallots','sack',2),
  ('Broccoli','piece',1), ('Broccoli','kg',2), ('Broccoli','crate',3),
  ('Cauliflower','piece',1), ('Cauliflower','kg',2), ('Cauliflower','crate',3),
  ('Brussels Sprouts','kg',1), ('Brussels Sprouts','pack',2),
  ('Bok Choy','bundle',1), ('Bok Choy','piece',2),
  ('Sitaw (Yardlong Beans)','bundle',1), ('Sitaw (Yardlong Beans)','kg',2),
  ('French Beans','kg',1), ('French Beans','crate',2),
  ('Snap Beans','kg',1), ('Snap Beans','crate',2),
  ('Green Peas','kg',1), ('Green Peas','sack',2),
  ('Snow Peas','kg',1), ('Snow Peas','crate',2),
  ('Sugar Snap Peas','kg',1), ('Sugar Snap Peas','crate',2),
  ('Sweet Corn','piece',1), ('Sweet Corn','dozen',2), ('Sweet Corn','sack',3),
  ('Baby Corn','pack',1), ('Baby Corn','kg',2),
  ('Asparagus','bundle',1), ('Asparagus','kg',2),
  ('Artichoke','piece',1), ('Artichoke','kg',2),
  ('Celeriac','kg',1), ('Celeriac','piece',2),
  ('Fennel','piece',1), ('Fennel','bundle',2)
) as v(product_name, unit_name, sort_order)
join public.categories c on c.name = 'Vegetables'
join public.products_catalog p on p.category_id = c.id and p.name = v.product_name
join public.units u on lower(coalesce(u.abbreviation, u.name)) = v.unit_name
on conflict (product_id, unit_id) do nothing;

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
alter table public.categories enable row level security;
alter table public.products_catalog enable row level security;
alter table public.units enable row level security;
alter table public.product_units enable row level security;

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
