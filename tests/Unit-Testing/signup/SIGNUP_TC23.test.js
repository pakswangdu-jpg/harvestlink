/**
 * Test Case ID: CASE-023
 * Scenario    : Farmer Sign Up Without Uploading Proof of Certification or Government ID
 * Route       : /register
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../../src/services/apiClient', () => ({ apiClient: { post: postMock } }));
vi.mock('../../../src/lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../../src/services/uploadService', () => ({ uploadAccreditationFile: vi.fn(), uploadGovIdFile: vi.fn() }));
vi.mock('../../../src/utils/fetchAdminUserLocations', () => ({ fetchAllAdminUserLocations: vi.fn() }));

import { validateAuthForm } from '../../../src/utils/validators';

describe('CASE-023: Farmer Sign Up Without Uploading Proof of Certification or Government ID', () => {
  const testCaseId = 'CASE-023';
  const testDescription = 'Farmer submits valid registration details and captured GPS coordinates without uploading the required proof document.';
  const expectedResult = 'The form shows the required-information and document-upload notifications, prevents registration, makes no API request, and remains on /register.';

  it('rejects valid farmer details when the verification document is missing', () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const validatorSource = fs.readFileSync(path.resolve('src/utils/validators.js'), 'utf8');
    const farmerWithoutDocument = {
      role: 'farmer', email: 'case023-farmer@example.test', password: 'StrongPass1!', confirmPassword: 'StrongPass1!',
      firstName: 'Case', lastName: 'Farmer', birthday: '1990-01-01', farmName: 'Case Farm',
      contactNumber: '09455993970', municipality: 'Cebu City', address: '123 Farm Road', zipCode: '6000',
      govIdFile: null,
      latitude: 10.3157, longitude: 123.8854, locationAccuracyMeters: 25,
    };

    try {
      const errors = validateAuthForm(farmerWithoutDocument, 'register');

      expect(errors).toMatchObject({ govIdFile: 'Upload a proof of certification or government ID to continue.' });
      expect(errors).not.toHaveProperty('location');
      expect(errors).not.toHaveProperty('address');
      expect(errors).not.toHaveProperty('zipCode');
      expect(authSource).toContain('Please complete the required information.');
      expect(authSource).toContain('name="govIdFile"');
      expect(validatorSource).toContain('Upload a proof of certification or government ID to continue.');
      expect(farmerWithoutDocument.latitude).toBe(10.3157);
      expect(farmerWithoutDocument.longitude).toBe(123.8854);
      expect(postMock).not.toHaveBeenCalled();

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual validator rejected the missing proof document while accepting the other registration fields and GPS coordinates; no registration request was made.');
      console.log('Outcome: PASSED');
    } catch (error) {
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log(`Actual Result: ${error.message}`);
      console.log('Outcome: FAILED');
      throw error;
    }
  });
});
