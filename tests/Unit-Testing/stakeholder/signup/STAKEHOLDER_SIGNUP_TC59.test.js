/** Test Case ID: CASE-059 — Stakeholder Sign Up Without Capturing GPS Location. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../../../src/services/apiClient', () => ({ apiClient: { post: postMock } }));
vi.mock('../../../../src/lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../../../src/services/uploadService', () => ({ uploadAccreditationFile: vi.fn(), uploadGovIdFile: vi.fn() }));
vi.mock('../../../../src/utils/fetchAdminUserLocations', () => ({ fetchAllAdminUserLocations: vi.fn() }));

import { validateAuthForm } from '../../../../src/utils/validators';

describe('CASE-059: Stakeholder Sign Up Without Capturing GPS Location', () => {
  const testCaseId = 'CASE-059';
  const testDescription = 'Stakeholder attempts to register without capturing GPS location.';
  const expectedResult = 'Registration is prevented and the system requires GPS location capture.';

  it('rejects an otherwise complete stakeholder registration without coordinates', () => {
    const source = fs.readFileSync(path.resolve('src/utils/validators.js'), 'utf8');
    const values = {
      role: 'stakeholder', organizationName: 'Case Community Cooperative', organizationType: 'Farmer Cooperative',
      organizationDescription: 'A community cooperative supporting local food distribution.', firstName: 'Case',
      lastName: 'Representative', contactPerson: 'Program Director', contactNumber: '09455993970',
      email: 'case059-stakeholder@example.test', password: 'Harvest@123', confirmPassword: 'Harvest@123',
      municipality: 'Cebu City', barangay: 'Lahug', partnershipDescription: 'We distribute surplus produce to local families.',
      latitude: null, longitude: null, locationAccuracyMeters: null,
      accreditationFile: new File(['certificate'], 'certificate.pdf', { type: 'application/pdf' }),
    };
    try {
      const errors = validateAuthForm(values, 'register');
      expect(errors.location).toBe('Capture your current GPS location to register.');
      expect(errors).not.toHaveProperty('organizationName');
      expect(errors).not.toHaveProperty('organizationDescription');
      expect(errors).not.toHaveProperty('contactNumber');
      expect(source).toContain("errors.location = 'Capture your current GPS location to register.'");
      expect(source).toContain('hasAcceptableRegistrationLocation(values)');
      expect(postMock).not.toHaveBeenCalled();
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual validator rejects the missing GPS coordinates with the required location message; no API request is made.');
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
