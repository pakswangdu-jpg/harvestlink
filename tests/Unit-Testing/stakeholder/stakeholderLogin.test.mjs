import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  createLoginUserHarness,
  getAuthDestination,
  hasErrors,
  validateAuthForm,
} from '../helpers/loginTestHarness.mjs';

describe('Stakeholder Login Unit Tests', () => {
  test('valid stakeholder credentials pass validation, authenticate, and route to /stakeholder-dashboard', async () => {
    const errors = validateAuthForm({ email: 'partner@harvestlink.dev', password: 'Password1!' }, 'login');
    assert.equal(hasErrors(errors), false);

    const { loginUser, events } = await createLoginUserHarness({
      profileResponse: { id: 'stakeholder-1', role: 'stakeholder', accountStatus: 'active' },
      setSessionResult: { data: { session: { user: { id: 'stakeholder-1' } } }, error: null },
    });

    const profile = await loginUser('  Partner@HarvestLink.Dev  ', 'Password1!', 'captcha-token');
    assert.equal(profile.role, 'stakeholder');
    assert.equal(getAuthDestination(profile.role), '/stakeholder-dashboard');
    assert.equal(events[0].path, '/auth/login');
    assert.equal(events[0].body.email, 'partner@harvestlink.dev');
    assert.ok(events.some((event) => event.type === 'setSession'));
  });

  test('invalid stakeholder email format is rejected by login form validation', () => {
    const errors = validateAuthForm({ email: 'not-an-email', password: 'Password1!' }, 'login');
    assert.equal(hasErrors(errors), true);
    assert.equal(errors.email, 'Enter a valid email address.');
  });

  test('empty email and empty password are rejected by login form validation', () => {
    const emptyEmail = validateAuthForm({ email: '', password: 'Password1!' }, 'login');
    assert.equal(emptyEmail.email, 'Enter your email address.');
    assert.equal(emptyEmail.password, undefined);

    const emptyPassword = validateAuthForm({ email: 'partner@harvestlink.dev', password: '' }, 'login');
    assert.equal(emptyPassword.email, undefined);
    assert.equal(emptyPassword.password, 'Enter your password.');
  });

  test('wrong stakeholder password is rejected without storing a browser session', async () => {
    const wrongPasswordError = Object.assign(new Error('Invalid email or password.'), {
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
    const { loginUser, events } = await createLoginUserHarness({ loginError: wrongPasswordError });

    await assert.rejects(
      loginUser('partner@harvestlink.dev', 'WrongPass!', 'captcha-token'),
      (error) => error.code === 'INVALID_CREDENTIALS' && error.status === 401,
    );
    assert.equal(events.some((event) => event.type === 'setSession'), false);
  });
});
