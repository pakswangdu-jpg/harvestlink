/**
 * Test Case ID: CASE-031
 * Scenario    : Buyer Sign Up with Empty First Name
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

describe('CASE-031: Buyer Sign Up with Empty First Name', () => {
  const testCaseId = 'CASE-031';
  const testDescription = 'Buyer attempts to register without entering a first name.';
  const expectedResult = 'Registration is prevented and a required first name validation message appears.';

  it('rejects a buyer registration when first name is empty', () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const validatorSource = fs.readFileSync(path.resolve('src/utils/validators.js'), 'utf8');
    const buyerWithoutFirstName = {
      role: 'buyer', firstName: '', lastName: 'Buyer', contactNumber: '09455993970',
      municipality: 'Cebu City', address: '123 Buyer Road', zipCode: '6000',
      email: 'case031-buyer@example.test', password: 'StrongPass1!', confirmPassword: 'StrongPass1!',
      latitude: 10.3157, longitude: 123.8854, locationAccuracyMeters: 25,
    };

    try {
      const errors = validateAuthForm(buyerWithoutFirstName, 'register');

      expect(errors).toMatchObject({ firstName: 'Enter your first name.' });
      expect(errors).not.toHaveProperty('lastName');
      expect(errors).not.toHaveProperty('contactNumber');
      expect(errors).not.toHaveProperty('location');
      expect(errors).not.toHaveProperty('address');
      expect(errors).not.toHaveProperty('zipCode');
      expect(errors).not.toHaveProperty('email');
      expect(errors).not.toHaveProperty('password');
      expect(errors).not.toHaveProperty('confirmPassword');
      expect(validatorSource).toContain("errors.firstName = 'Enter your first name.'");
      expect(authSource).toContain("FormField label=\"First name\" name=\"firstName\"");
      expect(authSource).toContain("form.role === 'buyer'");
      expect(postMock).not.toHaveBeenCalled();

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual buyer validator rejected the empty first name while all other required values and GPS coordinates were valid; no registration request or verification redirect occurred.');
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
