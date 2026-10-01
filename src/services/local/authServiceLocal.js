



import { STORAGE_KEYS } from '../../utils/constants';
import { createId, readSession, readStorage, removeSession, writeSession, writeStorage } from '../storageService';
import { createNotification } from './notificationServiceLocal';








export function getUsers() {
  const users = readStorage(STORAGE_KEYS.users, []);
  return users.map((user) => {



    if (user.role === 'stakeholder') {
      const rest = { ...user };
      delete rest.verificationStatus;
      delete rest.verificationAcknowledged;
      delete rest.verifiedAt;
      return rest.accountStatus ? rest : { ...rest, accountStatus: 'active' };
    }

    const needsDefaultVerification = user.role === 'farmer' && !user.verificationStatus;
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





export function getCurrentUser() {
  return readSession(STORAGE_KEYS.currentUser, null);
}

export function setCurrentUser(user) {
  const sessionUser = { ...user };
  delete sessionUser.password;
  return writeSession(STORAGE_KEYS.currentUser, sessionUser);
}






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




export function getVerifiedFarmers() {
  return getUsers().filter((user) => user.role === 'farmer' && user.verificationStatus === 'verified' && user.accountStatus !== 'suspended');
}




export function getStakeholders() {
  return getUsers().filter((user) => user.role === 'stakeholder' && user.accountStatus !== 'suspended');
}



export function getBuyers() {
  return getUsers().filter((user) => user.role === 'buyer' && user.accountStatus !== 'suspended');
}




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




export function acknowledgeVerification(id) {
  const users = getUsers();
  const updated = users.map((user) => (user.id === id ? { ...user, verificationAcknowledged: true } : user));
  writeStorage(STORAGE_KEYS.users, updated);
  return setCurrentUser(updated.find((user) => user.id === id));
}





export function setAccountStatus(id, status) {
  const users = getUsers();
  const updated = users.map((user) => (user.id === id ? { ...user, accountStatus: status } : user));
  writeStorage(STORAGE_KEYS.users, updated);
  return updated.find((user) => user.id === id) || null;
}

