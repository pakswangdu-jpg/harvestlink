/** Test Case ID: CASE-061 — Stakeholder Sign Up Without Verification Document. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../../../src/services/apiClient', () => ({ apiClient: { post: postMock } }));
vi.mock('../../../../src/lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../../../src/services/uploadService', () => ({ uploadAccreditationFile: vi.fn(), uploadGovIdFile: vi.fn() }));
vi.mock('../../../../src/utils/fetchAdminUserLocations', () => ({ fetchAllAdminUserLocations: vi.fn() }));

import { validateAuthForm } from '../../../../src/utils/validators';

describe('CASE-061: Stakeholder Sign Up Without Verification Document', () => {
  const testCaseId = 'CASE-061';
  const testDescription = 'Stakeholder attempts to register without uploading a verification document.';
  const expectedResult = 'Registration is prevented and a required verification document validation message appears.';

  it('rejects an otherwise complete stakeholder registration without a document', () => {
    const source = fs.readFileSync(path.resolve('src/utils/validators.js'), 'utf8');
    const values = {
      role: 'stakeholder', organizationName: 'Case Community Cooperative', organizationType: 'Farmer Cooperative',
      organizationDescription: 'A community cooperative supporting local food distribution.', firstName: 'Case',
      lastName: 'Representative', contactPerson: 'Program Director', contactNumber: '09455993970',
      email: 'case061-stakeholder@example.test', password: 'Harvest@123', confirmPassword: 'Harvest@123',
      municipality: 'Cebu City', barangay: 'Lahug', partnershipDescription: 'We distribute surplus produce to local families.',
      latitude: 10.3157, longitude: 123.8854, locationAccuracyMeters: 25, accreditationFile: null,
    };
    try {
      const errors = validateAuthForm(values, 'register');
      expect(errors.accreditationFile).toBe('Upload a verification document to continue.');
      expect(errors).not.toHaveProperty('location');
      expect(errors).not.toHaveProperty('barangay');
      expect(errors).not.toHaveProperty('contactNumber');
      expect(source).toContain("errors.accreditationFile = 'Upload a verification document to continue.';");
      expect(source).toContain('values.accreditationFile instanceof File');
      expect(postMock).not.toHaveBeenCalled();
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual validator requires a verification document and blocks registration; no API request is made.');
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
