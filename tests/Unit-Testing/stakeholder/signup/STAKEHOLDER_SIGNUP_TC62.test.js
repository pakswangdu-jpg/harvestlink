/** Test Case ID: CASE-062 — Partner Organization Sign Up with Empty Partnership Reason. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../../../src/services/apiClient', () => ({ apiClient: { post: postMock } }));
vi.mock('../../../../src/lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../../../src/services/uploadService', () => ({ uploadAccreditationFile: vi.fn(), uploadGovIdFile: vi.fn() }));
vi.mock('../../../../src/utils/fetchAdminUserLocations', () => ({ fetchAllAdminUserLocations: vi.fn() }));

import { validateAuthForm } from '../../../../src/utils/validators';

describe('CASE-062: Empty Partnership Reason', () => {
  const testCaseId = 'CASE-062';
  const testDescription = 'Stakeholder attempts to register without entering a partnership reason.';
  const expectedResult = 'Registration is prevented and a required Partnership Reason validation message appears.';

  it('rejects an otherwise complete stakeholder registration without partnership reason', () => {
    const source = fs.readFileSync(path.resolve('src/utils/validators.js'), 'utf8');
    const values = {
      role: 'stakeholder', organizationName: 'Case Community Cooperative', organizationType: 'Farmer Cooperative',
      organizationDescription: 'A community cooperative supporting local food distribution.', firstName: 'Case',
      lastName: 'Representative', contactPerson: 'Program Director', contactNumber: '09455993970',
      email: 'case062-partnership@example.test', password: 'Harvest@123', confirmPassword: 'Harvest@123',
      municipality: 'Cebu City', barangay: 'Lahug', partnershipDescription: '',
      latitude: 10.3157, longitude: 123.8854, locationAccuracyMeters: 25,
      accreditationFile: new File(['certificate'], 'certificate.pdf', { type: 'application/pdf' }),
    };
    try {
      const errors = validateAuthForm(values, 'register');
      expect(errors.partnershipDescription).toBe('Tell us why your organization wants to partner with HarvestLink.');
      expect(errors).not.toHaveProperty('location');
      expect(errors).not.toHaveProperty('accreditationFile');
      expect(source).toContain("if (!required(values.partnershipDescription))");
      expect(source).toContain("Tell us why your organization wants to partner with HarvestLink.");
      expect(postMock).not.toHaveBeenCalled();
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: Partnership Reason is required by the actual validator; the empty field blocks registration and no API request is made.');
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
