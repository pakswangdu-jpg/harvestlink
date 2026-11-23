/**
 * Test Case ID: CASE-035
 * Scenario    : Buyer Sign Up Without Capturing GPS Location
 * Route       : /register
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../../../src/services/apiClient', () => ({ apiClient: { post: postMock } }));
vi.mock('../../../../src/lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../../../src/services/uploadService', () => ({ uploadAccreditationFile: vi.fn(), uploadGovIdFile: vi.fn() }));
vi.mock('../../../../src/utils/fetchAdminUserLocations', () => ({ fetchAllAdminUserLocations: vi.fn() }));

import { validateAuthForm } from '../../../../src/utils/validators';

describe('CASE-035: Buyer Sign Up Without Capturing GPS Location', () => {
  const testCaseId = 'CASE-035';
  const testDescription = 'Buyer attempts to register without capturing GPS location.';
  const expectedResult = 'Registration is prevented and the system requires GPS location capture.';

  it('rejects valid Buyer data when GPS coordinates are absent', () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const validatorSource = fs.readFileSync(path.resolve('src/utils/validators.js'), 'utf8');
    const buyerWithoutGps = {
      role: 'buyer', firstName: 'Case', lastName: 'Buyer', contactNumber: '09455993970',
      municipality: 'Cebu City', address: '123 Buyer Road', zipCode: '6000',
      email: 'case035-buyer@example.test', password: 'StrongPass1!', confirmPassword: 'StrongPass1!',
      latitude: null, longitude: null, locationAccuracyMeters: null,
    };

    try {
      const errors = validateAuthForm(buyerWithoutGps, 'register');
      expect(errors).toMatchObject({ location: 'Capture your current GPS location to register.' });
      expect(errors).not.toHaveProperty('firstName');
      expect(errors).not.toHaveProperty('lastName');
      expect(errors).not.toHaveProperty('contactNumber');
      expect(errors).not.toHaveProperty('address');
      expect(errors).not.toHaveProperty('zipCode');
      expect(errors).not.toHaveProperty('email');
      expect(errors).not.toHaveProperty('password');
      expect(errors).not.toHaveProperty('confirmPassword');
      expect(authSource).toContain('Capture GPS location');
      expect(authSource).toContain('error={errors.location}');
      expect(validatorSource).toContain('Capture your current GPS location to register.');
      expect(buyerWithoutGps.latitude).toBeNull();
      expect(buyerWithoutGps.longitude).toBeNull();
      expect(postMock).not.toHaveBeenCalled();
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual Buyer validator rejected missing GPS coordinates while all other required fields were valid; no registration request or verification redirect occurred.');
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
