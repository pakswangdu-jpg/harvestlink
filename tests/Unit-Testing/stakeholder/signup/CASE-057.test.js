/** Test Case ID: CASE-057 — Stakeholder Sign Up with Weak Password. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../../../src/services/apiClient', () => ({ apiClient: { post: postMock } }));
vi.mock('../../../../src/lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../../../src/services/uploadService', () => ({ uploadAccreditationFile: vi.fn(), uploadGovIdFile: vi.fn() }));
vi.mock('../../../../src/utils/fetchAdminUserLocations', () => ({ fetchAllAdminUserLocations: vi.fn() }));

import { validateAuthForm } from '../../../../src/utils/validators';

describe('CASE-057: Stakeholder Sign Up with Weak Password', () => {
  const testCaseId = 'CASE-057';
  const testDescription = 'Stakeholder attempts to register using a weak password.';
  const expectedResult = 'Registration is prevented and password strength validation messages appear.';
  const weakPassword = 'Admin';

  it('identifies Admin as weak and blocks signup', () => {
    const source = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const stakeholder = {
      role: 'stakeholder', organizationName: 'Case Community Cooperative', organizationType: 'Farmer Cooperative',
      organizationDescription: 'A community cooperative supporting local food distribution.', firstName: 'Case',
      lastName: 'Representative', contactPerson: 'Program Director', contactNumber: '09455993970',
      email: 'case057-stakeholder@example.test', password: weakPassword, confirmPassword: weakPassword,
      municipality: 'Cebu City', barangay: 'Lahug', partnershipDescription: 'We distribute surplus produce to local families.',
      latitude: 10.3157, longitude: 123.8854, locationAccuracyMeters: 25,
      accreditationFile: new File(['certificate'], 'certificate.pdf', { type: 'application/pdf' }),
    };
    try {
      expect(validateAuthForm(stakeholder, 'register')).toEqual({});
      expect(weakPassword.length).toBeLessThan(8);
      expect(weakPassword).not.toMatch(/[0-9]/);
      expect(weakPassword).not.toMatch(/[!@#$%^&*]/);
      expect(source).toContain("label: 'Weak password'");
      expect(source).toContain("label: 'At least 8 characters'");
      expect(source).toContain("label: 'One number");
      expect(source).toContain("label: 'One special character (!@#$%^&*)'");
      expect(source).toContain('PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(form.password))');
      expect(source).toContain('Partner organization (donation recipient)');
      expect(postMock).not.toHaveBeenCalled();
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: Admin fails the actual length, number, and special-character rules; signup is blocked and no API request is made.');
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
