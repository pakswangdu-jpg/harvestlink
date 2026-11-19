import { describe, expect, it } from 'vitest';
import { buildProfileDraft } from '../../../src/utils/profileDraft.js';
import { validateProfileForm, isValidPersonName } from '../../../src/utils/validators.js';

describe('Profile management', () => {
  it('builds a buyer draft with safe fallbacks', () => {
    const draft = buildProfileDraft({ name: 'Juan', municipality: 'Cebu City' });
    expect(draft.name).toBe('Juan');
    expect(draft.municipality).toBe('Cebu City');
  });
  it('validates required buyer profile fields', () => {
    const errors = validateProfileForm({ name: '', municipality: '', address: '', zipCode: '' }, 'buyer');
    expect(errors.name).toBeTruthy();
    expect(errors.municipality).toBeTruthy();
  });
  it('validates stakeholder organization fields', () => {
    const errors = validateProfileForm({
      name: 'Juan',
      municipality: 'Cebu City',
      address: 'Cebu',
      zipCode: '6000',
      organizationName: '',
      organizationType: '',
      contactPerson: '',
    }, 'stakeholder');
    expect(errors.organizationName).toBeTruthy();
  });
  it('validates real person names', () => {
    expect(isValidPersonName('Juan Dela Cruz')).toBe(true);
    expect(isValidPersonName('12')).toBe(false);
  });
});
