import { profileLocationFields } from '../lib/profileLocation.js';
import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeProfile } from '../lib/serialize.js';
import { ApiError } from '../lib/ApiError.js';
import { buildCommonFields, buildRoleFields, VALID_ROLES } from './profiles.controller.js';
import { isValidPhilippineMobile, toE164PhilippineMobile } from '../lib/philippineMobile.js';
import { encryptText, decryptText } from '../lib/security.js';
import { sendVerificationCodeEmail } from '../lib/email.js';

const VERIFICATION_CODE_LENGTH = 6;
const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_RESENDS_PER_WINDOW = 3;
const RESEND_WINDOW_MS = 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;



function generateVerificationCode() {
  return String(randomInt(100000, 1000000));
}

function getFullName(values) {
  return [values.firstName, values.middleName, values.lastName].filter(Boolean).join(' ').trim();
}

async function hashVerificationCode(code) {
  return bcrypt.hash(code, 10);
}

async function isVerificationCodeValid(code, hash) {
  return bcrypt.compare(code, hash);
}

function buildPendingRegistrationData(values) {
  return {
    role: values.role,
    firstName: values.firstName || '',
    middleName: values.middleName || '',
    lastName: values.lastName || '',
    name: values.name || getFullName(values),
    contactNumber: values.contactNumber || '',
    ...profileLocationFields(values),
    address: values.address || '',
    zipCode: values.zipCode || '',
    municipality: values.municipality || null,
    farmName: values.farmName || '',
    birthday: values.birthday || null,
    organizationName: values.organizationName || '',
    organizationType: values.organizationType || null,
    contactPerson: values.contactPerson || '',
    organizationDescription: values.organizationDescription || '',
    barangay: values.barangay || '',
    partnershipDescription: values.partnershipDescription || '',
  };
}

function buildProfileRowFromPending(email, pending, userId) {
  return {
    id: userId,
    email,
    role: pending.data.role,
    ...buildCommonFields(pending.data),
    ...buildRoleFields(pending.data.role, pending.data, { isCreate: true }),
  };
}


function normalizeResendState(pending) {
  const now = Date.now();
  const createdAt = new Date(pending.created_at).getTime();
  const existingCount = pending.resend_count || 0;
  if (now - createdAt > RESEND_WINDOW_MS) return 0;
  return existingCount;
}

const isProduction = process.env.NODE_ENV === 'production';

export async function register(req, res) {
  const { email: rawEmail, password, role, contactNumber: rawContactNumber } = req.body;

  if (!VALID_ROLES.includes(role)) throw new ApiError('Choose a valid account type.', 400);
  if (!password || String(password).length < 6) throw new ApiError('Enter a password with at least 6 characters.', 400);
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email) throw new ApiError('Enter your email address.', 400);



  if (!isProduction) console.info(`[dev-email-trace] Registration email received: ${email}`);

  if (!isValidPhilippineMobile(rawContactNumber)) {
    throw new ApiError('Enter a valid Philippine mobile number.', 400);
  }
  req.body.contactNumber = toE164PhilippineMobile(rawContactNumber);

  const { data: existingProfile } = await supabaseAdmin.from('profiles').select('id').eq('email', email).maybeSingle();
  if (existingProfile) {
    throw new ApiError('An account with this email already exists.', 409);
  }

  const normalizedNumber = toE164PhilippineMobile(rawContactNumber);
  const { data: existingProfileByPhone } = await supabaseAdmin.from('profiles').select('id').eq('contact_number', normalizedNumber).maybeSingle();
  if (existingProfileByPhone) {
    throw new ApiError('An account with this mobile number already exists.', 409);
  }

  const { data: existingPendingByEmail } = await supabaseAdmin.from('pending_registrations').select('*').eq('email', email).maybeSingle();
  const { data: existingPendingByPhone } = await supabaseAdmin.from('pending_registrations').select('*').filter('data->>contactNumber', 'eq', normalizedNumber).maybeSingle();
  if (existingPendingByPhone && existingPendingByPhone.email !== email) {
    throw new ApiError('A pending registration already exists with this mobile number.', 409);
  }

  const now = new Date();
  const existingPending = existingPendingByEmail;
  const lastSentAt = existingPending ? new Date(existingPending.last_sent_at).getTime() : 0;
  if (existingPending && now.getTime() - lastSentAt < RESEND_COOLDOWN_MS) {
    throw new ApiError('Please wait a moment before requesting a new verification code.', 429);
  }

  const pendingResendCount = existingPending ? normalizeResendState(existingPending) : 0;
  const nextResendCount = pendingResendCount + 1;
  if (nextResendCount > MAX_RESENDS_PER_WINDOW) {
    throw new ApiError('You have reached the resend limit. Please try again later.', 429);
  }

  const code = generateVerificationCode();
  const codeHash = await hashVerificationCode(code);
  const passwordEncrypted = encryptText(password);
  const pendingData = buildPendingRegistrationData(req.body);
  const expiry = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);








  try {
    await sendVerificationCodeEmail(email, code);
  } catch (sendError) {
    if (!isProduction) console.error(`[dev-email-trace] register() aborted — send failed for ${email}: ${sendError.message}`);
    throw new ApiError('Unable to send verification email. Please try again.', 502);
  }

  const row = {
    email,
    password_encrypted: passwordEncrypted,
    data: pendingData,
    code_hash: codeHash,
    expires_at: expiry,
    resend_count: nextResendCount,
    last_sent_at: now,
    created_at: existingPending ? new Date(existingPending.created_at) : now,
    updated_at: now,
  };

  const dbResponse = existingPending
    ? await supabaseAdmin.from('pending_registrations').update(row).eq('email', email).single()
    : await supabaseAdmin.from('pending_registrations').insert(row).select().single();

  if (dbResponse.error) {
    throw new ApiError(dbResponse.error.message, 400);
  }

  res.status(201).json({ pendingVerification: true });
}

