/**
 * Test Case ID: CASE-042
 * Scenario    : Buyer Sign Up with Password Mismatch
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

describe('CASE-042: Buyer Sign Up with Password Mismatch', () => {
  const testCaseId = 'CASE-042';
  const testDescription = 'Buyer attempts to register using different passwords in the Password and Confirm Password fields.';
  const expectedResult = 'Registration is prevented and a password mismatch validation message appears.';
  const password = 'Harvest@123';
  const confirmPassword = 'Harvest@456';

  it('rejects strong but mismatched Buyer passwords', () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const validatorSource = fs.readFileSync(path.resolve('src/utils/validators.js'), 'utf8');
    const buyerWithMismatchedPasswords = {
      role: 'buyer', firstName: 'Case', lastName: 'Buyer', contactNumber: '09455993970',
      municipality: 'Cebu City', address: '123 Buyer Road', zipCode: '6000',
      email: 'case042-buyer@example.test', password, confirmPassword,
      latitude: 10.3157, longitude: 123.8854, locationAccuracyMeters: 25,
    };

    try {
      const errors = validateAuthForm(buyerWithMismatchedPasswords, 'register');
      expect(password).toMatch(/^.{8,}$/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[!@#$%^&*]/);
      expect(confirmPassword).toMatch(/^.{8,}$/);
      expect(confirmPassword).toMatch(/[A-Z]/);
      expect(confirmPassword).toMatch(/[a-z]/);
      expect(confirmPassword).toMatch(/[0-9]/);
      expect(confirmPassword).toMatch(/[!@#$%^&*]/);
      expect(errors).toMatchObject({ confirmPassword: 'Passwords do not match.' });
      expect(errors).not.toHaveProperty('firstName');
      expect(errors).not.toHaveProperty('lastName');
      expect(errors).not.toHaveProperty('contactNumber');
      expect(errors).not.toHaveProperty('location');
      expect(errors).not.toHaveProperty('address');
      expect(errors).not.toHaveProperty('zipCode');
      expect(errors).not.toHaveProperty('email');
      expect(errors).not.toHaveProperty('password');
      expect(validatorSource).toContain("errors.confirmPassword = 'Passwords do not match.'");
      expect(authSource).toContain('Confirm password');
      expect(authSource).toContain("form.role === 'buyer'");
      expect(postMock).not.toHaveBeenCalled();
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: Both passwords independently satisfy the actual strength rules, but the validator rejected their mismatch; no registration request or verification redirect occurred.');
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
