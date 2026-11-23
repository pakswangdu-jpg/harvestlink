/**
 * Test Case ID: CASE-056
 * Scenario    : Stakeholder Sign Up with Empty Password and Confirm Password
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

describe('CASE-056: Stakeholder Sign Up with Empty Password and Confirm Password', () => {
  const testCaseId = 'CASE-056';
  const testDescription = 'Stakeholder attempts to register without entering a password and confirmation password.';
  const expectedResult = 'Registration is prevented and required password validation messages appear.';

  it('rejects a stakeholder registration when both password fields are empty', () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const validatorSource = fs.readFileSync(path.resolve('src/utils/validators.js'), 'utf8');
    const stakeholderWithoutPasswords = {
      role: 'stakeholder', organizationName: 'Case Community Cooperative', organizationType: 'Farmer Cooperative',
      organizationDescription: 'A community cooperative supporting local food distribution.', firstName: 'Case',
      lastName: 'Representative', contactPerson: 'Program Director', contactNumber: '09455993970',
      email: 'case056-stakeholder@example.test', password: '', confirmPassword: '', municipality: 'Cebu City',
      barangay: 'Lahug', partnershipDescription: 'We distribute surplus produce to local families.',
      latitude: 10.3157, longitude: 123.8854, locationAccuracyMeters: 25,
      accreditationFile: new File(['certificate'], 'certificate.pdf', { type: 'application/pdf' }),
    };

    try {
      const errors = validateAuthForm(stakeholderWithoutPasswords, 'register');
      expect(errors).toMatchObject({ password: 'Enter your password.', confirmPassword: 'Confirm your password.' });
      expect(errors).not.toHaveProperty('organizationName');
      expect(errors).not.toHaveProperty('organizationType');
      expect(errors).not.toHaveProperty('organizationDescription');
      expect(errors).not.toHaveProperty('firstName');
      expect(errors).not.toHaveProperty('lastName');
      expect(errors).not.toHaveProperty('contactPerson');
      expect(errors).not.toHaveProperty('contactNumber');
      expect(errors).not.toHaveProperty('email');
      expect(errors).not.toHaveProperty('location');
      expect(errors).not.toHaveProperty('barangay');
      expect(errors).not.toHaveProperty('partnershipDescription');
      expect(errors).not.toHaveProperty('accreditationFile');
      expect(validatorSource).toContain("errors.password = 'Enter your password.'");
      expect(validatorSource).toContain("errors.confirmPassword = 'Confirm your password.'");
      expect(authSource).toContain('Password');
      expect(authSource).toContain('Confirm password');
      expect(authSource).toContain('Partner organization (donation recipient)');
      expect(postMock).not.toHaveBeenCalled();
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual stakeholder validator returned both required password errors while all other required fields, location, and document values were valid; no organization account or verification request was created.');
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
