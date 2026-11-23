/**
 * Test Case ID: CASE-052
 * Scenario    : Partner Organization Sign Up with Valid Contact Number
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
import { isValidPhilippineMobile } from '../../../../src/utils/philippineMobile';

describe('CASE-052: Partner Organization Sign Up with Valid Contact Number', () => {
  const testCaseId = 'CASE-052';
  const testDescription = 'Stakeholder enters a valid Philippine contact number during registration.';
  const expectedResult = 'The system accepts the valid contact number without displaying validation errors.';
  const validContactNumber = '09455993970';

  it('accepts a valid stakeholder Philippine contact number', () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const stakeholder = {
      role: 'stakeholder', organizationName: 'Case Community Cooperative', organizationType: 'Farmer Cooperative',
      organizationDescription: 'A community cooperative supporting local food distribution.', firstName: 'Case',
      lastName: 'Representative', contactPerson: 'Program Director', contactNumber: validContactNumber,
      email: 'case052-stakeholder@example.test', password: 'StrongPass1!', confirmPassword: 'StrongPass1!',
      municipality: 'Cebu City', barangay: 'Lahug', partnershipDescription: 'We distribute surplus produce to local families.',
      latitude: 10.3157, longitude: 123.8854, locationAccuracyMeters: 25,
      accreditationFile: new File(['certificate'], 'certificate.pdf', { type: 'application/pdf' }),
    };

    try {
      const errors = validateAuthForm(stakeholder, 'register');
      expect(isValidPhilippineMobile(validContactNumber)).toBe(true);
      expect(errors).not.toHaveProperty('contactNumber');
      expect(errors).not.toHaveProperty('organizationName');
      expect(errors).not.toHaveProperty('organizationType');
      expect(errors).not.toHaveProperty('organizationDescription');
      expect(errors).not.toHaveProperty('firstName');
      expect(errors).not.toHaveProperty('lastName');
      expect(errors).not.toHaveProperty('contactPerson');
      expect(errors).not.toHaveProperty('email');
      expect(errors).not.toHaveProperty('password');
      expect(errors).not.toHaveProperty('confirmPassword');
      expect(errors).not.toHaveProperty('location');
      expect(errors).not.toHaveProperty('barangay');
      expect(errors).not.toHaveProperty('partnershipDescription');
      expect(errors).not.toHaveProperty('accreditationFile');
      expect(authSource).toContain('Valid Philippine mobile number');
      expect(authSource).toContain('Authorized Representative');
      expect(authSource).toContain('Partner organization (donation recipient)');
      expect(postMock).not.toHaveBeenCalled();
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual stakeholder validator accepted 09455993970 with no contact-number error; no registration request was made.');
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
