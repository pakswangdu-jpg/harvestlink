import { getFixedKgPerUnit, hasFixedConversion } from './unitConversion';
import { isValidPhilippineMobile } from './philippineMobile';
import { getWholesalePricingErrors } from '../../backend/shared/pricing.js';

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

export function required(value) {
  return String(value ?? '').trim().length > 0;
}

export function toPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function isValidZipCode(value) {
  return /^\d{4}$/.test(String(value || '').trim());
}







export const MAX_PLAUSIBLE_PRICE_PER_KG = 5000;






function resolvableKgPerUnit(unit, kgPerUnitInput) {
  const fixed = getFixedKgPerUnit(unit);
  if (fixed != null) return fixed;
  const parsed = Number(kgPerUnitInput);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}



function implausiblePerKgMessage(label, amount, kgPerUnit) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !kgPerUnit) return null;
  const perKg = numericAmount / kgPerUnit;
  if (perKg <= MAX_PLAUSIBLE_PRICE_PER_KG) return null;
  return `${label} works out to ₱${perKg.toFixed(2)}/kg, which is unrealistically high for produce — please double-check this value.`;
}





function validateContactNumber(values, errors) {
  if (!required(values.contactNumber)) errors.contactNumber = 'Enter a contact number.';
  else if (!isValidPhilippineMobile(values.contactNumber)) errors.contactNumber = 'Please enter a valid Philippine mobile number.';
}

export function validateAuthForm(values, mode) {
  const errors = {};
  if (mode === 'register' && !required(values.firstName)) errors.firstName = 'Enter your first name.';
  if (mode === 'register' && !required(values.lastName)) errors.lastName = 'Enter your last name.';
  if (!required(values.email)) errors.email = 'Enter your email address.';
  else if (!isValidEmail(values.email)) errors.email = 'Enter a valid email address.';
  if (!required(values.password)) errors.password = 'Enter your password.';
  if (mode === 'register') {
    if (!required(values.confirmPassword)) errors.confirmPassword = 'Confirm your password.';
    else if (values.password !== values.confirmPassword) errors.confirmPassword = 'Passwords do not match.';
  }
  if (mode === 'register' && !['farmer', 'buyer', 'stakeholder'].includes(values.role)) {
    errors.role = 'Choose an account type.';
  }



  if (mode === 'register' && ['farmer', 'buyer'].includes(values.role)) {
    if (!required(values.address)) errors.address = 'Enter your complete address.';
    if (!isValidZipCode(values.zipCode)) errors.zipCode = 'Enter a valid 4-digit zip code.';
  }
  if (mode === 'register' && values.role === 'stakeholder') {
    if (!required(values.organizationName)) errors.organizationName = 'Enter your organization name.';
    if (!required(values.organizationType)) errors.organizationType = 'Choose an organization type.';
    else if (values.organizationType === 'Other' && !required(values.organizationTypeOther)) {
      errors.organizationType = 'Enter your organization type.';
    }
    if (!required(values.organizationDescription)) errors.organizationDescription = 'Briefly describe your organization.';



    if (!required(values.contactPerson)) errors.contactPerson = 'Enter your position or role in the organization.';
    validateContactNumber(values, errors);
    if (!required(values.municipality)) errors.municipality = 'Choose a municipality.';
    if (!required(values.barangay)) errors.barangay = 'Enter your barangay.';
    if (!required(values.partnershipDescription)) {
      errors.partnershipDescription = 'Tell us why your organization wants to partner with HarvestLink.';
    }



    if (!(values.accreditationFile instanceof File)) {
      errors.accreditationFile = 'Upload a verification document to continue.';
    }
  }
  if (mode === 'register' && values.role === 'farmer') {
    if (!required(values.birthday)) errors.birthday = 'Enter your birthday.';
    if (!required(values.farmName)) errors.farmName = 'Enter your farm name.';
    validateContactNumber(values, errors);
    if (!required(values.municipality)) errors.municipality = 'Choose your farm location.';
  }
  if (mode === 'register' && values.role === 'buyer') {
    validateContactNumber(values, errors);
    if (!required(values.municipality)) errors.municipality = 'Choose your location.';
  }
  return errors;
}





