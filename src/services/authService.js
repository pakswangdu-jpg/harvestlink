import { supabase } from '../lib/supabaseClient';
import { apiClient } from './apiClient';
import { uploadAccreditationFile, uploadGovIdFile } from './uploadService';

// Every function here now talks to the real backend (Express on Render, backed by
// Supabase Postgres) instead of localStorage — see backend/src/routes/profiles.routes.js
// for the matching API surface. Session state itself (login/logout/current-user) is no
// longer this file's concern — AuthContext.jsx manages it directly via `supabase.auth`.

// Account creation goes through the backend's admin-privileged /auth/register endpoint
// instead of calling supabase.auth.signUp() directly from here — see
// backend/src/controllers/auth.controller.js for why: the public signUp() path sends a
// confirmation email on every call whenever "Confirm email" is on for the project, and
// Supabase's default email sending is capped at just a couple of emails per hour, so a
// handful of test registrations reliably exhausts it. The admin API creates the account
// already-confirmed without sending anything, so registration is never rate-limited.
export async function registerUser(values) {
  const email = values.email.trim().toLowerCase();
  // confirmPassword rides along harmlessly in profileFields — the backend only ever picks
  // out the specific fields it recognizes, so an extra key here is simply ignored.
  const { govIdFile, accreditationFile, password, ...profileFields } = values;

  await apiClient.post('/auth/register', { ...profileFields, email, password });

  // The account now exists — sign in normally to establish a real session (plain
  // password sign-in never sends an email, so it's never subject to that limit either).
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(signInError.message);

  // Uploads need an authenticated session (Storage's bucket policy checks auth.uid()) —
  // only reachable now that sign-in above established one. AuthPage.jsx keeps the raw
  // File object in form state until this point.
  const { data: { user } } = await supabase.auth.getUser();
  const filePatch = {};
  if (values.role === 'farmer' && govIdFile instanceof File) {
    filePatch.govIdFile = await uploadGovIdFile(govIdFile, user.id);
  }
  if (values.role === 'stakeholder' && accreditationFile instanceof File) {
    filePatch.accreditationFile = await uploadAccreditationFile(accreditationFile, user.id);
  }

  return Object.keys(filePatch).length
    ? apiClient.patch('/profiles/me', { ...profileFields, ...filePatch })
    : apiClient.get('/profiles/me');
}

// GET /profiles/top-farmers is public (no requireAuth on the backend) — safe to call from
// the signed-out landing page. apiClient still runs its normal getSession() check first,
// it just won't find one and simply skips the Authorization header, which the route
// doesn't need anyway.
export async function getTopRatedFarmers() {
  return apiClient.get('/profiles/top-farmers');
}

// GET /profiles/:id/public is also public — backs the "view farmer" page reached by
// clicking a card in the landing page's showcase.
export async function getPublicFarmerProfile(id) {
  return apiClient.get(`/profiles/${id}/public`);
}

export async function loginUser(emailValue, password) {
  const email = emailValue.trim().toLowerCase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Login failed. Check your email and password.');
  // requireAuth on the backend rejects a suspended account's session with a clear
  // message, which surfaces here exactly like any other apiClient error.
  return apiClient.get('/profiles/me');
}

export async function changePassword(id, currentPassword, newPassword) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
  if (verifyError) throw new Error('Current password is incorrect.');

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

export async function acknowledgeVerification() {
  return apiClient.post('/profiles/me/acknowledge-verification');
}

export async function updateUserProfile(id, values) {
  return apiClient.patch('/profiles/me', values);
}

export async function getUsers() {
  return apiClient.get('/profiles');
}

export async function getUserById(id) {
  return apiClient.get(`/profiles/${id}`);
}

// Only DTI-approved farmers are traceable on the map — the backend already scopes
// non-admin callers to verified, non-suspended farmers (see listProfiles in
// backend/src/controllers/profiles.controller.js).
export async function getVerifiedFarmers() {
  return apiClient.get('/profiles?role=farmer');
}

// Stakeholders have no admin verification review (unlike farmers) — every registered
// partner organization is eligible to be alerted about new surplus donations right away.
export async function getStakeholders() {
  return apiClient.get('/profiles?role=stakeholder');
}

// Buyers have no DTI verification workflow (only farmers do), so every registered buyer
// account is traceable — there's no pending/rejected state to filter on.
export async function getBuyers() {
  return apiClient.get('/profiles?role=buyer');
}

export async function setUserVerification(id, status) {
  return apiClient.patch(`/profiles/${id}/verification`, { status });
}

// Separate from verificationStatus (pending/verified/rejected, which is about approving a
// new account) — this is about suspending/reinstating an existing account at any time,
// e.g. for a policy violation.
export async function setAccountStatus(id, status) {
  return apiClient.patch(`/profiles/${id}/account-status`, { status });
}

// Admin-only: short-lived signed URLs for another user's private gov ID / accreditation
// upload — { govIdFile, accreditationFile }, only whichever key that user actually has.
// See backend/src/controllers/profiles.controller.js's getVerificationDocuments.
export async function getVerificationDocuments(id) {
  return apiClient.get(`/profiles/${id}/verification-documents`);
}
