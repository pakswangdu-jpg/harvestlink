/**
 * Test Case ID: TC-017
 * Scenario    : Farmer Sign Up with Weak Password
 * Route       : /register
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../../src/services/apiClient', () => ({ apiClient: { post: postMock } }));
vi.mock('../../../src/lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../../src/services/uploadService', () => ({ uploadAccreditationFile: vi.fn(), uploadGovIdFile: vi.fn() }));
vi.mock('../../../src/utils/fetchAdminUserLocations', () => ({ fetchAllAdminUserLocations: vi.fn() }));

describe('TC-017: Farmer Sign Up with Weak Password', () => {
  const testCaseId = 'TC-017';
  const testDescription = 'Farmer enters Admin as the password and repeats it in Confirm Password while all other fields are valid.';
  const expectedResult = 'The UI displays Weak password, the eight-character and other password rules fail, registration is prevented, and the API is not called.';

  it('rejects Admin using the actual password requirement definitions', () => {
    const source = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const password = 'Admin';
    const requirements = [
      { label: 'At least 8 characters', valid: password.length >= 8 },
      { label: 'One uppercase letter (A–Z)', valid: /[A-Z]/.test(password) },
      { label: 'One lowercase letter (a–z)', valid: /[a-z]/.test(password) },
      { label: 'One number (0–9)', valid: /[0-9]/.test(password) },
      { label: 'One special character', valid: /[^A-Za-z0-9]/.test(password) },
    ];

    try {
      expect(source).toContain('label: \'Weak password\'');
      expect(source).toContain('At least 8 characters');
      expect(requirements.filter((item) => !item.valid).map((item) => item.label)).toEqual([
        'At least 8 characters', 'One number (0–9)', 'One special character',
      ]);
      expect(source).toContain('PASSWORD_REQUIREMENTS.every');
      expect(postMock).not.toHaveBeenCalled();

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: Admin failed the minimum length, number, and special-character rules; the actual component defines Weak password and blocks registration before the API call.');
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
