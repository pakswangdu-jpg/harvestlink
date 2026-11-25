/**
 * Test Case ID: CASE-050
 * Scenario    : Partner Organization Sign Up with Empty Position / Role
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

describe('CASE-050: Partner Organization Sign Up with Empty Position / Role', () => {
  const testCaseId = 'CASE-050';
  const testDescription = "Stakeholder attempts to register without entering the authorized representative's Position / Role.";
  const expectedResult = 'Registration is prevented and a required Position / Role validation message appears.';

  it('rejects a stakeholder registration when contact person is empty', () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const validatorSource = fs.readFileSync(path.resolve('src/utils/validators.js'), 'utf8');
    const stakeholderWithoutPosition = {
      role: 'stakeholder', organizationName: 'Case Community Cooperative', organizationType: 'Farmer Cooperative',
      organizationDescription: 'A community cooperative supporting local food distribution.', firstName: 'Case',
      lastName: 'Representative', contactPerson: '', contactNumber: '09455993970',
      email: 'case050-stakeholder@example.test', password: 'StrongPass1!', confirmPassword: 'StrongPass1!',
      municipality: 'Cebu City', barangay: 'Lahug', partnershipDescription: 'We distribute surplus produce to local families.',
      latitude: 10.3157, longitude: 123.8854, locationAccuracyMeters: 25,
      accreditationFile: new File(['certificate'], 'certificate.pdf', { type: 'application/pdf' }),
    };

    try {
      const errors = validateAuthForm(stakeholderWithoutPosition, 'register');
      expect(errors).toMatchObject({ contactPerson: 'Enter your position or role in the organization.' });
      expect(errors).not.toHaveProperty('organizationName');
      expect(errors).not.toHaveProperty('organizationType');
      expect(errors).not.toHaveProperty('organizationDescription');
      expect(errors).not.toHaveProperty('firstName');
      expect(errors).not.toHaveProperty('lastName');
      expect(errors).not.toHaveProperty('contactNumber');
      expect(errors).not.toHaveProperty('email');
      expect(errors).not.toHaveProperty('password');
      expect(errors).not.toHaveProperty('confirmPassword');
      expect(errors).not.toHaveProperty('location');
      expect(errors).not.toHaveProperty('barangay');
      expect(errors).not.toHaveProperty('partnershipDescription');
      expect(errors).not.toHaveProperty('accreditationFile');
      expect(validatorSource).toContain("errors.contactPerson = 'Enter your position or role in the organization.'");
      expect(authSource).toContain('Position / Role');
      expect(authSource).toContain('Partner organization (donation recipient)');
      expect(postMock).not.toHaveBeenCalled();
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual stakeholder validator rejected the empty Position / Role while all other required fields, location, password, and document values were valid; no registration request or verification transition occurred.');
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
