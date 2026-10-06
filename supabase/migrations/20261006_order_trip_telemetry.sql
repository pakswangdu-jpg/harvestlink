alter table public.orders
  add column if not exists tracked_distance_km double precision not null default 0,
  add column if not exists tracked_duration_seconds double precision not null default 0;
