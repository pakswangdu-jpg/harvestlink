alter table public.orders
  add column if not exists vehicle_plate_number text;
