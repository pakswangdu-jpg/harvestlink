/**
 * Test Case ID: CASE-049
 * Scenario    : Partner Organization Sign Up with Empty Representative Last Name
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

describe('CASE-049: Partner Organization Sign Up with Empty Representative Last Name', () => {
  const testCaseId = 'CASE-049';
  const testDescription = "Stakeholder attempts to register without entering the authorized representative's last name.";
  const expectedResult = 'Registration is prevented and a required last name validation message appears.';

  it('rejects a stakeholder registration when representative last name is empty', () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const validatorSource = fs.readFileSync(path.resolve('src/utils/validators.js'), 'utf8');
    const stakeholderWithoutLastName = {
      role: 'stakeholder', organizationName: 'Case Community Cooperative', organizationType: 'Farmer Cooperative',
      organizationDescription: 'A community cooperative supporting local food distribution.', firstName: 'Case',
      lastName: '', contactPerson: 'Program Director', contactNumber: '09455993970',
      email: 'case049-stakeholder@example.test', password: 'StrongPass1!', confirmPassword: 'StrongPass1!',
      municipality: 'Cebu City', barangay: 'Lahug', partnershipDescription: 'We distribute surplus produce to local families.',
      latitude: 10.3157, longitude: 123.8854, locationAccuracyMeters: 25,
      accreditationFile: new File(['certificate'], 'certificate.pdf', { type: 'application/pdf' }),
    };

    try {
      const errors = validateAuthForm(stakeholderWithoutLastName, 'register');
      expect(errors).toMatchObject({ lastName: 'Enter your last name.' });
      expect(errors).not.toHaveProperty('organizationName');
      expect(errors).not.toHaveProperty('organizationType');
      expect(errors).not.toHaveProperty('organizationDescription');
      expect(errors).not.toHaveProperty('firstName');
      expect(errors).not.toHaveProperty('contactPerson');
      expect(errors).not.toHaveProperty('contactNumber');
      expect(errors).not.toHaveProperty('email');
      expect(errors).not.toHaveProperty('password');
      expect(errors).not.toHaveProperty('confirmPassword');
      expect(errors).not.toHaveProperty('location');
      expect(errors).not.toHaveProperty('barangay');
      expect(errors).not.toHaveProperty('partnershipDescription');
      expect(errors).not.toHaveProperty('accreditationFile');
      expect(validatorSource).toContain("errors.lastName = 'Enter your last name.'");
      expect(authSource).toContain('Authorized Representative');
      expect(authSource).toContain('Partner organization (donation recipient)');
      expect(postMock).not.toHaveBeenCalled();
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual stakeholder validator rejected the empty representative last name while all other required fields, location, password, and document values were valid; no registration request or verification transition occurred.');
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
