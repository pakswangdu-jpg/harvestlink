import { supabase } from '../lib/supabaseClient';
import { getReviewMediaExtension, REVIEW_IMAGE_MAX_SIZE, REVIEW_VIDEO_MAX_SIZE } from '../utils/reviewMedia';

function extensionFor(file) {
  const parts = file.name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'bin';
}





async function uploadToBucket(bucket, path, file, upsert = true) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert });
  if (error) throw new Error(error.message);
  return path;
}



export async function uploadProductImage(file, farmerId) {
  const path = `${farmerId}/${crypto.randomUUID()}.${extensionFor(file)}`;
  await uploadToBucket('product-images', path, file);
  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  return data.publicUrl;
}




export async function uploadAvatar(file, userId) {
  const path = `${userId}/${crypto.randomUUID()}.${extensionFor(file)}`;
  await uploadToBucket('avatars', path, file);
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}





export async function uploadChatAttachment(file, userId) {
  const path = `${userId}/${crypto.randomUUID()}.${extensionFor(file)}`;
  await uploadToBucket('chat-attachments', path, file);
  const { data } = supabase.storage.from('chat-attachments').getPublicUrl(path);
  return data.publicUrl;
}







export async function uploadGovIdFile(file, userId) {
  const path = `${userId}/govid-${crypto.randomUUID()}.${extensionFor(file)}`;
  return uploadToBucket('verification-documents', path, file);
}

export async function uploadAccreditationFile(file, userId) {
  const path = `${userId}/accreditation-${crypto.randomUUID()}.${extensionFor(file)}`;
  return uploadToBucket('verification-documents', path, file);
}





export async function uploadPaymentQr(file, farmerId) {
  const path = `${farmerId}/${crypto.randomUUID()}.${extensionFor(file)}`;
  await uploadToBucket('payment-qr', path, file);
  const { data } = supabase.storage.from('payment-qr').getPublicUrl(path);
  return data.publicUrl;
}




export async function uploadPaymentReceipt(file, buyerId) {
  const path = `${buyerId}/${crypto.randomUUID()}.${extensionFor(file)}`;
  await uploadToBucket('payment-receipts', path, file);
  const { data } = supabase.storage.from('payment-receipts').getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadReviewImage(file, raterId, orderId) {
  const extension = getReviewMediaExtension(file, 'image');
  if (!extension) throw new Error('Choose a JPG, PNG, or WebP image.');
  if (file.size > REVIEW_IMAGE_MAX_SIZE) throw new Error('Review photos must be 5 MB or smaller.');

  const path = `${raterId}/${orderId}/${crypto.randomUUID()}.${extension}`;
  await uploadToBucket('review-images', path, file, false);
  const { data } = supabase.storage.from('review-images').getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadReviewVideo(file, raterId, orderId) {
  const extension = getReviewMediaExtension(file, 'video');
  if (!extension) throw new Error('Choose an MP4 or WebM video.');
  if (file.size > REVIEW_VIDEO_MAX_SIZE) throw new Error('Review videos must be 20 MB or smaller.');

  const path = `${raterId}/${orderId}/${crypto.randomUUID()}.${extension}`;
  await uploadToBucket('review-videos', path, file, false);
  const { data } = supabase.storage.from('review-videos').getPublicUrl(path);
  return data.publicUrl;
}



export async function getSignedDocumentUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from('verification-documents').createSignedUrl(path, 60);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
