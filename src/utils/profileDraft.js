import { CEBU_MUNICIPALITIES, ORGANIZATION_TYPES } from './constants';

export function buildProfileDraft(user) {
  // A saved organizationType that isn't one of the fixed options is a custom value someone
  // typed in via "Other" (see StakeholderRegisterFields/Profile.jsx's OrganizationTypeField) —
  // show the select as "Other" with that value carried over into the free-text field, rather
  // than silently failing to match any <option> and defaulting to the first type.
  const isKnownType = ORGANIZATION_TYPES.includes(user.organizationType);
  return {
    name: user.name || '',
    contactNumber: user.contactNumber || '',
    municipality: user.municipality || CEBU_MUNICIPALITIES[0],
    address: user.address || '',
    zipCode: user.zipCode || '',
    birthday: user.birthday || '',
    farmName: user.farmName || '',
    organizationName: user.organizationName || '',
    organizationType: isKnownType ? user.organizationType : (user.organizationType ? 'Other' : ORGANIZATION_TYPES[0]),
    organizationTypeOther: !isKnownType && user.organizationType ? user.organizationType : '',
    contactPerson: user.contactPerson || '',
  };
}
