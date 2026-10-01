import { CEBU_MUNICIPALITIES, ORGANIZATION_TYPES } from './constants';

export function buildProfileDraft(user) {
  const isKnownType = ORGANIZATION_TYPES.includes(user.organizationType);

  return {
    name: user.name || '',
    contactNumber: user.contactNumber || '',
    municipality: user.municipality || CEBU_MUNICIPALITIES[0],
    address: user.address || '',
    latitude: user.latitude ?? null,
    longitude: user.longitude ?? null,
    zipCode: user.zipCode || '',
    birthday: user.birthday || '',
    farmName: user.farmName || '',
    organizationName: user.organizationName || '',
    organizationType: isKnownType ? user.organizationType : (user.organizationType ? 'Other' : ORGANIZATION_TYPES[0]),
    organizationTypeOther: !isKnownType && user.organizationType ? user.organizationType : '',
    contactPerson: user.contactPerson || '',
  };
}
