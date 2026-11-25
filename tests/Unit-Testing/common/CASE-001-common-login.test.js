import { beforeEach, describe, expect, it, vi } from 'vitest';

const { setSessionMock, signOutMock, apiPostMock, apiGetMock } = vi.hoisted(() => ({
  setSessionMock: vi.fn(),
  signOutMock: vi.fn(),
  apiPostMock: vi.fn(),
  apiGetMock: vi.fn(),
}));

vi.mock('../../../src/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      setSession: setSessionMock,
      signOut: signOutMock,
    },
  },
}));

vi.mock('../../../src/services/apiClient', () => ({
  apiClient: {
    post: apiPostMock,
    get: apiGetMock,
  },
}));

vi.mock('../../../src/services/uploadService', () => ({
  uploadAccreditationFile: vi.fn(),
  uploadGovIdFile: vi.fn(),
}));

vi.mock('../../../src/utils/fetchAdminUserLocations', () => ({
  fetchAllAdminUserLocations: vi.fn(),
}));

import { loginUser } from '../../../src/services/authService';
import { hasErrors, validateAuthForm } from '../../../src/utils/validators';

describe('CASE-001: Valid Login Authentication', () => {
  const testCaseId = 'CASE-001';
  const testDescription = 'User enters valid login credentials.';
  const expectedResult = 'Login authentication succeeds.';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('authenticates a user with valid credentials and returns their profile', async () => {
    const credentials = {
      email: 'user@harvestlink.dev',
      password: 'ValidPassword1!',
    };
    const captchaToken = 'verified-captcha-token';

    apiPostMock.mockResolvedValue({
      session: {
        access_token: 'valid-access-token',
        refresh_token: 'valid-refresh-token',
      },
    });
    setSessionMock.mockResolvedValue({
      data: { session: { user: { id: 'user-001' } } },
      error: null,
    });
    apiGetMock.mockResolvedValue({
      id: 'user-001',
      role: 'farmer',
      accountStatus: 'active',
    });

    try {
      const validationErrors = validateAuthForm(credentials, 'login');
      expect(hasErrors(validationErrors)).toBe(false);

      const profile = await loginUser(credentials.email, credentials.password, captchaToken);

      expect(apiPostMock).toHaveBeenCalledWith('/auth/login', {
        email: 'user@harvestlink.dev',
        password: 'ValidPassword1!',
        captchaToken,
      });
      expect(setSessionMock).toHaveBeenCalledWith({
        access_token: 'valid-access-token',
        refresh_token: 'valid-refresh-token',
      });
      expect(apiGetMock).toHaveBeenCalledWith('/profiles/me');
      expect(profile).toMatchObject({
        id: 'user-001',
        role: 'farmer',
        accountStatus: 'active',
      });

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: Authentication succeeded.');
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
