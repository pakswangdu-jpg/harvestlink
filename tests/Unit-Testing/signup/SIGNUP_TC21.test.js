/**
 * Test Case ID: TC-021
 * Scenario    : Farmer Sign Up with Valid Registration Details
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

import { registerUser } from '../../../src/services/authService';
import { validateAuthForm } from '../../../src/utils/validators';

describe('TC-021: Farmer Sign Up with Valid Registration Details', () => {
  const testCaseId = 'TC-021';
  const testDescription = 'Farmer submits complete valid registration details with GPS capture, document proof, terms acceptance, and a strong matching password.';
  const expectedResult = 'Validation succeeds, the mocked registration response requires email verification, and the verification stage displays six code inputs and a verification-code notice.';

  it('accepts valid registration data and returns the pending-verification response', async () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const validFarmer = {
      role: 'farmer', email: 'valid-farmer@example.test', password: 'StrongPass1!', confirmPassword: 'StrongPass1!',
      firstName: 'Valid', lastName: 'Farmer', birthday: '1990-01-01', farmName: 'Valid Farm',
      contactNumber: '09455993970', municipality: 'Cebu City', address: 'Test Address', zipCode: '6000',
      govIdFile: new File(['proof'], 'proof.pdf', { type: 'application/pdf' }),
      latitude: 10.3157, longitude: 123.8854, locationAccuracyMeters: 25,
    };
    postMock.mockResolvedValueOnce({ pendingVerification: true });

    try {
      const errors = validateAuthForm(validFarmer, 'register');
      expect(errors).toEqual({});
      expect(authSource).toContain('I agree to the');
      expect(authSource).toContain('Verify your email');
      expect(authSource).toContain('Digit ${index + 1} of ${OTP_LENGTH}');

      const result = await registerUser(validFarmer);
      expect(result).toEqual({ pendingVerification: true });
      expect(postMock).toHaveBeenCalledTimes(1);
      expect(postMock).toHaveBeenCalledWith('/auth/register', expect.objectContaining({
        role: 'farmer', email: validFarmer.email, contactNumber: validFarmer.contactNumber,
      }));

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: Valid data passed the actual validator and the mocked registration API returned pendingVerification, which keeps the account pending until the six-digit email code is completed.');
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
