import { CEBU_MUNICIPALITIES, ORGANIZATION_TYPES } from './constants';

export function buildProfileDraft(user) {
  return {
    name: user.name || '',
    contactNumber: user.contactNumber || '',
    municipality: user.municipality || CEBU_MUNICIPALITIES[0],
    address: user.address || '',
    zipCode: user.zipCode || '',
    birthday: user.birthday || '',
    farmName: user.farmName || '',
    organizationName: user.organizationName || '',
    organizationType: user.organizationType || ORGANIZATION_TYPES[0],
    contactPerson: user.contactPerson || '',
  };
}
