alter table public.products
  add column if not exists image_urls text[] not null default '{}';

update public.products
set image_urls = array[image_url]
where coalesce(cardinality(image_urls), 0) = 0
  and image_url is not null
  and image_url <> '';

notify pgrst, 'reload schema';
