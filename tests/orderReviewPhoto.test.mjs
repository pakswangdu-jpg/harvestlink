import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Completed-order feedback accepts optional review photos or video', async () => {
  const source = await readFile(new URL('../src/features/orders/OrderTracking.jsx', import.meta.url), 'utf8');
  const mediaRules = await readFile(new URL('../src/utils/reviewMedia.js', import.meta.url), 'utf8');
  assert.match(source, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(source, /multiple/);
  assert.match(source, /Add photos \(optional\)/);
  assert.match(source, /ratingPhotos\.length \+ files\.length > REVIEW_PHOTO_MAX_COUNT/);
  assert.match(source, /You can add up to five photos to a review\./);
  assert.match(source, /ratingPhotos\.map\(\(\{ file \}\) => uploadReviewImage\(file, currentUser\.id, order\.id\)\)/);
  assert.match(source, /uploadReviewVideo\(ratingVideo, currentUser\.id, order\.id\)/);
  assert.match(source, /reviewImageUrls,/);
  assert.match(source, /reviewVideoUrl,/);
  assert.match(source, /existingRating\.reviewVideoUrl/);
  assert.match(mediaRules, /REVIEW_IMAGE_MAX_SIZE = 5 \* 1024 \* 1024/);
  assert.match(mediaRules, /REVIEW_PHOTO_MAX_COUNT = 5/);
  assert.match(mediaRules, /REVIEW_VIDEO_MAX_SIZE = 20 \* 1024 \* 1024/);
  assert.match(mediaRules, /REVIEW_VIDEO_MAX_DURATION_SECONDS = 30/);
  assert.match(source, /duration > REVIEW_VIDEO_MAX_DURATION_SECONDS/);
  assert.match(source, /Photo \$\{index \+ 1\} attached to your review/);
});

test('Farmer reviews display optional customer photos and videos', async () => {
  const source = await readFile(new URL('../src/components/products/ProductReviewsFeed.jsx', import.meta.url), 'utf8');
  assert.match(source, /rating\.reviewImageUrls\?\.length/);
  assert.match(source, /Photo \$\{index \+ 1\} shared with this review/);
  assert.match(source, /rating\.reviewVideoUrl/);
  assert.match(source, /controls preload="metadata"/);
});

test('Multiple-review-photo migration preserves existing single-photo reviews', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261104_multiple_order_review_photos.sql', import.meta.url), 'utf8');
  assert.match(migration, /add column if not exists review_image_urls text\[\]/);
  assert.match(migration, /array\[review_image_url\]/);
  assert.match(migration, /cardinality\(review_image_urls\) = 0/);
  assert.match(migration, /cardinality\(review_image_urls\) <= 5/);
});

test('Review photo migration creates a bounded public bucket and owner-scoped writes', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261031_order_review_photos.sql', import.meta.url), 'utf8');
  assert.match(migration, /add column if not exists review_image_url text/);
  assert.match(migration, /values \('review-images', 'review-images', true, 5242880, array\['image\/jpeg', 'image\/png', 'image\/webp'\]\)/);
  assert.match(migration, /auth\.uid\(\).*storage\.foldername\(name\)\)\[1\]/s);
});

test('Review video migration creates a bounded public bucket and owner-scoped writes', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261102_order_review_videos.sql', import.meta.url), 'utf8');
  assert.match(migration, /add column if not exists review_video_url text/);
  assert.match(migration, /values \('review-videos', 'review-videos', true, 20971520, array\['video\/mp4', 'video\/webm'\]\)/);
  assert.match(migration, /auth\.uid\(\).*storage\.foldername\(name\)\)\[1\]/s);
});
