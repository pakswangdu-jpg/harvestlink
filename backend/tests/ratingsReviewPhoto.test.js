import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

process.env.SUPABASE_URL ||= 'https://harvestlink-test.supabase.co';

let insertedRating;
const farmerId = '11111111-1111-4111-8111-111111111111';
const buyerId = '22222222-2222-4222-8222-222222222222';
const orderId = '33333333-3333-4333-8333-333333333333';
const productId = '66666666-6666-4666-8666-666666666666';
const donationId = '88888888-8888-4888-8888-888888888888';
const claimId = '99999999-9999-4999-8999-999999999999';
const photoUrl = `https://harvestlink-test.supabase.co/storage/v1/object/public/review-images/${buyerId}/${orderId}/44444444-4444-4444-8444-444444444444.jpg`;
const videoUrl = `https://harvestlink-test.supabase.co/storage/v1/object/public/review-videos/${buyerId}/${orderId}/55555555-5555-4555-8555-555555555555.mp4`;

mock.module('../src/lib/supabaseClient.js', {
  namedExports: {
    supabaseAdmin: {
      from(table) {
        let inserted;
        const filters = [];
        const query = {
          select() { return this; },
          eq(field, value) { filters.push({ field, value }); return this; },
          in(field, values) { filters.push({ field, values }); return this; },
          order() { return this; },
          single() {
            if (table === 'profiles') return Promise.resolve({ data: { id: farmerId, role: 'farmer' }, error: null });
            if (table === 'orders') {
              return Promise.resolve({
                data: { id: orderId, buyer_id: buyerId, farmer_id: farmerId, status: 'completed', product_id_snapshot: productId },
                error: null,
              });
            }
            if (table === 'products') {
              return Promise.resolve({ data: { id: productId, farmer_id: farmerId }, error: null });
            }
            if (table === 'donations') {
              return Promise.resolve({
                data: { id: donationId, product_id: productId, farmer_id: farmerId, status: 'completed', requested_by_id: buyerId },
                error: null,
              });
            }
            if (table === 'donation_claims') {
              return Promise.resolve({
                data: { id: claimId, donation_id: donationId, stakeholder_id: buyerId, status: 'completed' },
                error: null,
              });
            }
            return Promise.resolve({ data: { ...inserted, id: 'rating-id', created_at: '2026-10-31T00:00:00Z' }, error: null });
          },
          maybeSingle() { return Promise.resolve({ data: null, error: null }); },
          insert(row) { inserted = row; insertedRating = row; return this; },
          then(resolve, reject) {
            if (table === 'ratings') {
              const productFilter = filters.find(({ field }) => field === 'product_id_snapshot');
              const ratings = productFilter?.value === productId
                ? [{ id: 'rating-id', product_id_snapshot: productId, order_id: orderId, farmer_id: farmerId, rater_id: buyerId, rater_role: 'buyer', rating: 5, comment: 'Fresh produce', created_at: '2026-10-31T00:00:00Z' }]
                : [];
              return Promise.resolve({ data: ratings, error: null }).then(resolve, reject);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          },
        };
        return query;
      },
    },
  },
});

const { createRating, listRatings } = await import('../src/controllers/ratings.controller.js');

beforeEach(() => {
  insertedRating = null;
});

async function submit(body) {
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  await createRating({
    profile: { id: buyerId, role: 'buyer' },
    body: { farmerId, orderId, rating: 5, comment: 'Fresh produce', ...body },
  }, response);
  return response;
}

async function listProductReviews(requestedProductId) {
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  await listRatings({ query: { productId: requestedProductId } }, response);
  return response;
}

test('product reviews are limited to orders linked to the requested product', async () => {
  const response = await listProductReviews(productId);
  assert.equal(response.body.length, 1);
  assert.equal(response.body[0].orderId, orderId);
  assert.equal(response.body[0].productId, productId);
});

test('a product with no matching orders has no product reviews', async () => {
  const response = await listProductReviews('77777777-7777-4777-8777-777777777777');
  assert.deepEqual(response.body, []);
});

test('completed-order ratings save and serialize an attached reviewer photo', async () => {
  const response = await submit({ productId, reviewImageUrl: photoUrl });
  assert.equal(response.statusCode, 201);
  assert.equal(insertedRating.product_id_snapshot, productId);
  assert.equal(response.body.productId, productId);
  assert.equal(insertedRating.review_image_url, photoUrl);
  assert.equal(response.body.reviewImageUrl, photoUrl);
  assert.deepEqual(response.body.reviewImageUrls, [photoUrl]);
});

test('completed-order ratings save and serialize multiple reviewer photos', async () => {
  const photoUrls = Array.from({ length: 5 }, (_, index) => (
    photoUrl.replace('44444444-4444-4444-8444-444444444444', `44444444-4444-4444-8444-44444444444${index}`)
  ));
  const response = await submit({ productId, reviewImageUrls: photoUrls });
  assert.equal(response.statusCode, 201);
  assert.deepEqual(insertedRating.review_image_urls, photoUrls);
  assert.deepEqual(response.body.reviewImageUrls, photoUrls);
  assert.equal(response.body.reviewImageUrl, photoUrls[0]);
});

test('review photo count beyond the allowed maximum returns a clear error', async () => {
  const photoUrls = Array.from({ length: 6 }, (_, index) => (
    photoUrl.replace('44444444-4444-4444-8444-444444444444', `44444444-4444-4444-8444-44444444444${index}`)
  ));
  await assert.rejects(submit({ productId, reviewImageUrls: photoUrls }), {
    status: 400,
    code: 'REVIEW_PHOTO_LIMIT',
    message: 'You can add up to five photos to a review.',
  });
  assert.equal(insertedRating, null);
});

test('review photo list rejects missing image URLs', async () => {
  await assert.rejects(submit({ productId, reviewImageUrls: [photoUrl, null] }), {
    status: 400,
    message: 'Each review photo must be an uploaded image.',
  });
  assert.equal(insertedRating, null);
});

test('completed-order reviews cannot be assigned to a different product', async () => {
  await assert.rejects(submit({ productId: '77777777-7777-4777-8777-777777777777' }), {
    status: 400,
    message: 'This review must be for the product from the completed order.',
  });
  assert.equal(insertedRating, null);
});

test('donation reviews require a product identifier', async () => {
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  await assert.rejects(createRating({
    profile: { id: buyerId, role: 'stakeholder' },
    body: { farmerId, rating: 5 },
  }, response), { status: 400, message: 'productId is required when rating a donation.' });
  assert.equal(insertedRating, null);
});

test('received donation reviews save the exact product and receipt', async () => {
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  await createRating({
    profile: { id: buyerId, role: 'stakeholder' },
    body: { farmerId, productId, donationId, claimId, rating: 5 },
  }, response);
  assert.equal(insertedRating.product_id_snapshot, productId);
  assert.equal(response.body.productId, productId);
});

test('completed-order ratings save and serialize an attached reviewer video', async () => {
  const response = await submit({ reviewVideoUrl: videoUrl });
  assert.equal(response.statusCode, 201);
  assert.equal(insertedRating.review_video_url, videoUrl);
  assert.equal(response.body.reviewVideoUrl, videoUrl);
});

test('review photos must be scoped to the authenticated buyer and completed order', async () => {
  for (const reviewImageUrl of [
    'https://external.example/review.jpg',
    photoUrl.replace(buyerId, farmerId),
    photoUrl.replace(orderId, farmerId),
    photoUrl.replace('.jpg', '.gif'),
  ]) {
    await assert.rejects(submit({ reviewImageUrl }), { status: 400 });
    assert.equal(insertedRating, null);
  }
});

test('review videos must be scoped to the authenticated buyer and completed order', async () => {
  for (const reviewVideoUrl of [
    'https://external.example/review.mp4',
    videoUrl.replace(buyerId, farmerId),
    videoUrl.replace(orderId, farmerId),
    videoUrl.replace('.mp4', '.mov'),
  ]) {
    await assert.rejects(submit({ reviewVideoUrl }), { status: 400 });
    assert.equal(insertedRating, null);
  }
});

test('a review cannot attach a photo and video together', async () => {
  await assert.rejects(submit({ reviewImageUrl: photoUrl, reviewVideoUrl: videoUrl }), { status: 400 });
  assert.equal(insertedRating, null);
});

test('completed-order ratings still work without an optional photo', async () => {
  const response = await submit({});
  assert.equal(response.statusCode, 201);
  assert.equal(Object.hasOwn(insertedRating, 'review_image_url'), false);
  assert.equal(response.body.reviewImageUrl, '');
  assert.equal(response.body.reviewVideoUrl, '');
});
