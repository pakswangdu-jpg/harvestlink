/** Test Case ID: CASE-064 — Stakeholder Sign Up with Valid Registration Details. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../../../src/services/apiClient', () => ({ apiClient: { post: postMock } }));
vi.mock('../../../../src/lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../../../src/services/uploadService', () => ({ uploadAccreditationFile: vi.fn(), uploadGovIdFile: vi.fn() }));
vi.mock('../../../../src/utils/fetchAdminUserLocations', () => ({ fetchAllAdminUserLocations: vi.fn() }));

import { validateAuthForm } from '../../../../src/utils/validators';

describe('CASE-064: Stakeholder Sign Up with Valid Registration Details', () => {
  const testCaseId = 'CASE-064';
  const testDescription = 'Stakeholder enters complete and valid registration information.';
  const expectedResult = 'All required Stakeholder registration fields are accepted without validation errors.';

  it('accepts complete stakeholder registration details without submitting', () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const validatorSource = fs.readFileSync(path.resolve('src/utils/validators.js'), 'utf8');
    const values = {
      role: 'stakeholder', organizationName: 'Case Community Cooperative', organizationType: 'Farmer Cooperative',
      organizationDescription: 'A community cooperative supporting local food distribution.', firstName: 'Case',
      lastName: 'Representative', contactPerson: 'Program Director', contactNumber: '09455993970',
      email: 'case064-new-stakeholder@example.test', password: 'Harvest@123', confirmPassword: 'Harvest@123',
      municipality: 'Cebu City', barangay: 'Lahug', partnershipDescription: 'We want to distribute surplus produce to local families.',
      latitude: 10.3157, longitude: 123.8854, locationAccuracyMeters: 25,
      accreditationFile: new File(['certificate'], 'certificate.pdf', { type: 'application/pdf' }),
    };
    try {
      expect(validateAuthForm(values, 'register')).toEqual({});
      expect(values.email).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
      expect(values.contactNumber).toMatch(/^09\d{9}$/);
      expect(values.password).toMatch(/^.{8,}$/);
      expect(values.password).toMatch(/[A-Z]/);
      expect(values.password).toMatch(/[a-z]/);
      expect(values.password).toMatch(/[0-9]/);
      expect(values.password).toMatch(/[!@#$%^&*]/);
      expect(values.password).toBe(values.confirmPassword);
      expect(values.accreditationFile).toBeInstanceOf(File);
      expect(authSource).toContain('Partner organization (donation recipient)');
      expect(validatorSource).toContain('values.accreditationFile instanceof File');
      expect(validatorSource).toContain('values.partnershipDescription');
      expect(postMock).not.toHaveBeenCalled();
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: All actual registration validation rules pass and the registration API was not called.');
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
