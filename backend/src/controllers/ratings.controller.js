import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeRating } from '../lib/serialize.js';
import { ApiError } from '../lib/ApiError.js';

function validateReviewMediaUrl(value, raterId, orderId, bucket, extensions, label) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 2048 || !orderId) {
    throw new ApiError(`A review ${label} must be attached to a completed order.`, 400);
  }

  let baseUrl;
  let mediaUrl;
  try {
    baseUrl = new URL(process.env.SUPABASE_URL);
    mediaUrl = new URL(value);
  } catch {
    throw new ApiError(`Review ${label} URL is invalid.`, 400);
  }

  const basePath = baseUrl.pathname.replace(/\/+$/, '');
  const expectedPrefix = `${basePath}/storage/v1/object/public/${bucket}/${raterId}/${orderId}/`;
  const filename = mediaUrl.pathname.startsWith(expectedPrefix)
    ? mediaUrl.pathname.slice(expectedPrefix.length)
    : '';
  if (
    mediaUrl.origin !== baseUrl.origin
    || mediaUrl.search
    || mediaUrl.hash
    || !new RegExp(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(${extensions.join('|')})$`, 'i').test(filename)
  ) {
    throw new ApiError(`Review ${label} must be an uploaded file for this order.`, 400);
  }
  return value;
}




export async function listRatings(req, res) {
  const { farmerId, orderId, productId } = req.query;
  if (!farmerId && !orderId && !productId) {
    throw new ApiError('farmerId, productId, or orderId is required.', 400);
  }

  if (productId) {
    const { data, error } = await supabaseAdmin
      .from('ratings')
      .select('*')
      .eq('product_id_snapshot', productId)
      .order('created_at', { ascending: false });
    if (error) throw new ApiError(error.message, 400);
    return res.json(data.map(serializeRating));
  }

  let query = supabaseAdmin.from('ratings').select('*').order('created_at', { ascending: false });
  if (farmerId) query = query.eq('farmer_id', farmerId);
  if (orderId) query = query.eq('order_id', orderId);

  const { data, error } = await query;
  if (error) throw new ApiError(error.message, 400);
  res.json(data.map(serializeRating));
}







export async function createRating(req, res) {
  const {
    farmerId, productId: submittedProductId, donationId, claimId, orderId, comment, reviewImageUrl, reviewImageUrls, reviewVideoUrl,
  } = req.body;
  const rating = Number(req.body.rating);

  if (!farmerId) throw new ApiError('farmerId is required.', 400);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ApiError('Rating must be a whole number from 1 to 5.', 400);
  if (reviewImageUrl && reviewImageUrls) throw new ApiError('Submit review photos using one image field.', 400);
  const submittedImageUrls = reviewImageUrls ?? (reviewImageUrl ? [reviewImageUrl] : []);
  if (!Array.isArray(submittedImageUrls)) throw new ApiError('Review photos must be a list of uploaded images.', 400);
  if (submittedImageUrls.length > 5) throw new ApiError('You can add up to five photos to a review.', 400, 'REVIEW_PHOTO_LIMIT');
  if (submittedImageUrls.some((url) => typeof url !== 'string' || !url.trim())) {
    throw new ApiError('Each review photo must be an uploaded image.', 400);
  }
  if (submittedImageUrls.length && reviewVideoUrl) throw new ApiError('Attach review photos or a video, not both.', 400);
  if (reviewImageUrl && reviewVideoUrl) throw new ApiError('Attach either a review photo or video, not both.', 400);

  const { data: farmer, error: farmerError } = await supabaseAdmin
    .from('profiles')
    .select('id, role')
    .eq('id', farmerId)
    .single();
  if (farmerError || !farmer || farmer.role !== 'farmer') throw new ApiError('Farmer was not found.', 404);
  if (farmerId === req.profile.id) throw new ApiError('You cannot rate yourself.', 400);

  let productId = submittedProductId || null;
  if (orderId) {
    if (req.profile.role !== 'buyer' && req.profile.role !== 'stakeholder') {
      throw new ApiError('Only buyers can rate an order.', 403);
    }
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, buyer_id, farmer_id, status, product_id_snapshot, product_id')
      .eq('id', orderId)
      .single();
    if (orderError || !order) throw new ApiError('Order was not found.', 404);
    if (order.buyer_id !== req.profile.id) throw new ApiError('You do not have permission to rate this order.', 403);
    if (order.farmer_id !== farmerId) throw new ApiError('This order was not placed with that farmer.', 400);
    if (order.status !== 'completed') throw new ApiError('You can only rate an order once it is completed.', 400);
    const orderedProductId = order.product_id_snapshot || order.product_id;
    if (!orderedProductId) throw new ApiError('This order is not linked to a product.', 400);
    if (productId && productId !== orderedProductId) {
      throw new ApiError('This review must be for the product from the completed order.', 400);
    }
    productId = orderedProductId;

    const { data: existing } = await supabaseAdmin.from('ratings').select('id').eq('order_id', orderId).maybeSingle();
    if (existing) throw new ApiError('You already rated this order.', 409);
  } else {
    if (req.profile.role !== 'stakeholder') {
      throw new ApiError('A rating must be tied to a completed order, or be from a stakeholder confirming a donation.', 400);
    }
    if (!productId) throw new ApiError('productId is required when rating a donation.', 400);
    if (!donationId) throw new ApiError('donationId is required when rating a donation.', 400);
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, farmer_id')
      .eq('id', productId)
      .single();
    if (productError || !product) throw new ApiError('The reviewed product was not found.', 404);
    if (product.farmer_id !== farmerId) throw new ApiError('This product does not belong to that farmer.', 400);
    const { data: donation, error: donationError } = await supabaseAdmin
      .from('donations')
      .select('id, product_id, farmer_id, status, requested_by_id')
      .eq('id', donationId)
      .single();
    if (donationError || !donation) throw new ApiError('The reviewed donation was not found.', 404);
    if (donation.product_id !== productId || donation.farmer_id !== farmerId) {
      throw new ApiError('This review must be for the donated product.', 400);
    }
    if (claimId) {
      const { data: claim, error: claimError } = await supabaseAdmin
        .from('donation_claims')
        .select('id, donation_id, stakeholder_id, status')
        .eq('id', claimId)
        .single();
      if (claimError || !claim) throw new ApiError('The donation receipt was not found.', 404);
      if (claim.donation_id !== donationId || claim.stakeholder_id !== req.profile.id || claim.status !== 'completed') {
        throw new ApiError('You can only review a donation you have received.', 403);
      }
    } else if (donation.requested_by_id !== req.profile.id || donation.status !== 'completed') {
      throw new ApiError('You can only review a donation you have received.', 403);
    }
  }

  const validatedReviewImageUrls = submittedImageUrls.map((url) => validateReviewMediaUrl(
    url,
    req.profile.id,
    orderId,
    'review-images',
    ['jpg', 'png', 'webp'],
    'photo',
  ));
  const validatedReviewVideoUrl = validateReviewMediaUrl(
    reviewVideoUrl,
    req.profile.id,
    orderId,
    'review-videos',
    ['mp4', 'webm'],
    'video',
  );
  const row = {
    farmer_id: farmerId,
    rater_id: req.profile.id,
    rater_role: req.profile.role,
    product_id_snapshot: productId,
    order_id: orderId || null,
    rating,
    comment: comment?.trim() || null,
    ...(validatedReviewImageUrls.length ? {
      review_image_urls: validatedReviewImageUrls,
      review_image_url: validatedReviewImageUrls[0],
    } : {}),
    ...(validatedReviewVideoUrl ? { review_video_url: validatedReviewVideoUrl } : {}),
  };
  const { data, error } = await supabaseAdmin.from('ratings').insert(row).select().single();
  if (error) {
    if (error.code === '23505') throw new ApiError('You already rated this order.', 409);
    throw new ApiError(error.message, 400);
  }
  res.status(201).json(serializeRating(data));
}
