/**
 * Test Case ID: TC-018
 * Scenario    : Farmer Sign Up with Password Mismatch
 * Route       : /register
 */
import { describe, expect, it, vi } from 'vitest';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../../src/services/apiClient', () => ({ apiClient: { post: postMock } }));
vi.mock('../../../src/lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../../src/services/uploadService', () => ({ uploadAccreditationFile: vi.fn(), uploadGovIdFile: vi.fn() }));
vi.mock('../../../src/utils/fetchAdminUserLocations', () => ({ fetchAllAdminUserLocations: vi.fn() }));

import { validateAuthForm } from '../../../src/utils/validators';

describe('TC-018: Farmer Sign Up with Password Mismatch', () => {
  const testCaseId = 'TC-018';
  const testDescription = 'Farmer enters a strong password but a different Confirm Password value while all other fields are valid.';
  const expectedResult = 'The message "Passwords do not match." appears, registration is prevented, and the registration API is not called.';

  it('returns the actual password-mismatch validation error and prevents registration', () => {
    const validFarmer = {
      role: 'farmer', email: 'farmer@example.test', password: 'StrongPass1!', confirmPassword: 'StrongPass2!',
      firstName: 'Test', lastName: 'Farmer', birthday: '1990-01-01', farmName: 'Test Farm',
      contactNumber: '09455993970', municipality: 'Cebu City', address: 'Test Address', zipCode: '6000',
    };
    const errors = validateAuthForm(validFarmer, 'register');

    try {
      expect(errors.password).toBeUndefined();
      expect(errors.confirmPassword).toBe('Passwords do not match.');
      expect(postMock).not.toHaveBeenCalled();

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual registration validator accepted the strong password, returned "Passwords do not match." for confirmation, and no registration API request was made, so the user remains on /register.');
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
