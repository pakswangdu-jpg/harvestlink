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
  if (mode === 'register' && ['farmer', 'buyer', 'stakeholder'].includes(values.role)) {
    if (!required(values.address)) errors.address = 'Enter your complete address.';
    if (!isValidZipCode(values.zipCode)) errors.zipCode = 'Enter a valid 4-digit zip code.';
  }
  if (mode === 'register' && values.role === 'stakeholder') {
    if (!required(values.organizationName)) errors.organizationName = 'Enter your organization name.';
    if (!required(values.organizationType)) errors.organizationType = 'Choose an organization type.';
    // contactPerson is labeled "Position / Role" on the registration form (see
    // StakeholderRegisterFields in AuthPage.jsx) — same field/column, just describing the
    // representative's title instead of duplicating their name (already firstName/lastName).
    if (!required(values.contactPerson)) errors.contactPerson = 'Enter your position or role in the organization.';
    if (!required(values.contactNumber)) errors.contactNumber = 'Enter a contact number.';
    if (!required(values.municipality)) errors.municipality = 'Choose a municipality.';
    // Type/size are validated inline as soon as a file is picked (see
    // VerificationDocumentUpload in AuthPage.jsx) — this only catches never having picked
    // one at all.
    if (!(values.accreditationFile instanceof File)) {
      errors.accreditationFile = 'Upload a verification document to continue.';
    }
  }
  if (mode === 'register' && values.role === 'farmer') {
    if (!required(values.birthday)) errors.birthday = 'Enter your birthday.';
    if (!required(values.farmName)) errors.farmName = 'Enter your farm name.';
    if (!required(values.contactNumber)) errors.contactNumber = 'Enter a contact number.';
    if (!required(values.municipality)) errors.municipality = 'Choose your farm location.';
  }
  if (mode === 'register' && values.role === 'buyer') {
    if (!required(values.contactNumber)) errors.contactNumber = 'Enter a contact number.';
    if (!required(values.municipality)) errors.municipality = 'Choose your location.';
  }
  return errors;
}

// `availableUnits` is the caller's own live, product-scoped unit list (see CatalogContext's
// getUnitOptions) rather than something this module looks up itself — the catalog is
// admin-editable data in Supabase now, not a static import, so the caller (which already has
// it via useCatalog()) is the one source of truth for what counts as valid here.
export function validateProductForm(values, availableUnits) {
  const errors = {};
  if (!required(values.name)) errors.name = 'Choose or specify a product.';
  if (!required(values.category)) errors.category = 'Choose a category.';
  if (!['A', 'B'].includes(values.grade)) errors.grade = 'Choose a grade.';
  if (!values.isDonation) {
    if (!['retail', 'wholesale'].includes(values.sellingType)) errors.sellingType = 'Choose a sales type.';
    if (toPositiveNumber(values.price) === null) errors.price = 'Enter a positive price.';
    if (required(values.costPrice) && toPositiveNumber(values.costPrice) === null) {
      errors.costPrice = 'Enter a positive cost, or leave it blank.';
    }
    if (values.sellingType === 'wholesale') {
      const moq = toPositiveNumber(values.moq);
      if (moq === null) errors.moq = 'Enter a positive minimum order quantity.';
      else if (moq > Number(values.quantity)) errors.moq = 'MOQ cannot exceed the quantity available.';
    }
  }
  if (!required(values.unit)) errors.unit = 'Choose a unit.';
  else if (Array.isArray(availableUnits) && !availableUnits.includes(values.unit)) errors.unit = 'Choose a unit valid for this product.';
  else if (!values.isDonation && values.unit !== 'kg' && toPositiveNumber(values.kgPerUnit) === null) {
    errors.kgPerUnit = `Enter how many kg 1 ${values.unit} is.`;
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
    if (!required(values.contactPerson)) errors.contactPerson = 'Enter a contact person.';
  }
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
  // Fields get cleared via `{ ...previous, [field]: undefined }` rather than deleting
  // the key, so a plain key-count check would stay "true" forever after the first typo
  // — even once every value is undefined. Check for an actual truthy message instead.
  return Object.values(errors).some(Boolean);
}
