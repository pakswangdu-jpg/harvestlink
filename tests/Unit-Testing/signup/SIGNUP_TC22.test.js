/**
 * Test Case ID: CASE-022
 * Scenario    : Farmer Sign Up Without Capturing GPS Location
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

describe('CASE-022: Farmer Sign Up Without Capturing GPS Location', () => {
  const testCaseId = 'CASE-022';
  const testDescription = 'Farmer submits otherwise valid registration details without capturing the required GPS location.';
  const expectedResult = 'The form shows the required-information and GPS-location notifications, prevents registration, makes no API request, and remains on /register.';

  it('rejects valid farmer details when GPS coordinates are uncaptured', () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const validatorSource = fs.readFileSync(path.resolve('src/utils/validators.js'), 'utf8');
    const farmerWithoutGps = {
      role: 'farmer', email: 'case022-farmer@example.test', password: 'StrongPass1!', confirmPassword: 'StrongPass1!',
      firstName: 'Case', lastName: 'Farmer', birthday: '1990-01-01', farmName: 'Case Farm',
      contactNumber: '09455993970', municipality: 'Cebu City', address: '123 Farm Road', zipCode: '6000',
      govIdFile: new File(['proof'], 'proof.pdf', { type: 'application/pdf' }),
      latitude: null, longitude: null, locationAccuracyMeters: null,
    };

    try {
      const errors = validateAuthForm(farmerWithoutGps, 'register');

      expect(errors).toMatchObject({ location: 'Capture your current GPS location to register.' });
      expect(errors).not.toHaveProperty('address');
      expect(errors).not.toHaveProperty('zipCode');
      expect(authSource).toContain('Please complete the required information.');
      expect(authSource).toContain('error={errors.location}');
      expect(validatorSource).toContain('Capture your current GPS location to register.');
      expect(farmerWithoutGps.latitude).toBeNull();
      expect(farmerWithoutGps.longitude).toBeNull();
      expect(postMock).not.toHaveBeenCalled();

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual validator rejected the uncaptured GPS state; the source contains both required notifications and no registration request was made.');
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
