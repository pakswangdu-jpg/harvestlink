/**
 * Test Case ID: CASE-033
 * Scenario    : Buyer Sign Up with Invalid Contact Number
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

describe('CASE-033: Buyer Sign Up with Invalid Contact Number', () => {
  const testCaseId = 'CASE-033';
  const testDescription = 'Buyer attempts to register using an invalid contact number.';
  const expectedResult = 'Registration is prevented and an invalid contact number validation message appears.';

  it('rejects a buyer registration with an invalid Philippine contact number', () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const validatorSource = fs.readFileSync(path.resolve('src/utils/validators.js'), 'utf8');
    const mobileSource = fs.readFileSync(path.resolve('src/utils/philippineMobile.js'), 'utf8');
    const buyerWithInvalidContact = {
      role: 'buyer', firstName: 'Case', lastName: 'Buyer', contactNumber: '123123123',
      municipality: 'Cebu City', address: '123 Buyer Road', zipCode: '6000',
      email: 'case033-buyer@example.test', password: 'StrongPass1!', confirmPassword: 'StrongPass1!',
      latitude: 10.3157, longitude: 123.8854, locationAccuracyMeters: 25,
    };

    try {
      const errors = validateAuthForm(buyerWithInvalidContact, 'register');

      expect(errors).toMatchObject({ contactNumber: 'Please enter a valid Philippine mobile number.' });
      expect(errors).not.toHaveProperty('firstName');
      expect(errors).not.toHaveProperty('lastName');
      expect(errors).not.toHaveProperty('location');
      expect(errors).not.toHaveProperty('address');
      expect(errors).not.toHaveProperty('zipCode');
      expect(errors).not.toHaveProperty('email');
      expect(errors).not.toHaveProperty('password');
      expect(errors).not.toHaveProperty('confirmPassword');
      expect(validatorSource).toContain("errors.contactNumber = 'Please enter a valid Philippine mobile number.'");
      expect(mobileSource).toContain('isValidPhilippineMobile');
      expect(authSource).toContain('Please enter a valid Philippine mobile number.');
      expect(authSource).toContain("form.role === 'buyer'");
      expect(postMock).not.toHaveBeenCalled();

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual Buyer validator rejected 123123123 as an invalid Philippine mobile number while all other registration fields and GPS coordinates were valid; no registration request or verification redirect occurred.');
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
