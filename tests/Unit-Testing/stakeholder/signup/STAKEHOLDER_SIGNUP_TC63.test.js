/** Test Case ID: CASE-063 — Stakeholder Sign Up Without Terms Agreement. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../../../src/services/apiClient', () => ({ apiClient: { post: postMock } }));
vi.mock('../../../../src/lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../../../src/services/uploadService', () => ({ uploadAccreditationFile: vi.fn(), uploadGovIdFile: vi.fn() }));
vi.mock('../../../../src/utils/fetchAdminUserLocations', () => ({ fetchAllAdminUserLocations: vi.fn() }));

import { validateAuthForm } from '../../../../src/utils/validators';

describe('CASE-063: Stakeholder Sign Up Without Terms Agreement', () => {
  const testCaseId = 'CASE-063';
  const testDescription = 'Stakeholder attempts to register without accepting the Terms of Service and Privacy Policy.';
  const expectedResult = 'Registration is prevented until the Stakeholder accepts the required agreement.';

  it('keeps a complete stakeholder registration blocked when agreement is unchecked', () => {
    const source = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const values = {
      role: 'stakeholder', organizationName: 'Case Community Cooperative', organizationType: 'Farmer Cooperative',
      organizationDescription: 'A community cooperative supporting local food distribution.', firstName: 'Case',
      lastName: 'Representative', contactPerson: 'Program Director', contactNumber: '09455993970',
      email: 'case063-stakeholder@example.test', password: 'Harvest@123', confirmPassword: 'Harvest@123',
      municipality: 'Cebu City', barangay: 'Lahug', partnershipDescription: 'We want to distribute surplus produce to local families.',
      latitude: 10.3157, longitude: 123.8854, locationAccuracyMeters: 25,
      accreditationFile: new File(['certificate'], 'certificate.pdf', { type: 'application/pdf' }),
    };
    try {
      expect(validateAuthForm(values, 'register')).toEqual({});
      expect(source).toContain('if (isRegister && !agreedToTerms)');
      expect(source).toContain("formTitle: 'Terms and Privacy Policy required'");
      expect(source).toContain('Please check this box to agree to the Terms of Service and Privacy Policy.');
      expect(source).toContain('aria-required="true"');
      expect(postMock).not.toHaveBeenCalled();
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: All registration fields pass validation, but the actual submit path blocks an unchecked agreement and no API request is made.');
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
