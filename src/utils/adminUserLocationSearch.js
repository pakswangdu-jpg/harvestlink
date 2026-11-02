function normalizeSearchValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .trim();
}

export function matchesAdminUserLocationSearch(user, query) {
  const terms = normalizeSearchValue(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;

  const searchableText = [
    user.name,
    user.firstName,
    user.middleName,
    user.lastName,
    user.email,
    user.farmName,
    user.organizationName,
    user.address,
    user.barangay,
    user.municipality,
    user.zipCode,
  ].map(normalizeSearchValue).filter(Boolean).join(' ');

  return terms.every((term) => searchableText.includes(term));
}
