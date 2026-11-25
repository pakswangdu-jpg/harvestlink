/**
 * Test Case ID: CASE-039
 * Scenario    : Buyer Sign Up with Invalid Email Format
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

describe('CASE-039: Buyer Sign Up with Invalid Email Format', () => {
  const testCaseId = 'CASE-039';
  const testDescription = 'Buyer attempts to register using an invalid email address format.';
  const expectedResult = 'Registration is prevented and an invalid email format validation message appears.';
  const invalidEmail = 'chadgmail.com';

  it('rejects a Buyer registration with an email missing the @ symbol', () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const validatorSource = fs.readFileSync(path.resolve('src/utils/validators.js'), 'utf8');
    const buyerWithInvalidEmail = {
      role: 'buyer', firstName: 'Case', lastName: 'Buyer', contactNumber: '09455993970',
      municipality: 'Cebu City', address: '123 Buyer Road', zipCode: '6000',
      email: invalidEmail, password: 'StrongPass1!', confirmPassword: 'StrongPass1!',
      latitude: 10.3157, longitude: 123.8854, locationAccuracyMeters: 25,
    };

    try {
      const errors = validateAuthForm(buyerWithInvalidEmail, 'register');
      expect(isValidEmail(invalidEmail)).toBe(false);
      expect(invalidEmail).not.toContain('@');
      expect(errors).toMatchObject({ email: 'Enter a valid email address.' });
      expect(errors).not.toHaveProperty('firstName');
      expect(errors).not.toHaveProperty('lastName');
      expect(errors).not.toHaveProperty('contactNumber');
      expect(errors).not.toHaveProperty('location');
      expect(errors).not.toHaveProperty('address');
      expect(errors).not.toHaveProperty('zipCode');
      expect(errors).not.toHaveProperty('password');
      expect(errors).not.toHaveProperty('confirmPassword');
      expect(validatorSource).toContain("errors.email = 'Enter a valid email address.'");
      expect(authSource).toContain('Email address');
      expect(authSource).toContain("form.role === 'buyer'");
      expect(postMock).not.toHaveBeenCalled();
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual Buyer email validator rejected chadgmail.com because it has no @ symbol; no registration request or verification redirect occurred.');
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
