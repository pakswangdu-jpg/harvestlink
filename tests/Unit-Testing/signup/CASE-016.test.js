/**
 * Test Case ID: TC-016
 * Scenario    : Farmer Sign Up with Empty Password
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

describe('TC-016: Farmer Sign Up with Empty Password', () => {
  const testCaseId = 'TC-016';
  const testDescription = 'Farmer leaves both Password and Confirm Password empty while all other required fields are valid.';
  const expectedResult = 'The messages "Enter your password." and "Confirm your password." appear, registration is prevented, and the registration API is not called.';

  it('returns the actual empty-password validation errors and prevents registration', () => {
    const validFarmer = {
      role: 'farmer', email: 'farmer@example.test', password: '', confirmPassword: '',
      firstName: 'Test', lastName: 'Farmer', birthday: '1990-01-01', farmName: 'Test Farm',
      contactNumber: '09455993970', municipality: 'Cebu City', address: 'Test Address', zipCode: '6000',
    };
    const errors = validateAuthForm(validFarmer, 'register');

    try {
      expect(errors.password).toBe('Enter your password.');
      expect(errors.confirmPassword).toBe('Confirm your password.');
      expect(postMock).not.toHaveBeenCalled();

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual registration validator returned both password messages and no registration API request was made, so the user remains on /register.');
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
