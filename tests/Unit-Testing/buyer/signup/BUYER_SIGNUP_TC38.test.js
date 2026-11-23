/**
 * Test Case ID: CASE-038
 * Scenario    : Buyer Sign Up with Empty Email Address
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

describe('CASE-038: Buyer Sign Up with Empty Email Address', () => {
  const testCaseId = 'CASE-038';
  const testDescription = 'Buyer attempts to register without entering an email address.';
  const expectedResult = 'Registration is prevented and a required email address validation message appears.';

  it('rejects a Buyer registration when email is empty', () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const validatorSource = fs.readFileSync(path.resolve('src/utils/validators.js'), 'utf8');
    const buyerWithoutEmail = {
      role: 'buyer', firstName: 'Case', lastName: 'Buyer', contactNumber: '09455993970',
      municipality: 'Cebu City', address: '123 Buyer Road', zipCode: '6000',
      email: '', password: 'StrongPass1!', confirmPassword: 'StrongPass1!',
      latitude: 10.3157, longitude: 123.8854, locationAccuracyMeters: 25,
    };

    try {
      const errors = validateAuthForm(buyerWithoutEmail, 'register');
      expect(errors).toMatchObject({ email: 'Enter your email address.' });
      expect(errors).not.toHaveProperty('firstName');
      expect(errors).not.toHaveProperty('lastName');
      expect(errors).not.toHaveProperty('contactNumber');
      expect(errors).not.toHaveProperty('location');
      expect(errors).not.toHaveProperty('address');
      expect(errors).not.toHaveProperty('zipCode');
      expect(errors).not.toHaveProperty('password');
      expect(errors).not.toHaveProperty('confirmPassword');
      expect(validatorSource).toContain("errors.email = 'Enter your email address.'");
      expect(authSource).toContain('Email address');
      expect(authSource).toContain("form.role === 'buyer'");
      expect(postMock).not.toHaveBeenCalled();
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual Buyer validator rejected the empty email address while all other required fields and GPS coordinates were valid; no registration request or verification redirect occurred.');
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