export function validateProductForm(values, availableUnits, existing = null) {
  const errors = {};
  if (!required(values.name)) errors.name = 'Choose or specify a product.';
  if (!required(values.category)) errors.category = 'Choose a category.';
  if (!['A', 'B'].includes(values.grade)) errors.grade = 'Choose a grade.';
  if (!values.isDonation) {
    if (!['retail', 'wholesale'].includes(values.sellingType)) errors.sellingType = 'Choose a sales type.';
    if (toPositiveNumber(values.price) === null) errors.price = 'Enter a positive price.';





    if (toPositiveNumber(values.costPrice) === null) {
      errors.costPrice = 'Enter your cost per unit so your profit can be calculated for this sale.';
    }
    if (values.sellingType === 'wholesale') {
      const moq = toPositiveNumber(values.moq);
      if (moq === null) errors.moq = 'Enter a positive minimum order quantity.';
      else if (moq > Number(values.quantity)) errors.moq = 'MOQ cannot exceed the quantity available.';
    }
    if (values.wholesaleEnabled && values.sellingType === 'retail') {
      const retailPrice = Number((Number(values.price) * (1 - (Number(values.discountPercent) || 0) / 100)).toFixed(2));
      Object.assign(errors, getWholesalePricingErrors({ ...values, price: retailPrice }, existing));
    }
  }
  if (!required(values.unit)) errors.unit = 'Choose a unit.';
  else if (Array.isArray(availableUnits) && !availableUnits.includes(values.unit)) errors.unit = 'Choose a unit valid for this product.';
  else if (!values.isDonation && !hasFixedConversion(values.unit) && toPositiveNumber(values.kgPerUnit) === null) {
    errors.kgPerUnit = `Enter how many kg 1 ${values.unit} is.`;
  }
  if (!values.isDonation && !errors.unit && !errors.kgPerUnit) {
    const kgPerUnit = resolvableKgPerUnit(values.unit, values.kgPerUnit);
    if (!errors.costPrice) {
      const costMessage = implausiblePerKgMessage('Your cost', values.costPrice, kgPerUnit);
      if (costMessage) errors.costPrice = costMessage;
    }
    if (!errors.price) {
      const priceMessage = implausiblePerKgMessage('This price', values.price, kgPerUnit);
      if (priceMessage) errors.price = priceMessage;
    }
    if (values.wholesaleEnabled && values.sellingType === 'retail' && !errors.wholesalePrice) {
      const message = implausiblePerKgMessage('Wholesale price', values.wholesalePrice, kgPerUnit);
      if (message) errors.wholesalePrice = message;
    }
  }
  if (!values.isDonation && required(values.discountPercent)) {
    const discountPercent = Number(values.discountPercent);
    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
      errors.discountPercent = 'Enter a value between 0 and 100.';
    }
  }
  if (toPositiveNumber(values.quantity) === null) errors.quantity = 'Enter a positive quantity.';
  if (required(values.expirationDate)) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(values.expirationDate) < today) errors.expirationDate = 'Expiration date cannot be in the past.';
  }
  if (!required(values.location)) errors.location = 'Enter the product location.';
  if (!required(values.description)) errors.description = 'Add a short product description.';
  if (!required(values.image)) errors.image = 'Add a product photo before listing.';
  return errors;
}

