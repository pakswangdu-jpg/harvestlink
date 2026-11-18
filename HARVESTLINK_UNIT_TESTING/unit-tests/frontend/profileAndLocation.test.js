import { describe, expect, it } from 'vitest';
import { buildProfileDraft } from '../../../src/utils/profileDraft.js';
import { findMunicipality, getProfileLocationFromPlace } from '../../../src/utils/profileLocation.js';
import { getFixedKgPerUnit, hasFixedConversion } from '../../../src/utils/unitConversion.js';
import { sanitizePhoneInput, isValidPhilippineMobile, toE164PhilippineMobile } from '../../../src/utils/philippineMobile.js';

describe('Profile drafts and location utilities', () => {
  it('builds a profile draft with safe fallbacks', () => {
    const draft = buildProfileDraft({ name: 'Juan', organizationType: 'Orphanage' });
    expect(draft.name).toBe('Juan');
    expect(draft.municipality).toBe('Alcantara');
  });
  it('finds Cebu municipalities from address text', () => {
    expect(findMunicipality('Cebu City, Cebu')).toBe('Cebu City');
    expect(findMunicipality('Unknown place')).toBeNull();
  });
  it('merges place details with current profile values', () => {
    const result = getProfileLocationFromPlace({
      lat: 10.3157,
      lng: 123.8854,
      municipality: 'Cebu City',
      formattedAddress: 'Cebu City, Cebu',
      zipCode: '6000',
    }, { address: 'Old address', municipality: 'Mandaue City' });
    expect(result.latitude).toBe(10.3157);
    expect(result.municipality).toBe('Cebu City');
  });
  it('rejects invalid coordinates', () => {
    const result = getProfileLocationFromPlace({ lat: 91, lng: 123 }, {});
    expect(result.latitude).toBeNull();
  });
  it('covers metric unit conversions', () => {
    expect(getFixedKgPerUnit('kg')).toBe(1);
    expect(getFixedKgPerUnit('g')).toBe(0.001);
    expect(getFixedKgPerUnit('box')).toBeNull();
    expect(hasFixedConversion('L')).toBe(true);
  });
  it('normalizes Philippine mobile formats', () => {
    expect(sanitizePhoneInput('+63 917 123 4567')).toBe('+639171234567');
    expect(isValidPhilippineMobile('+639171234567')).toBe(true);
    expect(toE164PhilippineMobile('09171234567')).toBe('+639171234567');
  });
});