export async function verifyRegistrationCode(req, res) {
  const { email: rawEmail, code } = req.body;
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email) throw new ApiError('Enter your email address.', 400);
  if (!code || String(code).trim().length !== VERIFICATION_CODE_LENGTH) {
    throw new ApiError('Enter the 6-digit verification code.', 400);
  }

  const { data: pending } = await supabaseAdmin.from('pending_registrations').select('*').eq('email', email).maybeSingle();
  if (!pending) {
    throw new ApiError('No pending registration was found for this email.', 404);
  }

  const now = new Date();
  if (new Date(pending.expires_at) < now) {
    throw new ApiError('Your verification code has expired. Please request a new verification code.', 400);
  }


  const failedAttempts = pending.attempt_count || 0;
  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
    throw new ApiError('Too many verification attempts. Please request a new verification code.', 429);
  }

  const isValidCode = await isVerificationCodeValid(code, pending.code_hash);
  if (!isValidCode) {
    const newAttempts = failedAttempts + 1;
    await supabaseAdmin.from('pending_registrations').update({ attempt_count: newAttempts, updated_at: new Date() }).eq('email', email);
    if (newAttempts >= MAX_FAILED_ATTEMPTS) {
      throw new ApiError('Too many verification attempts. Please request a new verification code.', 429);
    }
    throw new ApiError('Incorrect verification code.\n\nPlease try again.', 400);
  }

  let password;
  try {
    password = decryptText(pending.password_encrypted);
  } catch {
    throw new ApiError('Unable to complete registration at this time. Please try again.', 500);
  }

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) {
    throw new ApiError(createError.message, 400);
  }

  const profileRow = buildProfileRowFromPending(email, pending, created.user.id);
  const { data: profile, error: profileError } = await supabaseAdmin.from('profiles').insert(profileRow).select().single();
  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    if (profileError.code === '23505') {
      throw new ApiError('An account with this email already exists.', 409);
    }
    throw new ApiError(profileError.message, 400);
  }

  await supabaseAdmin.from('pending_registrations').delete().eq('email', email);
  res.json(serializeProfile(profile));
}

export async function resendRegistrationCode(req, res) {
  const { email: rawEmail } = req.body;
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email) throw new ApiError('Enter your email address.', 400);


  if (!isProduction) console.info(`[dev-email-trace] Resend Code requested for: ${email}`);

  const { data: pending } = await supabaseAdmin.from('pending_registrations').select('*').eq('email', email).maybeSingle();
  if (!pending) {
    throw new ApiError('No pending registration was found for this email.', 404);
  }

  const now = new Date();
  const lastSentAt = new Date(pending.last_sent_at).getTime();
  if (now.getTime() - lastSentAt < RESEND_COOLDOWN_MS) {
    throw new ApiError('Please wait a moment before requesting a new verification code.', 429);
  }

  const pendingResendCount = normalizeResendState(pending);
  const nextResendCount = pendingResendCount + 1;
  if (nextResendCount > MAX_RESENDS_PER_WINDOW) {
    throw new ApiError('You have reached the resend limit. Please try again later.', 429);
  }

  const code = generateVerificationCode();
  const codeHash = await hashVerificationCode(code);
  const expiry = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);




  try {
    await sendVerificationCodeEmail(email, code);
  } catch (sendError) {
    if (!isProduction) console.error(`[dev-email-trace] resendRegistrationCode() aborted — send failed for ${email}: ${sendError.message}`);
    throw new ApiError('Unable to send verification email. Please try again.', 502);
  }

  const { error } = await supabaseAdmin.from('pending_registrations').update({
    code_hash: codeHash,
    expires_at: expiry,
    resend_count: nextResendCount,
    last_sent_at: now,
    updated_at: now,
    attempt_count: 0,
  }).eq('email', email);

  if (error) {
    throw new ApiError(error.message, 400);
  }

  res.status(200).json({ message: 'Verification code resent.' });
}

export async function checkContactNumber(req, res) {
  const value = String(req.query.value || '');
  if (!isValidPhilippineMobile(value)) {
    return res.json({ available: false, reason: 'invalid' });
  }
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('contact_number', toE164PhilippineMobile(value))
    .maybeSingle();
  res.json({ available: !data, reason: data ? 'duplicate' : null });
}