export function validateCheckoutForm(values, product, currentUser) {
  const errors = {};
  const quantity = toPositiveNumber(values.quantity);

  if (quantity === null) errors.quantity = 'Enter a positive request quantity.';
  else if (product && quantity > Number(product.quantity)) {
    errors.quantity = `Only ${product.quantity} ${product.unit} available.`;
  } else if (product?.sellingType === 'wholesale' && product.moq && quantity < Number(product.moq)) {
    errors.quantity = `This is a wholesale listing — minimum order is ${product.moq} ${product.unit}.`;
  }

  if (!required(values.paymentMethod)) errors.paymentMethod = 'Choose a payment method.';
  if (!required(values.deliveryMethod)) errors.deliveryMethod = 'Choose a delivery method.';
  if (values.deliveryMethod !== 'buyer_pickup' && !required(values.deliveryMunicipality)) {
    errors.deliveryMunicipality = 'Choose where this order should be delivered.';
  }
  if (product && currentUser && product.farmerId === currentUser.id) {
    errors.form = 'You cannot request your own product.';
  }

  return errors;
}

export function validateProfileForm(values, role) {
  const errors = {};
  if (!required(values.name)) errors.name = 'Enter your full name.';
  if (!required(values.municipality)) errors.municipality = 'Choose your location.';
  if (!required(values.address)) errors.address = 'Enter your complete address.';
  if (!isValidZipCode(values.zipCode)) errors.zipCode = 'Enter a valid 4-digit zip code.';
  if (role === 'farmer' || role === 'buyer' || role === 'stakeholder') {
    if (!required(values.contactNumber)) errors.contactNumber = 'Enter a contact number.';
  }
  if (role === 'farmer') {
    if (!required(values.birthday)) errors.birthday = 'Enter your birthday.';
    if (!required(values.farmName)) errors.farmName = 'Enter your farm name.';
  }
  if (role === 'stakeholder') {
    if (!required(values.organizationName)) errors.organizationName = 'Enter your organization name.';
    if (!required(values.organizationType)) errors.organizationType = 'Choose an organization type.';
    else if (values.organizationType === 'Other' && !required(values.organizationTypeOther)) {
      errors.organizationType = 'Enter your organization type.';
    }
    if (!required(values.contactPerson)) errors.contactPerson = 'Enter a contact person.';
  }
  return errors;
}




export function normalizeGcashReference(value) {
  return String(value ?? '').replace(/\D/g, '');
}






export const GCASH_REFERENCE_MIN_DIGITS = 12;
export const GCASH_REFERENCE_MAX_DIGITS = 13;

export function isValidGcashReference(value) {
  const digits = normalizeGcashReference(value);
  return digits.length >= GCASH_REFERENCE_MIN_DIGITS && digits.length <= GCASH_REFERENCE_MAX_DIGITS;
}





const NAME_ALLOWED_PATTERN = /^[\p{L} .'-]+$/u;

export function isValidPersonName(value) {
  const trimmed = String(value ?? '').trim();

  return NAME_ALLOWED_PATTERN.test(trimmed) && (trimmed.match(/\p{L}/gu) || []).length >= 2;
}



export function filterGcashReferenceInput(value) {
  return String(value ?? '').replace(/[^\d ]/g, '');
}

export function filterPersonNameInput(value) {
  return String(value ?? '').replace(/[^\p{L} .'-]/gu, '');
}

export function validateGcashForm(values) {
  const errors = {};
  if (!required(values.gcashAccountName)) errors.gcashAccountName = 'Enter the name on your GCash account.';
  if (!required(values.gcashNumber)) errors.gcashNumber = 'Enter your GCash mobile number.';
  return errors;
}

export function validatePasswordForm(values) {
  const errors = {};
  if (!required(values.currentPassword)) errors.currentPassword = 'Enter your current password.';
  if (!required(values.newPassword)) errors.newPassword = 'Enter a new password.';
  if (!required(values.confirmPassword)) errors.confirmPassword = 'Confirm your new password.';
  else if (values.newPassword !== values.confirmPassword) errors.confirmPassword = 'Passwords do not match.';
  return errors;
}

export function hasErrors(errors) {



  return Object.values(errors).some(Boolean);
}
