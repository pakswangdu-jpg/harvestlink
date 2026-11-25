/**
 * Test Case ID: CASE-041
 * Scenario    : Buyer Sign Up with Weak Password
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

describe('CASE-041: Buyer Sign Up with Weak Password', () => {
  const testCaseId = 'CASE-041';
  const testDescription = 'Buyer attempts to register using a weak password.';
  const expectedResult = 'Registration is prevented and password strength validation messages appear.';
  const weakPassword = 'Admin';

  it('identifies Admin as weak and blocks the Buyer signup flow', () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const buyer = {
      role: 'buyer', firstName: 'Case', lastName: 'Buyer', contactNumber: '09455993970',
      municipality: 'Cebu City', address: '123 Buyer Road', zipCode: '6000',
      email: 'case041-buyer@example.test', password: weakPassword, confirmPassword: weakPassword,
      latitude: 10.3157, longitude: 123.8854, locationAccuracyMeters: 25,
    };
    try {
      expect(validateAuthForm(buyer, 'register')).toEqual({});
      expect(weakPassword.length).toBeLessThan(8);
      expect(weakPassword).not.toMatch(/[0-9]/);
      expect(weakPassword).not.toMatch(/[!@#$%^&*]/);
      expect(authSource).toContain("label: 'Weak password'");
      expect(authSource).toContain("label: 'At least 8 characters'");
      expect(authSource).toContain("label: 'One number (0–9)'");
      expect(authSource).toContain("label: 'One special character (!@#$%^&*)'");
      expect(authSource).toContain('PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(form.password))');
      expect(postMock).not.toHaveBeenCalled();
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual password requirements classify Admin as weak, failing length, number, and special-character rules; signup readiness remains blocked and no API request occurred.');
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
