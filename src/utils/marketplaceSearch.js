function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function matchesMarketplaceProduct(product, query) {
  const terms = normalizeSearchText(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;

  const searchableText = normalizeSearchText([
    product.id,
    product.name,
    product.category,
    product.location,
    product.farmerName,
    product.farmerFarmName,
  ].join(' '));
  return terms.every((term) => searchableText.includes(term));
}
