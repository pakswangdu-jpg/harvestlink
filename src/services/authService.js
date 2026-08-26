import { supabase } from '../lib/supabaseClient';
import { apiClient } from './apiClient';
import { uploadAccreditationFile, uploadGovIdFile, uploadSupportingDocument } from './uploadService';

// Every function here now talks to the real backend (Express on Render, backed by
// Supabase Postgres) instead of localStorage — see backend/src/routes/profiles.routes.js
// for the matching API surface. Session state itself (login/logout/current-user) is no
// longer this file's concern — AuthContext.jsx manages it directly via `supabase.auth`.

// Account creation is deferred until the user verifies their registered email code.
// The backend stores a pending registration, sends a 6-digit code, and only creates
// the Supabase auth user and profile row once that code is confirmed.
export async function registerUser(values) {
  const email = values.email.trim().toLowerCase();
  // confirmPassword rides along harmlessly in profileFields — the backend only ever picks
  // out the specific fields it recognizes, so an extra key here is simply ignored.
  const { password, ...profileFields } = values;

  await apiClient.post('/auth/register', { ...profileFields, email, password });
  return { pendingVerification: true };
}

// Public (no session needed — same as registerUser itself). Lets the registration form warn
// the farmer/buyer/stakeholder their number is already taken as soon as they finish typing it,
// rather than only finding out after submitting the whole form — see AuthPage.jsx's
// PhoneNumberInput. Purely advisory: the backend's own register() call is what actually
// enforces this and can't be bypassed by skipping this check.
export async function checkContactNumberAvailability(value) {
  return apiClient.get(`/auth/check-contact-number?value=${encodeURIComponent(value)}`);
}

export async function verifyRegistrationOtp(email, token, password, pendingFiles = {}) {
  if (!password) {
    throw new Error('Unable to complete verification because the password is missing. Please try again.');
  }

  await apiClient.post('/auth/verify-registration-code', {
    email: email.trim().toLowerCase(),
    code: token,
  });

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (signInError) {
    throw new Error('Unable to sign in after verification. Please try again.');
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { govIdFile, accreditationFile, supportingDocumentFile, role } = pendingFiles;
  const filePatch = {};
  if (role === 'farmer' && govIdFile instanceof File) {
    filePatch.govIdFile = await uploadGovIdFile(govIdFile, user.id);
  }
  if (role === 'stakeholder' && accreditationFile instanceof File) {
    filePatch.accreditationFile = await uploadAccreditationFile(accreditationFile, user.id);
  }
  if (role === 'stakeholder' && supportingDocumentFile instanceof File) {
    filePatch.supportingDocumentFile = await uploadSupportingDocument(supportingDocumentFile, user.id);
  }

  return Object.keys(filePatch).length ? apiClient.patch('/profiles/me', filePatch) : apiClient.get('/profiles/me');
}

// Also used to re-send when a returning, still-unverified user hits "Email not confirmed"
// on the login page (see AuthPage.jsx) — this re-sends the built-in Supabase signup
// verification email for an unconfirmed account.
export async function resendRegistrationOtp(email) {
  const response = await apiClient.post('/auth/resend-registration-code', { email: email.trim().toLowerCase() });
  if (response.error) throw new Error(response.error);
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

// GET /profiles/farmers is also public — every verified farmer, no rating floor or cap.
// Backs the landing page's "View All Farmers" directory (AllFarmersPage.jsx).
export async function getAllVerifiedFarmers() {
  return apiClient.get('/profiles/farmers');
}

// Session state (login/logout/current-user) is managed directly via supabase.auth — this
// browser signs in with Supabase directly rather than going through the backend.
export async function loginUser(emailValue, password) {
  const email = emailValue.trim().toLowerCase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.message.toLowerCase().includes('email not confirmed')) {
      const unconfirmedError = new Error('Email not confirmed');
      unconfirmedError.code = 'email_not_confirmed';
      throw unconfirmedError;
    }
    throw new Error('Invalid email or password.');
  }

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
