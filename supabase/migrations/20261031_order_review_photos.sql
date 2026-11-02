alter table public.ratings
  add column if not exists review_image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review-images', 'review-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "review-images insert own folder" on storage.objects;
create policy "review-images insert own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'review-images'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "review-images select own folder" on storage.objects;
create policy "review-images select own folder"
  on storage.objects for select
  using (
    bucket_id = 'review-images'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "review-images delete own folder" on storage.objects;
create policy "review-images delete own folder"
  on storage.objects for delete
  using (
    bucket_id = 'review-images'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

notify pgrst, 'reload schema';
