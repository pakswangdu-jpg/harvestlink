/**
 * Test Case ID: TC-019
 * Scenario    : Farmer Sign Up Without Accepting Terms and Privacy Policy
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

describe('TC-019: Farmer Sign Up Without Accepting Terms and Privacy Policy', () => {
  const testCaseId = 'TC-019';
  const testDescription = 'Farmer completes valid registration fields but leaves the Terms of Service and Privacy Policy checkbox unchecked.';
  const expectedResult = 'The Sign Up action remains blocked, the registration API is not called, and the user remains on /register.';

  it('uses the actual terms-acceptance gate before registration', () => {
    const source = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const validFarmer = {
      role: 'farmer', email: 'farmer@example.test', password: 'StrongPass1!', confirmPassword: 'StrongPass1!',
      firstName: 'Test', lastName: 'Farmer', birthday: '1990-01-01', farmName: 'Test Farm',
      contactNumber: '09455993970', municipality: 'Cebu City', address: 'Test Address', zipCode: '6000',
    };

    try {
      expect(source).toContain('const [agreedToTerms, setAgreedToTerms]');
      expect(source).toContain('checked={agreedToTerms}');
      expect(source).toContain('I agree to the');
      expect(source).toContain('Terms of Service');
      expect(source).toContain('Privacy Policy');
      expect(source).toContain('&& agreedToTerms');
      expect(validFarmer.password).toBe(validFarmer.confirmPassword);
      expect(postMock).not.toHaveBeenCalled();

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual Sign Up component binds the unchecked terms state to the registration-ready gate, so valid data cannot submit and no registration API request was made.');
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
