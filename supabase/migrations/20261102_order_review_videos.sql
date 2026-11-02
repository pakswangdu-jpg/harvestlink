alter table public.ratings
  add column if not exists review_video_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review-videos', 'review-videos', true, 20971520, array['video/mp4', 'video/webm'])
on conflict (id) do update
set public = true,
    file_size_limit = 20971520,
    allowed_mime_types = array['video/mp4', 'video/webm'];

drop policy if exists "review-videos insert own folder" on storage.objects;
create policy "review-videos insert own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'review-videos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "review-videos select own folder" on storage.objects;
create policy "review-videos select own folder"
  on storage.objects for select
  using (
    bucket_id = 'review-videos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "review-videos delete own folder" on storage.objects;
create policy "review-videos delete own folder"
  on storage.objects for delete
  using (
    bucket_id = 'review-videos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

notify pgrst, 'reload schema';
