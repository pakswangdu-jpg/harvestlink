import { ADMIN_CREDENTIALS, ADMIN_USER, STORAGE_KEYS } from '../utils/constants';
import { createId, readSession, readStorage, removeSession, writeSession, writeStorage } from './storageService';
import { createNotification } from './notificationService';

// Accounts registered before verification review existed have no verificationStatus
// at all, and accounts registered before account suspension existed have no
// accountStatus at all. Rather than a one-time migration, default both here on every
// read so older records behave the same as new ones — the real value gets persisted
// the first time an admin actually acts on the account. verificationAcknowledged
// defaults to true for any pre-existing record too, so this "you were just approved"
// banner never surprises an account that was already verified before it existed.
export function getUsers() {
  const users = readStorage(STORAGE_KEYS.users, []);
  return users.map((user) => {
    const needsDefaultVerification = ['farmer', 'stakeholder'].includes(user.role) && !user.verificationStatus;
    const needsDefaultAccountStatus = !user.accountStatus;
    const needsDefaultAcknowledged = user.verificationAcknowledged === undefined;
    if (!needsDefaultVerification && !needsDefaultAccountStatus && !needsDefaultAcknowledged) return user;
    return {
      ...user,
      ...(needsDefaultVerification ? { verificationStatus: 'pending' } : null),
      ...(needsDefaultAccountStatus ? { accountStatus: 'active' } : null),
      ...(needsDefaultAcknowledged ? { verificationAcknowledged: true } : null),
    };
  });
}

// The logged-in session lives in sessionStorage (per-tab) rather than localStorage
// (shared across tabs) so a farmer tab and a buyer tab can stay logged in as different
// users side by side in the same browser — localStorage is still used for the shared
// data (products/orders/donations/messages) all sessions read and write.
export function getCurrentUser() {
  return readSession(STORAGE_KEYS.currentUser, null);
}

export function setCurrentUser(user) {
  const sessionUser = { ...user };
  delete sessionUser.password;
  return writeSession(STORAGE_KEYS.currentUser, sessionUser);
}

// The session snapshot is written once at login and never touched again, so it goes
// stale the moment another tab changes the shared user record (e.g. an admin approving
// verification) — re-sync it from the live localStorage record by id. If an admin
// suspends this account from another tab, this is also what signs them out live —
// AuthContext polls refreshCurrentUser() every few seconds for any logged-in session.
export function refreshCurrentUser() {
  const sessionUser = getCurrentUser();
  if (!sessionUser || sessionUser.role === 'admin') return sessionUser;

  const freshUser = getUsers().find((user) => user.id === sessionUser.id);
  if (!freshUser) return sessionUser;
  if (freshUser.accountStatus === 'suspended') {
    clearCurrentUser();
    return null;
  }
  return setCurrentUser(freshUser);
}

export function clearCurrentUser() {
  removeSession(STORAGE_KEYS.currentUser);
}

export function registerUser(values) {
  const email = values.email.trim().toLowerCase();
  const users = getUsers();

  if (users.some((user) => user.email === email)) {
    throw new Error('An account with this email already exists.');
  }

  // Captured as separate fields at registration, but every other screen in the app
  // (greetings, order/notification records, map popups) displays a single name — so
  // that combined form is still stored as `name`, alongside the parts for later editing.
  const firstName = values.firstName.trim();
  const middleName = values.middleName?.trim() || '';
  const lastName = values.lastName.trim();

  const user = {
    id: createId('user'),
    firstName,
    middleName,
    lastName,
    name: [firstName, middleName, lastName].filter(Boolean).join(' '),
    email,
    password: values.password,
    role: values.role,
    address: values.address?.trim() || '',
    zipCode: values.zipCode?.trim() || '',
    createdAt: new Date().toISOString(),
  };

  if (values.role === 'stakeholder') {
    user.organizationName = values.organizationName.trim();
    user.organizationType = values.organizationType;
    user.contactPerson = values.contactPerson.trim();
    user.contactNumber = values.contactNumber.trim();
    user.municipality = values.municipality;
    user.accreditationFile = values.accreditationFile || '';
    user.verificationStatus = 'pending';
    user.verificationAcknowledged = true;
  }

  if (values.role === 'farmer') {
    user.birthday = values.birthday;
    user.farmName = values.farmName.trim();
    user.contactNumber = values.contactNumber.trim();
    user.govIdFile = values.govIdFile || '';
    user.municipality = values.municipality;
    user.verificationStatus = 'pending';
    user.verificationAcknowledged = true;
  }

  if (values.role === 'buyer') {
    user.contactNumber = values.contactNumber.trim();
    user.municipality = values.municipality;
  }

  writeStorage(STORAGE_KEYS.users, [user, ...users]);
  return setCurrentUser(user);
}

export function getUserById(id) {
  return getUsers().find((user) => user.id === id) || null;
}

// Only DTI-approved farmers are traceable on the map — pending/rejected accounts aren't
// confirmed real yet, and a suspended account (even a previously-verified one) shouldn't
// stay publicly discoverable either.
export function getVerifiedFarmers() {
  return getUsers().filter((user) => user.role === 'farmer' && user.verificationStatus === 'verified' && user.accountStatus !== 'suspended');
}

