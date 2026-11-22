alter table public.orders
  add column if not exists manual_lalamove_tracking_url text
  check (
    manual_lalamove_tracking_url is null
    or (delivery_method = 'courier' and length(manual_lalamove_tracking_url) <= 2048
      and manual_lalamove_tracking_url ~ '^https://share\.lalamove\.com/'
      and manual_lalamove_tracking_url !~ '[[:space:][:cntrl:]\\]')
  );

notify pgrst, 'reload schema';
