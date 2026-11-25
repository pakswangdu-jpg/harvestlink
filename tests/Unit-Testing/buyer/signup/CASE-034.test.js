/** Test Case ID: CASE-034 — Buyer Sign Up with Valid Contact Number */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../../../src/services/apiClient', () => ({ apiClient: { post: postMock } }));
vi.mock('../../../../src/lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../../../src/services/uploadService', () => ({ uploadAccreditationFile: vi.fn(), uploadGovIdFile: vi.fn() }));
vi.mock('../../../../src/utils/fetchAdminUserLocations', () => ({ fetchAllAdminUserLocations: vi.fn() }));

import { validateAuthForm } from '../../../../src/utils/validators';
import { isValidPhilippineMobile } from '../../../../src/utils/philippineMobile';

describe('CASE-034: Buyer Sign Up with Valid Contact Number', () => {
  const testCaseId = 'CASE-034';
  const testDescription = 'Buyer enters a valid Philippine mobile number during registration.';
  const expectedResult = 'The system accepts the valid contact number without displaying a validation error.';
  const validContactNumber = '09455993970';

  it('accepts a valid Philippine mobile number', () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const validatorSource = fs.readFileSync(path.resolve('src/utils/validators.js'), 'utf8');
    const buyer = {
      role: 'buyer', firstName: 'Case', lastName: 'Buyer', contactNumber: validContactNumber,
      municipality: 'Cebu City', address: '123 Buyer Road', zipCode: '6000',
      email: 'case034-buyer@example.test', password: 'StrongPass1!', confirmPassword: 'StrongPass1!',
      latitude: 10.3157, longitude: 123.8854, locationAccuracyMeters: 25,
    };
    try {
      const errors = validateAuthForm(buyer, 'register');
      expect(isValidPhilippineMobile(validContactNumber)).toBe(true);
      expect(errors).not.toHaveProperty('contactNumber');
      expect(errors).not.toHaveProperty('firstName');
      expect(errors).not.toHaveProperty('lastName');
      expect(errors).not.toHaveProperty('location');
      expect(errors).not.toHaveProperty('address');
      expect(errors).not.toHaveProperty('zipCode');
      expect(errors).not.toHaveProperty('email');
      expect(errors).not.toHaveProperty('password');
      expect(errors).not.toHaveProperty('confirmPassword');
      expect(validatorSource).toContain('isValidPhilippineMobile(values.contactNumber)');
      expect(authSource).toContain('Valid Philippine mobile number');
      expect(authSource).toContain("form.role === 'buyer'");
      expect(postMock).not.toHaveBeenCalled();
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual validator accepted 09455993970 with no contact-number error; no registration API was called.');
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