// Only DTI-approved partner organizations should be alerted to new surplus donations —
// mirrors getVerifiedFarmers' same pending/rejected/suspended exclusions.
export function getVerifiedStakeholders() {
  return getUsers().filter((user) => user.role === 'stakeholder' && user.verificationStatus === 'verified' && user.accountStatus !== 'suspended');
}

// Buyers have no DTI verification workflow (only farmers/stakeholders do), so every
// registered buyer account is traceable — there's no pending/rejected state to filter on.
export function getBuyers() {
  return getUsers().filter((user) => user.role === 'buyer' && user.accountStatus !== 'suspended');
}

// Editable self-service/admin-editable fields only — email is the login identifier
// (uniqueness is only checked at registration) and role/verificationStatus/accountStatus
// are controlled through their own dedicated actions, so none of those are touched here.
function buildProfilePatch(target, values) {
  const patch = {
    name: values.name.trim(),
    municipality: values.municipality,
    address: values.address?.trim() || '',
    zipCode: values.zipCode?.trim() || '',
  };
  if (target.role === 'farmer') {
    patch.birthday = values.birthday;
    patch.farmName = values.farmName.trim();
    patch.contactNumber = values.contactNumber?.trim() || '';
  }
  if (target.role === 'buyer') {
    patch.contactNumber = values.contactNumber?.trim() || '';
  }
  if (target.role === 'stakeholder') {
    patch.organizationName = values.organizationName.trim();
    patch.organizationType = values.organizationType;
    patch.contactPerson = values.contactPerson.trim();
    patch.contactNumber = values.contactNumber?.trim() || '';
  }
  return patch;
}

export function updateUserProfile(id, values) {
  const users = getUsers();
  const target = users.find((user) => user.id === id);
  if (!target) throw new Error('Account was not found.');

  const updated = users.map((user) => (user.id === id ? { ...user, ...buildProfilePatch(target, values) } : user));
  writeStorage(STORAGE_KEYS.users, updated);
  return setCurrentUser(updated.find((user) => user.id === id));
}

// Same editable fields as updateUserProfile, but for an admin editing SOMEONE ELSE's
// account — this must never call setCurrentUser, or the acting admin's own session would
// get overwritten with the edited user's record.
export function adminUpdateUserDetails(id, values) {
  const users = getUsers();
  const target = users.find((user) => user.id === id);
  if (!target) throw new Error('Account was not found.');

  const updated = users.map((user) => (user.id === id ? { ...user, ...buildProfilePatch(target, values) } : user));
  writeStorage(STORAGE_KEYS.users, updated);
  return updated.find((user) => user.id === id) || null;
}

export function changePassword(id, currentPassword, newPassword) {
  const users = getUsers();
  const target = users.find((user) => user.id === id);
  if (!target) throw new Error('Account was not found.');
  if (target.password !== currentPassword) throw new Error('Current password is incorrect.');

  const updated = users.map((user) => (user.id === id ? { ...user, password: newPassword } : user));
  writeStorage(STORAGE_KEYS.users, updated);
  return setCurrentUser(updated.find((user) => user.id === id));
}

export function setUserVerification(id, status) {
  const users = getUsers();
  const updated = users.map((user) =>
    user.id === id ? { ...user, verificationStatus: status, verifiedAt: new Date().toISOString(), verificationAcknowledged: false } : user
  );
  writeStorage(STORAGE_KEYS.users, updated);
  createNotification({
    userId: id,
    type: 'verification',
    title: status === 'verified' ? 'Account verified' : 'Verification declined',
    message: status === 'verified'
      ? 'Your account has been approved by admin. You can now add products to the marketplace.'
      : 'Your account verification was declined. Update your profile and contact support if you believe this was a mistake.',
    link: '/profile',
  });
  return updated.find((user) => user.id === id) || null;
}

// Called by the farmer/stakeholder themselves once they've seen the "your account was
// approved" banner, so it shows exactly once per verification decision instead of on
// every dashboard visit. Uses setCurrentUser (not adminUpdateUserDetails) since this is
// always the logged-in user acknowledging their own record.
export function acknowledgeVerification(id) {
  const users = getUsers();
  const updated = users.map((user) => (user.id === id ? { ...user, verificationAcknowledged: true } : user));
  writeStorage(STORAGE_KEYS.users, updated);
  return setCurrentUser(updated.find((user) => user.id === id));
}

// Separate from verificationStatus (pending/verified/rejected, which is about approving
// a new account) — this is about suspending/reinstating an existing account at any time,
// e.g. for a policy violation. A suspended account can't log in, and if already logged
// in elsewhere, refreshCurrentUser()'s polling signs them out within a few seconds.
export function setAccountStatus(id, status) {
  const users = getUsers();
  const updated = users.map((user) => (user.id === id ? { ...user, accountStatus: status } : user));
  writeStorage(STORAGE_KEYS.users, updated);
  return updated.find((user) => user.id === id) || null;
}

export function loginUser(emailValue, password) {
  const email = emailValue.trim().toLowerCase();

  if (email === ADMIN_CREDENTIALS.email && password === ADMIN_CREDENTIALS.password) {
    return setCurrentUser(ADMIN_USER);
  }

  const user = getUsers().find((candidate) => candidate.email === email && candidate.password === password);
  if (!user) throw new Error('Login failed. Check your email and password.');
  if (user.accountStatus === 'suspended') throw new Error('This account has been suspended. Contact support for assistance.');

  return setCurrentUser(user);
}
