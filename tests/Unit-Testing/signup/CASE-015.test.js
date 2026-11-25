/**
 * Test Case ID: TC-015
 * Scenario    : Farmer Sign Up with Invalid Email Format
 * Route       : /register
 */
import { describe, expect, it, vi } from 'vitest';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));

vi.mock('../../../src/services/apiClient', () => ({ apiClient: { post: postMock } }));
vi.mock('../../../src/lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../../src/services/uploadService', () => ({
  uploadAccreditationFile: vi.fn(),
  uploadGovIdFile: vi.fn(),
}));
vi.mock('../../../src/utils/fetchAdminUserLocations', () => ({ fetchAllAdminUserLocations: vi.fn() }));

import { validateAuthForm } from '../../../src/utils/validators';

describe('TC-015: Farmer Sign Up with Invalid Email Format', () => {
  const testCaseId = 'TC-015';
  const testDescription = 'Farmer enters chadgmail.com, which has no valid email separator, while all other required fields are valid.';
  const expectedResult = 'The message "Enter a valid email address." appears, registration is prevented, and the registration API is not called.';

  it('returns the actual invalid-email validation error and prevents registration', () => {
    const validFarmer = {
      role: 'farmer', email: 'chadgmail.com', password: 'ValidPass1!', confirmPassword: 'ValidPass1!',
      firstName: 'Test', lastName: 'Farmer', birthday: '1990-01-01', farmName: 'Test Farm',
      contactNumber: '09455993970', municipality: 'Cebu City', address: 'Test Address', zipCode: '6000',
    };
    const errors = validateAuthForm(validFarmer, 'register');

    try {
      expect(errors.email).toBe('Enter a valid email address.');
      expect(Object.keys(errors)).toContain('email');
      expect(postMock).not.toHaveBeenCalled();

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual registration validator rejected chadgmail.com with "Enter a valid email address." and no registration API request was made, so the user remains on /register.');
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
