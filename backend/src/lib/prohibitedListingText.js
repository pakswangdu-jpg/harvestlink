const prohibitedListingTerms = /\b(?:marijuana|marihuana|cannabis)\b/i;

export function containsProhibitedListingText(...values) {
  return values.some((value) => typeof value === 'string'
    && prohibitedListingTerms.test(value.normalize('NFKC')));
}
