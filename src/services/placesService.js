import { loadGooglePlaces } from '../lib/googleMapsLoader';

// Cebu province, roughly — biases (never restricts) suggestions toward it so typing
// "SM City" surfaces the Cebu branch first without hiding a genuine exact match elsewhere.
// Paired with includedRegionCodes: ['ph'] below, which IS a hard restriction (this app only
// ever operates in the Philippines).
const CEBU_BIAS_CENTER = { lat: 10.3157, lng: 123.8854 };
// 50,000m is the Places API's own hard ceiling for a circle locationBias (confirmed live:
// requesting 80,000 here previously made EVERY autocomplete call fail with HTTP 400
// INVALID_ARGUMENT — "Invalid circle.radius. Radius must be between 0 and 50,000 meters" —
// which the component silently absorbed into its generic "Couldn't load suggestions" error
// state, since it's caught by the same try/catch as any other request failure.
const CEBU_BIAS_RADIUS_METERS = 50000;

// In-memory only (not the 30-day localStorage cache geocodeService.js uses for exact
// geocodes) — a partial-input suggestion list is only ever useful again within the same
// typing session, and caching it across days would just grow unboundedly for no benefit.
// Capped and FIFO-evicted rather than a real LRU — simple, and this only ever needs to
// absorb a few dozen entries per session (repeated backspacing/retyping the same prefix).
const suggestionCache = new Map();
const SUGGESTION_CACHE_LIMIT = 50;

function cacheGet(key) {
  return suggestionCache.get(key) || null;
}

function cacheSet(key, value) {
  if (suggestionCache.size >= SUGGESTION_CACHE_LIMIT) {
    suggestionCache.delete(suggestionCache.keys().next().value);
  }
  suggestionCache.set(key, value);
}

let placesLibraryPromise = null;
function getPlacesLibrary() {
  if (!placesLibraryPromise) placesLibraryPromise = loadGooglePlaces();
  return placesLibraryPromise;
}

// A session token groups one "search-as-you-type -> pick a result" sequence into a single
// billing session (per Google's Places API pricing) instead of billing each keystroke's
// suggestion request separately. Call this once when a user starts typing into a fresh
// field, pass the same token into every searchAddressSuggestions call for that field, then
// into the one getPlaceDetails call once they pick a suggestion — then start a new token for
// whatever they type next (a token is spent the moment it's used in a Place Details fetch).
export async function createAutocompleteSessionToken() {
  const { AutocompleteSessionToken } = await getPlacesLibrary();
  return new AutocompleteSessionToken();
}

// Returns [{ placeId, mainText, secondaryText, description }] — lightweight display data
// only, deliberately no lat/lng here (the new Places Autocomplete API doesn't return
// coordinates at suggestion time; that's what getPlaceDetails below is for, fetched once,
// only for whichever single suggestion the user actually picks). Caps at 8, matching the
// "5-8 suggestions" spec. Returns [] rather than throwing on an empty/too-short query so
// callers don't need a separate guard before calling this.
export async function searchAddressSuggestions(query, { sessionToken } = {}) {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const cacheKey = trimmed.toLowerCase();
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const { AutocompleteSuggestion } = await getPlacesLibrary();
  // A genuine zero-results response comes back as a bare `{}` — confirmed live against the
  // real endpoint — not `{ suggestions: [] }`, so `suggestions` destructures to undefined
  // without this default. Without the default, `.filter()` below throws, and a plain "no
  // matches for this query" gets misreported as a network/API error instead of an empty
  // result.
  const { suggestions = [] } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: trimmed,
    sessionToken,
    includedRegionCodes: ['ph'],
    locationBias: { center: CEBU_BIAS_CENTER, radius: CEBU_BIAS_RADIUS_METERS },
  });

  const results = suggestions
    .filter((suggestion) => suggestion.placePrediction)
    .slice(0, 8)
    .map((suggestion) => {
      const { placePrediction } = suggestion;
      return {
        placeId: placePrediction.placeId,
        mainText: placePrediction.mainText?.text || placePrediction.text.text,
        secondaryText: placePrediction.secondaryText?.text || '',
        description: placePrediction.text.text,
      };
    });

  cacheSet(cacheKey, results);
  return results;
}

// Fetched once, only when the user actually selects a suggestion — turns the lightweight
// prediction into the full { placeId, formattedAddress, lat, lng } the caller stores. Reuses
// the SAME session token the search calls for this field used, per Google's session-token
// billing model (see createAutocompleteSessionToken above) — the caller is responsible for
// minting a fresh token for whatever the user types next.
export async function getPlaceDetails(placeId, { sessionToken } = {}) {
  const { Place } = await getPlacesLibrary();
  const place = new Place({ id: placeId, requestedLanguage: 'en' });
  await place.fetchFields({ fields: ['formattedAddress', 'location'], sessionToken });

  return {
    placeId,
    formattedAddress: place.formattedAddress,
    lat: place.location?.lat() ?? null,
    lng: place.location?.lng() ?? null,
  };
}
