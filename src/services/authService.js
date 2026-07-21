import { supabase } from '../lib/supabaseClient';
import { apiClient } from './apiClient';
import { uploadAccreditationFile, uploadGovIdFile } from './uploadService';

// Every function here now talks to the real backend (Express on Render, backed by
// Supabase Postgres) instead of localStorage — see backend/src/routes/profiles.routes.js
// for the matching API surface. Session state itself (login/logout/current-user) is no
// longer this file's concern — AuthContext.jsx manages it directly via `supabase.auth`.

// Account creation goes through the backend's admin-privileged /auth/register endpoint
// instead of calling supabase.auth.signUp() directly from here — see
// backend/src/controllers/auth.controller.js for the full reasoning. The account is
// created instant-confirmed (no OTP email step) — that flow (registerUser returning
// { pendingVerification }, AuthPage.jsx's OTP screen, verifyRegistrationOtp/
// resendRegistrationOtp below) is dormant, not deleted, in case OTP verification is
// turned back on again later; it was disabled because Supabase's default ~2-emails/hour
// sending cap kept locking users out mid-registration. Configuring custom SMTP in the
// Supabase dashboard would remove that cap if OTP is ever re-enabled.
export async function registerUser(values) {
  const email = values.email.trim().toLowerCase();
  // confirmPassword rides along harmlessly in profileFields — the backend only ever picks
  // out the specific fields it recognizes, so an extra key here is simply ignored.
  const { govIdFile, accreditationFile, password, ...profileFields } = values;

  await apiClient.post('/auth/register', { ...profileFields, email, password });

  // The admin API above creates the account server-side but doesn't establish a browser
  // session — sign in here so the file upload below (Storage requires an authenticated
  // session) and everything after registration has one, same as a normal login.
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(signInError.message);

  const { data: { user } } = await supabase.auth.getUser();
  const filePatch = {};
  if (values.role === 'farmer' && govIdFile instanceof File) {
    filePatch.govIdFile = await uploadGovIdFile(govIdFile, user.id);
  }
  if (values.role === 'stakeholder' && accreditationFile instanceof File) {
    filePatch.accreditationFile = await uploadAccreditationFile(accreditationFile, user.id);
  }

  return Object.keys(filePatch).length ? apiClient.patch('/profiles/me', filePatch) : apiClient.get('/profiles/me');
}

// Dormant — see registerUser's comment above. Verifies the 6-digit code, which — on
// success — both confirms the email AND establishes a real session (Supabase does both as
// one step for an 'email' OTP), then performs the gov-ID/accreditation upload that
// registerUser would otherwise defer for lack of a session.
export async function verifyRegistrationOtp(email, token, pendingFiles = {}) {
  const { error: verifyError } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (verifyError) throw new Error('That code is invalid or has expired. Please try again or resend a new one.');

  const { data: { user } } = await supabase.auth.getUser();
  const { govIdFile, accreditationFile, role } = pendingFiles;
  const filePatch = {};
  if (role === 'farmer' && govIdFile instanceof File) {
    filePatch.govIdFile = await uploadGovIdFile(govIdFile, user.id);
  }
  if (role === 'stakeholder' && accreditationFile instanceof File) {
    filePatch.accreditationFile = await uploadAccreditationFile(accreditationFile, user.id);
  }

  return Object.keys(filePatch).length ? apiClient.patch('/profiles/me', filePatch) : apiClient.get('/profiles/me');
}

// Also used to re-send when a returning, still-unverified user hits "Email not confirmed"
// on the login page (see AuthPage.jsx) — the same call either way, just a different caller.
export async function resendRegistrationOtp(email) {
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: false } });
  if (error) throw new Error(error.message);
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
  if (error) {
    // Deliberately the ONE Supabase failure reason not flattened into the generic message
    // below — AuthPage.jsx checks this exact code to offer "verify your email" instead of
    // just telling an otherwise-correct password to try again. Every other failure (wrong
    // password, no such account, ...) stays intentionally vague, so a login attempt can't
    // be used to probe which emails are registered.
    if (error.message.toLowerCase().includes('email not confirmed')) {
      const unconfirmedError = new Error('Email not confirmed');
      unconfirmedError.code = 'email_not_confirmed';
      throw unconfirmedError;
    }
    throw new Error('Login failed. Check your email and password.');
  }
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
