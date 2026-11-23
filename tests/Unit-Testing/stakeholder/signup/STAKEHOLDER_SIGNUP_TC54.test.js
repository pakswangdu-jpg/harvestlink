/**
 * Test Case ID: CASE-054
 * Scenario    : Stakeholder Sign Up with Invalid Email Format
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

import { isValidEmail, validateAuthForm } from '../../../../src/utils/validators';

describe('CASE-054: Stakeholder Sign Up with Invalid Email Format', () => {
  const testCaseId = 'CASE-054';
  const testDescription = 'Stakeholder attempts to register using an invalid email address format.';
  const expectedResult = 'Registration is prevented and an invalid email format validation message appears.';
  const invalidEmail = 'chadgmail.com';

  it('rejects a stakeholder registration with an email missing the @ symbol', () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const validatorSource = fs.readFileSync(path.resolve('src/utils/validators.js'), 'utf8');
    const stakeholderWithInvalidEmail = {
      role: 'stakeholder', organizationName: 'Case Community Cooperative', organizationType: 'Farmer Cooperative',
      organizationDescription: 'A community cooperative supporting local food distribution.', firstName: 'Case',
      lastName: 'Representative', contactPerson: 'Program Director', contactNumber: '09455993970',
      email: invalidEmail, password: 'StrongPass1!', confirmPassword: 'StrongPass1!', municipality: 'Cebu City',
      barangay: 'Lahug', partnershipDescription: 'We distribute surplus produce to local families.',
      latitude: 10.3157, longitude: 123.8854, locationAccuracyMeters: 25,
      accreditationFile: new File(['certificate'], 'certificate.pdf', { type: 'application/pdf' }),
    };

    try {
      const errors = validateAuthForm(stakeholderWithInvalidEmail, 'register');
      expect(isValidEmail(invalidEmail)).toBe(false);
      expect(invalidEmail).not.toContain('@');
      expect(errors).toMatchObject({ email: 'Enter a valid email address.' });
      expect(errors).not.toHaveProperty('organizationName');
      expect(errors).not.toHaveProperty('organizationType');
      expect(errors).not.toHaveProperty('organizationDescription');
      expect(errors).not.toHaveProperty('firstName');
      expect(errors).not.toHaveProperty('lastName');
      expect(errors).not.toHaveProperty('contactPerson');
      expect(errors).not.toHaveProperty('contactNumber');
      expect(errors).not.toHaveProperty('password');
      expect(errors).not.toHaveProperty('confirmPassword');
      expect(errors).not.toHaveProperty('location');
      expect(errors).not.toHaveProperty('barangay');
      expect(errors).not.toHaveProperty('partnershipDescription');
      expect(errors).not.toHaveProperty('accreditationFile');
      expect(validatorSource).toContain("errors.email = 'Enter a valid email address.'");
      expect(authSource).toContain('Email address');
      expect(authSource).toContain('Partner organization (donation recipient)');
      expect(postMock).not.toHaveBeenCalled();
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual stakeholder email validator rejected chadgmail.com because it lacks @; no registration request or verification transition occurred.');
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
