alter table public.ratings
  add column if not exists review_image_urls text[] not null default array[]::text[];

update public.ratings
set review_image_urls = array[review_image_url]
where review_image_url is not null
  and cardinality(review_image_urls) = 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.ratings'::regclass
      and conname = 'ratings_review_image_urls_count_check'
  ) then
    alter table public.ratings
      add constraint ratings_review_image_urls_count_check
      check (
        cardinality(review_image_urls) <= 5
        and array_position(review_image_urls, null) is null
      );
  end if;
end
$$;

notify pgrst, 'reload schema';
