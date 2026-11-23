/**
 * Test Case ID: CASE-045
 * Scenario    : Buyer Sign Up with Valid Registration Details
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

import { isValidEmail, isValidZipCode, validateAuthForm } from '../../../../src/utils/validators';
import { isValidPhilippineMobile } from '../../../../src/utils/philippineMobile';

describe('CASE-045: Buyer Sign Up with Valid Registration Details', () => {
  const testCaseId = 'CASE-045';
  const testDescription = 'Buyer enters complete and valid registration information.';
  const expectedResult = 'All required registration inputs are accepted without validation errors.';
  const buyer = {
    role: 'buyer', firstName: 'Valid', lastName: 'Buyer', contactNumber: '09455993970',
    municipality: 'Cebu City', address: '123 Buyer Road', zipCode: '6000',
    email: 'case045-buyer@example.test', password: 'StrongPass1!', confirmPassword: 'StrongPass1!',
    latitude: 10.3157, longitude: 123.8854, locationAccuracyMeters: 25,
  };

  it('accepts every required Buyer field without submitting registration', () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    try {
      const errors = validateAuthForm(buyer, 'register');
      expect(errors).toEqual({});
      expect(isValidPhilippineMobile(buyer.contactNumber)).toBe(true);
      expect(isValidEmail(buyer.email)).toBe(true);
      expect(isValidZipCode(buyer.zipCode, buyer.municipality)).toBe(true);
      expect(buyer.password).toBe(buyer.confirmPassword);
      expect(buyer.password.length).toBeGreaterThanOrEqual(8);
      expect(authSource).toContain("form.role === 'buyer'");
      expect(authSource).toContain('PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(form.password))');
      expect(authSource).toContain('checked={agreedToTerms}');
      expect(postMock).not.toHaveBeenCalled();
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual Buyer validator returned no errors for all required fields, including location-aware ZIP, mobile, email, password, and matching confirmation; no registration API request was made.');
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
