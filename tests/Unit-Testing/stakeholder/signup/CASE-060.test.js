/** Test Case ID: CASE-060 — Stakeholder Sign Up with Empty Barangay. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../../../src/services/apiClient', () => ({ apiClient: { post: postMock } }));
vi.mock('../../../../src/lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../../../src/services/uploadService', () => ({ uploadAccreditationFile: vi.fn(), uploadGovIdFile: vi.fn() }));
vi.mock('../../../../src/utils/fetchAdminUserLocations', () => ({ fetchAllAdminUserLocations: vi.fn() }));

import { validateAuthForm } from '../../../../src/utils/validators';

describe('CASE-060: Stakeholder Sign Up with Empty Barangay', () => {
  const testCaseId = 'CASE-060';
  const testDescription = 'Stakeholder attempts to register without selecting a Barangay.';
  const expectedResult = 'Registration is prevented and a required Barangay validation message appears.';

  it('rejects an otherwise complete stakeholder registration without Barangay', () => {
    const source = fs.readFileSync(path.resolve('src/utils/validators.js'), 'utf8');
    const values = {
      role: 'stakeholder', organizationName: 'Case Community Cooperative', organizationType: 'Farmer Cooperative',
      organizationDescription: 'A community cooperative supporting local food distribution.', firstName: 'Case',
      lastName: 'Representative', contactPerson: 'Program Director', contactNumber: '09455993970',
      email: 'case060-stakeholder@example.test', password: 'Harvest@123', confirmPassword: 'Harvest@123',
      municipality: 'Cebu City', barangay: '', partnershipDescription: 'We distribute surplus produce to local families.',
      latitude: 10.3157, longitude: 123.8854, locationAccuracyMeters: 25,
      accreditationFile: new File(['certificate'], 'certificate.pdf', { type: 'application/pdf' }),
    };
    try {
      const errors = validateAuthForm(values, 'register');
      expect(errors.barangay).toBe('Enter your barangay.');
      expect(errors).not.toHaveProperty('location');
      expect(errors).not.toHaveProperty('organizationName');
      expect(errors).not.toHaveProperty('contactNumber');
      expect(source).toContain("if (!required(values.barangay)) errors.barangay = 'Enter your barangay.';");
      expect(postMock).not.toHaveBeenCalled();
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual validator rejects the empty Barangay with "Enter your barangay."; no API request is made.');
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
