import { supabase } from '../lib/supabaseClient';
import { apiClient } from './apiClient';
import { uploadAccreditationFile, uploadGovIdFile } from './uploadService';









export async function registerUser(values) {
  const email = values.email.trim().toLowerCase();


  const { password, ...profileFields } = values;

  await apiClient.post('/auth/register', { ...profileFields, email, password });
  return { pendingVerification: true };
}






export async function checkContactNumberAvailability(value) {
  return apiClient.get(`/auth/check-contact-number?value=${encodeURIComponent(value)}`);
}

export async function requestPasswordReset(email, redirectTo) {
  return apiClient.post('/auth/request-password-reset', { email: email.trim().toLowerCase(), redirectTo });
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




export async function resendRegistrationOtp(email) {
  const response = await apiClient.post('/auth/resend-registration-code', { email: email.trim().toLowerCase() });
  if (response.error) throw new Error(response.error);
}





export async function getTopRatedFarmers() {
  return apiClient.get('/profiles/top-farmers');
}



export async function getPublicFarmerProfile(id) {
  return apiClient.get(`/profiles/${id}/public`);
}



export async function getAllVerifiedFarmers() {
  return apiClient.get('/profiles/farmers');
}



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




export async function getVerifiedFarmers() {
  return apiClient.get('/profiles?role=farmer');
}



export async function getStakeholders() {
  return apiClient.get('/profiles?role=stakeholder');
}

export async function getNearbyMapProfiles() {
  return apiClient.get('/profiles/nearby-map');
}



export async function getBuyers() {
  return apiClient.get('/profiles?role=buyer');
}

export const getAdminUserPage = (filters) => apiClient.get(`/profiles?${new URLSearchParams(filters)}`);
export const getAdminUserDetails = (id, historyPage = 1) => apiClient.get(`/profiles/${id}/admin-details?historyPage=${historyPage}`);
export async function setUserVerification(id, status, reason, expectedStatus) {
  return apiClient.patch(`/profiles/${id}/verification`, { status, reason, expectedStatus });
}




export async function setAccountStatus(id, status, expectedStatus) {
  return apiClient.patch(`/profiles/${id}/account-status`, { status, expectedStatus });
}




export async function getVerificationDocuments(id) {
  return apiClient.get(`/profiles/${id}/verification-documents`);
}
