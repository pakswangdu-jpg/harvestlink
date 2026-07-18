import { supabase } from '../lib/supabaseClient';

function extensionFor(file) {
  const parts = file.name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'bin';
}

// Uploads directly from the browser to Supabase Storage using the user's own session —
// not proxied through the Express backend, avoiding pushing multi-MB image/PDF uploads
// through Render for no benefit. Storage's own bucket policies (see supabase/schema.sql)
// restrict each user to writing only inside a folder named after their own auth uid.
async function uploadToBucket(bucket, path, file) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

// product-images is a PUBLIC bucket — the stored value is a full, directly-usable URL
// (what every <img src> in the app already expects product.image to be).
export async function uploadProductImage(file, farmerId) {
  const path = `${farmerId}/${crypto.randomUUID()}.${extensionFor(file)}`;
  await uploadToBucket('product-images', path, file);
  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  return data.publicUrl;
}

// avatars is a PUBLIC bucket, same shape as product-images — any of the three roles
// (farmer/buyer/stakeholder) can upload their own profile picture. Returns a
// directly-usable URL, which Profile.jsx then PATCHes onto the profile as avatarUrl.
export async function uploadAvatar(file, userId) {
  const path = `${userId}/${crypto.randomUUID()}.${extensionFor(file)}`;
  await uploadToBucket('avatars', path, file);
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

// verification-documents is a PRIVATE bucket — the stored value is the bucket-relative
// PATH, not a URL (a private bucket has no directly-fetchable public URL). Reading it back
// requires a signed URL: the owner can generate their own (see getSignedDocumentUrl below,
// used by Profile.jsx — the bucket policy grants SELECT to the owner's own session), and
// an admin gets one for ANY user's document via the backend's service-role-mediated
// endpoint (GET /api/profiles/:id/verification-documents, see authService.js).
export async function uploadGovIdFile(file, userId) {
  const path = `${userId}/govid-${crypto.randomUUID()}.${extensionFor(file)}`;
  return uploadToBucket('verification-documents', path, file);
}

export async function uploadAccreditationFile(file, userId) {
  const path = `${userId}/accreditation-${crypto.randomUUID()}.${extensionFor(file)}`;
  return uploadToBucket('verification-documents', path, file);
}

// Lets the file's OWNER view their own gov ID / accreditation upload (Profile.jsx) —
// works via the regular client session because the bucket's SELECT policy already grants
// the owner read access to their own folder (see supabase/schema.sql). A short expiry
// (60s) is plenty since this is only ever used to immediately open the file in a new tab.
export async function getSignedDocumentUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from('verification-documents').createSignedUrl(path, 60);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
