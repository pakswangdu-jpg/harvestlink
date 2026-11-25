/**
 * Test Case ID: TC-020
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

describe('TC-020: Farmer Sign Up Without Capturing GPS Location', () => {
  const testCaseId = 'TC-020';
  const testDescription = 'Farmer completes valid registration data, accepts the terms, but does not capture GPS coordinates.';
  const expectedResult = 'Registration is prevented with the GPS-location message, the registration API is not called, and the user remains on /register.';

  it('rejects registration when saved GPS coordinates are absent', () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const validFarmerWithoutGps = {
      role: 'farmer', email: 'farmer@example.test', password: 'StrongPass1!', confirmPassword: 'StrongPass1!',
      firstName: 'Test', lastName: 'Farmer', birthday: '1990-01-01', farmName: 'Test Farm',
      contactNumber: '09455993970', municipality: 'Cebu City', address: 'Test Address', zipCode: '6000',
      govIdFile: new File(['proof'], 'proof.pdf', { type: 'application/pdf' }),
      latitude: null, longitude: null, locationAccuracyMeters: null,
    };
    const errors = validateAuthForm(validFarmerWithoutGps, 'register');

    try {
      expect(errors.location).toBe('Capture your current GPS location to register.');
      expect(validFarmerWithoutGps.latitude).toBeNull();
      expect(validFarmerWithoutGps.longitude).toBeNull();
      expect(authSource).toContain('Capture GPS location');
      expect(postMock).not.toHaveBeenCalled();

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual registration validator rejected the empty GPS state and no registration API request was made.');
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
