/** Test Case ID: CASE-058 — Stakeholder Sign Up with Password Mismatch. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../../../src/services/apiClient', () => ({ apiClient: { post: postMock } }));
vi.mock('../../../../src/lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../../../src/services/uploadService', () => ({ uploadAccreditationFile: vi.fn(), uploadGovIdFile: vi.fn() }));
vi.mock('../../../../src/utils/fetchAdminUserLocations', () => ({ fetchAllAdminUserLocations: vi.fn() }));

import { validateAuthForm } from '../../../../src/utils/validators';

describe('CASE-058: Stakeholder Sign Up with Password Mismatch', () => {
  const testCaseId = 'CASE-058';
  const testDescription = 'Stakeholder attempts to register using different passwords in the Password and Confirm Password fields.';
  const expectedResult = 'Registration is prevented and a password mismatch validation message appears.';

  it('rejects two individually strong but different passwords', () => {
    const source = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const values = {
      role: 'stakeholder', organizationName: 'Case Community Cooperative', organizationType: 'Farmer Cooperative',
      organizationDescription: 'A community cooperative supporting local food distribution.', firstName: 'Case',
      lastName: 'Representative', contactPerson: 'Program Director', contactNumber: '09455993970',
      email: 'case058-stakeholder@example.test', password: 'Harvest@123', confirmPassword: 'Harvest@456',
      municipality: 'Cebu City', barangay: 'Lahug', latitude: 10.3157, longitude: 123.8854,
      locationAccuracyMeters: 25, accreditationFile: new File(['certificate'], 'certificate.pdf', { type: 'application/pdf' }),
    };
    try {
      const errors = validateAuthForm(values, 'register');
      expect(values.password).toMatch(/^.{8,}$/);
      expect(values.password).toMatch(/[A-Z]/);
      expect(values.password).toMatch(/[a-z]/);
      expect(values.password).toMatch(/[0-9]/);
      expect(values.password).toMatch(/[!@#$%^&*]/);
      expect(values.confirmPassword).toMatch(/^.{8,}$/);
      expect(values.confirmPassword).toMatch(/[A-Z]/);
      expect(values.confirmPassword).toMatch(/[a-z]/);
      expect(values.confirmPassword).toMatch(/[0-9]/);
      expect(values.confirmPassword).toMatch(/[!@#$%^&*]/);
      expect(errors.confirmPassword).toBe('Passwords do not match.');
      expect(source).toContain('PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(form.password))');
      expect(source).toContain('Partner organization (donation recipient)');
      expect(postMock).not.toHaveBeenCalled();
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: Both passwords satisfy the strength rules, but the actual validator rejects their mismatch; no API request is made.');
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
