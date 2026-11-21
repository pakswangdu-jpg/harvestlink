import { findMunicipality } from './profileLocation';

export function parseReverseGeocodeResults(results) {
  if (!results?.length) return null;
  const components = results.flatMap((result) => result.address_components || []);
  const component = (type) => components.find((item) => item.types.includes(type))?.long_name || '';
  const cityCandidates = components.filter((item) => item.types.some((type) => [
    'locality', 'administrative_area_level_3', 'administrative_area_level_2',
  ].includes(type)) && !(item.types.includes('administrative_area_level_2') && item.long_name.toLowerCase() === 'cebu'))
    .map((item) => item.long_name);
  const formattedCandidates = results.flatMap((result) => String(result.formatted_address || '').split(','))
    .filter((part) => part.trim().toLowerCase() !== 'cebu');
  const municipality = findMunicipality(...cityCandidates, ...formattedCandidates);
  const province = component('administrative_area_level_2');
  const country = components.find((item) => item.types.includes('country'));
  const isSupportedArea = (!country || country.short_name === 'PH')
    && (!province || province.toLowerCase() === 'cebu' || Boolean(findMunicipality(province)));

  // Keep the house number and route from the same result rather than mixing addresses.
  const streetResult = results.find((result) => result.address_components?.some((item) => item.types.includes('route')));
  const streetComponents = streetResult?.address_components || [];
  const streetComponent = (type) => streetComponents.find((item) => item.types.includes(type))?.long_name || '';
  const street = [streetComponent('street_number'), streetComponent('route')].filter(Boolean).join(' ');
  const locality = component('locality');
  const barangay = [
    component('sublocality_level_1'), component('sublocality_level_2'),
    component('neighborhood'), component('sublocality'),
    municipality && !findMunicipality(locality) ? locality : '',
  ].find((value) => value && !findMunicipality(value)) || '';

  const countryName = country?.long_name || '';
  const cityPart = (isSupportedArea ? municipality : null) || cityCandidates[0] || '';
  const provincePart = province || component('administrative_area_level_1');
  const composedAddress = [street, barangay, cityPart, provincePart, countryName]
    .filter(Boolean)
    .filter((part, idx, arr) => arr.findIndex((p) => p.toLowerCase() === part.toLowerCase()) === idx)
    .join(', ');
  const formattedAddress = results[0].formatted_address || '';
  const completeAddress = composedAddress || formattedAddress;

  return {
    address: [street, barangay].filter(Boolean).join(', '),
    completeAddress,
    street,
    barangay,
    zipCode: component('postal_code'),
    cityText: isSupportedArea ? municipality || cityCandidates[0] || '' : cityCandidates[0] || '',
    municipality: isSupportedArea ? municipality : null,
    isSupportedArea,
    province: provincePart,
    country: countryName,
    formattedAddress,
  };
}

export function parseNominatimReverseResult(data) {
  if (!data || data.error) return null;
  const addr = data.address || {};
  const street = [addr.house_number, addr.road || addr.pedestrian || addr.residential].filter(Boolean).join(' ').trim();
  const barangay = [addr.quarter, addr.suburb, addr.neighbourhood, addr.village, addr.hamlet]
    .find((value) => value && !findMunicipality(value)) || '';
  const cityRaw = addr.city || addr.town || addr.municipality || '';
  const province = addr.province || addr.state || addr.region || '';
  const countryName = addr.country || '';
  const countryCode = String(addr.country_code || '').toUpperCase();
  const municipality = findMunicipality(cityRaw, addr.county, data.display_name);
  const isSupportedArea = (!countryCode || countryCode === 'PH')
    && (!province || province.toLowerCase() === 'cebu' || Boolean(findMunicipality(province)) || Boolean(municipality));
  const cityPart = (isSupportedArea ? municipality : null) || cityRaw;
  const composedAddress = [street, barangay, cityPart, province, countryName]
    .filter(Boolean)
    .filter((part, idx, arr) => arr.findIndex((p) => p.toLowerCase() === part.toLowerCase()) === idx)
    .join(', ');
  const completeAddress = composedAddress || data.display_name || '';

  return {
    address: [street, barangay].filter(Boolean).join(', '),
    completeAddress,
    street,
    barangay,
    zipCode: String(addr.postcode || '').trim(),
    cityText: cityPart,
    municipality: isSupportedArea ? municipality : null,
    isSupportedArea,
    province,
    country: countryName,
    formattedAddress: data.display_name || completeAddress,
  };
}
