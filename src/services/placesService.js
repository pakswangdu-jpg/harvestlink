import { loadGooglePlaces } from '../lib/googleMapsLoader';





const CEBU_BIAS_CENTER = { lat: 10.3157, lng: 123.8854 };





const CEBU_BIAS_RADIUS_METERS = 50000;






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







export async function createAutocompleteSessionToken() {
  const { AutocompleteSessionToken } = await getPlacesLibrary();
  return new AutocompleteSessionToken();
}







export async function searchAddressSuggestions(query, { sessionToken } = {}) {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const cacheKey = trimmed.toLowerCase();
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const { AutocompleteSuggestion } = await getPlacesLibrary();





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






export async function getPlaceDetails(placeId, { sessionToken } = {}) {
  const { Place } = await getPlacesLibrary();
  const place = new Place({ id: placeId, requestedLanguage: 'en' });
  await place.fetchFields({ fields: ['formattedAddress', 'location', 'addressComponents'], sessionToken });




  const zipCode = place.addressComponents?.find((component) => component.types.includes('postal_code'))?.longText || '';
  const addressComponents = place.addressComponents || [];
  const municipality = ['locality', 'administrative_area_level_3', 'administrative_area_level_2']
    .map((type) => addressComponents.find((component) => component.types.includes(type))?.longText)
    .find(Boolean) || '';

  return {
    placeId,
    formattedAddress: place.formattedAddress,
    municipality,
    lat: place.location?.lat() ?? null,
    lng: place.location?.lng() ?? null,
    zipCode,
  };
}
