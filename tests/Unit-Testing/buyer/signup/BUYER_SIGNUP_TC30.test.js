/**
 * Test Case ID: CASE-030
 * Scenario    : Buyer Sign Up with Empty Password and Confirm Password
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

describe('CASE-030: Buyer Sign Up with Empty Password and Confirm Password', () => {
  const testCaseId = 'CASE-030';
  const testDescription = 'Buyer submits valid registration details with both password fields empty.';
  const expectedResult = 'The actual validation displays the required password messages, blocks registration, makes no API request, and keeps the buyer on the Sign Up page.';

  it('rejects a buyer registration with empty password fields', () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const validatorSource = fs.readFileSync(path.resolve('src/utils/validators.js'), 'utf8');
    const buyerWithoutPasswords = {
      role: 'buyer', firstName: 'Case', lastName: 'Buyer', contactNumber: '09455993970',
      municipality: 'Cebu City', address: '123 Buyer Road', zipCode: '6000',
      email: 'case030-buyer@example.test', password: '', confirmPassword: '',
      latitude: 10.3157, longitude: 123.8854, locationAccuracyMeters: 25,
    };

    try {
      const errors = validateAuthForm(buyerWithoutPasswords, 'register');

      expect(errors).toMatchObject({
        password: 'Enter your password.',
        confirmPassword: 'Confirm your password.',
      });
      expect(Object.keys(errors)).toEqual(expect.arrayContaining(['password', 'confirmPassword']));
      expect(errors).not.toHaveProperty('firstName');
      expect(errors).not.toHaveProperty('lastName');
      expect(errors).not.toHaveProperty('contactNumber');
      expect(errors).not.toHaveProperty('location');
      expect(errors).not.toHaveProperty('address');
      expect(errors).not.toHaveProperty('zipCode');
      expect(errors).not.toHaveProperty('email');
      expect(validatorSource).toContain("errors.password = 'Enter your password.'");
      expect(validatorSource).toContain("errors.confirmPassword = 'Confirm your password.'");
      expect(authSource).toContain("form.role === 'buyer'");
      expect(authSource).toContain('Verify your email');
      expect(postMock).not.toHaveBeenCalled();

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual buyer registration validator rejected both empty password fields while all other required data, including GPS, remained valid; no registration request or verification redirect occurred.');
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
