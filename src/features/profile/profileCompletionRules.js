import { CEBU_MUNICIPALITIES } from '../../utils/constants';
import { getRegisteredCoordinates } from '../../utils/geo';
import { isValidPhilippineMobile } from '../../utils/philippineMobile';
import { isValidEmail, isValidZipCode, required } from '../../utils/validators';

export function getProfileCompletion(user) {
  if (!['buyer', 'farmer', 'stakeholder'].includes(user.role)) return null;
  const hasCoordinates = Boolean(getRegisteredCoordinates(user));
  const fields = {
    name: required(user.name),
    email: isValidEmail(user.email),
    contactNumber: isValidPhilippineMobile(user.contactNumber),
    municipality: CEBU_MUNICIPALITIES.includes(user.municipality) && hasCoordinates,
    address: required(user.address) && hasCoordinates,
    zipCode: isValidZipCode(user.zipCode),
  };
  if (user.role === 'farmer') {
    fields.farmName = required(user.farmName);
    fields.birthday = required(user.birthday) && Number.isFinite(Date.parse(user.birthday));
  }
  if (user.role === 'stakeholder') {
    fields.organizationName = required(user.organizationName);
    fields.organizationType = required(user.organizationType)
      && (user.organizationType !== 'Other' || required(user.organizationTypeOther));
    fields.contactPerson = required(user.contactPerson);
    fields.organizationDescription = required(user.organizationDescription);
    fields.barangay = required(user.barangay);
    fields.partnershipDescription = required(user.partnershipDescription);
    fields.accreditationFile = typeof user.accreditationFile === 'string' && required(user.accreditationFile);
  }
  const total = Object.keys(fields).length;
  const completed = Object.values(fields).filter(Boolean).length;
  return { fields, total, completed, remaining: total - completed, percent: Math.round((completed / total) * 100) };
}
