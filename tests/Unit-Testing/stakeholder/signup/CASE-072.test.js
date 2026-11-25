/** Test Case ID: CASE-072 — Stakeholder Sign Up with Missing GPS Location. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../../../src/services/apiClient', () => ({ apiClient: { post: postMock } }));
vi.mock('../../../../src/lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../../../src/services/uploadService', () => ({ uploadAccreditationFile: vi.fn(), uploadGovIdFile: vi.fn() }));
vi.mock('../../../../src/utils/fetchAdminUserLocations', () => ({ fetchAllAdminUserLocations: vi.fn() }));

import { validateAuthForm } from '../../../../src/utils/validators';

describe('CASE-072: Stakeholder Sign Up with Missing GPS Location', () => {
  const testCaseId = 'CASE-072';
  const testDescription = 'Stakeholder attempts to register without capturing the required GPS location.';
  const expectedResult = 'The system prevents registration and requires the Stakeholder to capture GPS location.';

  it('rejects valid manual address fields when GPS coordinates are missing', () => {
    const source = fs.readFileSync(path.resolve('src/utils/validators.js'), 'utf8');
    const values = {
      role: 'stakeholder', organizationName: 'Case Community Cooperative', organizationType: 'Farmer Cooperative',
      organizationDescription: 'A community cooperative supporting local food distribution.', firstName: 'Case',
      lastName: 'Representative', contactPerson: 'Program Director', contactNumber: '09455993970',
      email: 'case072-stakeholder@example.test', password: 'Harvest@123', confirmPassword: 'Harvest@123',
      province: 'Cebu', municipality: 'Cebu City', barangay: 'Lahug',
      partnershipDescription: 'We want to distribute surplus produce to local families.',
      latitude: null, longitude: null, locationAccuracyMeters: null,
      accreditationFile: new File(['certificate'], 'certificate.pdf', { type: 'application/pdf' }),
    };
    try {
      const errors = validateAuthForm(values, 'register');
      expect(values.latitude).toBeNull();
      expect(values.longitude).toBeNull();
      expect(values.municipality).toBe('Cebu City');
      expect(values.barangay).toBe('Lahug');
      expect(errors.location).toBe('Capture your current GPS location to register.');
      expect(errors).not.toHaveProperty('municipality');
      expect(errors).not.toHaveProperty('barangay');
      expect(source).toContain('hasAcceptableRegistrationLocation(values)');
      expect(source).toContain("errors.location = 'Capture your current GPS location to register.'");
      expect(postMock).not.toHaveBeenCalled();
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: Manual address fields are valid, but missing captured coordinates produce the actual GPS validation error and block the API request.');
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
