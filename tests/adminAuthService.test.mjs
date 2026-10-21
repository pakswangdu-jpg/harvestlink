import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../src/services/adminAuthService.js', import.meta.url), 'utf8');

async function compileAuthService({
  loginResult = { session: { access_token: 'admin-access-token', refresh_token: 'admin-refresh-token' } },
  loginError = null,
  adminAccessResult = { allowed: true },
  adminAccessError = null,
  profileResult = { id: 'admin-1', role: 'admin', accountStatus: 'active' },
  profileError = null,
  setSessionResult = { data: { session: { user: { id: 'admin-1' } } }, error: null },
} = {}) {
  const events = [];
  const sharedSupabase = {
    auth: {
      async setSession(session) {
        events.push({ type: 'setSession', session });
        return setSessionResult;
      },
      async signOut(options) {
        events.push({ type: 'signOut', options });
        return { error: null };
      },
    },
  };
  const apiClientMock = {
    async post(path, body) {
      events.push({ type: 'apiPost', path, body });
      if (loginError) throw loginError;
      return loginResult;
    },
    async get(path, options) {
      events.push({ type: 'apiGet', path, options });
      if (path === '/auth/admin-access') {
        if (adminAccessError) throw adminAccessError;
        return adminAccessResult;
      }
      if (path === '/profiles/me') {
        if (profileError) throw profileError;
        return profileResult;
      }
      throw new Error(`Unexpected path ${path}`);
    },
  };
  const context = vm.createContext({ Error });
  const module = new vm.SourceTextModule(source, { context });
  await module.link((specifier) => {
    if (specifier === '../lib/supabaseClient') {
      return new vm.SyntheticModule(['supabase'], function () {
        this.setExport('supabase', sharedSupabase);
      }, { context });
    }
    if (specifier === './apiClient') {
      return new vm.SyntheticModule(['apiClient'], function () {
        this.setExport('apiClient', apiClientMock);
      }, { context });
    }
    throw new Error(`Unexpected specifier ${specifier}`);
  });
  await module.evaluate();
  return { loginAdmin: module.namespace.loginAdmin, events };
}

test('Admin login verifies through the backend before storing and authorizing its Supabase session', async () => {
  const { loginAdmin, events } = await compileAuthService();
  const profile = await loginAdmin('  Admin@HarvestLink.Dev  ', 'Secret123!', 'captcha-token');
  assert.equal(profile.id, 'admin-1');
  assert.equal(profile.role, 'admin');
  assert.deepEqual(JSON.parse(JSON.stringify(events)), [
    {
      type: 'apiPost',
      path: '/auth/admin-login',
      body: { email: 'admin@harvestlink.dev', password: 'Secret123!', captchaToken: 'captcha-token' },
    },
    {
      type: 'setSession',
      session: { access_token: 'admin-access-token', refresh_token: 'admin-refresh-token' },
    },
    { type: 'apiGet', path: '/auth/admin-access', options: { accessToken: 'admin-access-token' } },
    { type: 'apiGet', path: '/profiles/me', options: { accessToken: 'admin-access-token' } },
  ]);
});

test('backend CAPTCHA/network/credential errors do not create a browser session', async () => {
  for (const loginError of [
    Object.assign(new Error('Security verification failed. Please try again.'), { status: 400, code: 'CAPTCHA_FAILED' }),
    Object.assign(new Error('Admin access is not allowed from this network.'), { status: 403, code: 'ADMIN_NETWORK_NOT_ALLOWED' }),
    Object.assign(new Error('Invalid email or password.'), { status: 401, code: 'INVALID_CREDENTIALS' }),
  ]) {
    const { loginAdmin, events } = await compileAuthService({ loginError });
    await assert.rejects(loginAdmin('admin@example.test', 'Pass123!', 'captcha-token'));
    assert.ok(!events.some((event) => event.type === 'setSession'));
  }
});

test('invalid roles or failed post-login checks clear the adopted session', async () => {
  const cases = [
    { profileResult: { id: 'buyer-1', role: 'buyer', accountStatus: 'active' } },
    { profileResult: { id: 'admin-1', role: 'admin', accountStatus: 'suspended' } },
    { adminAccessResult: { allowed: false } },
    { adminAccessError: new Error('Offline') },
    { profileError: new Error('Profile unavailable') },
  ];
  for (const options of cases) {
    const { loginAdmin, events } = await compileAuthService(options);
    await assert.rejects(loginAdmin('admin@example.test', 'Pass123!', 'captcha-token'));
    assert.ok(events.some((event) => event.type === 'signOut' && event.options.scope === 'local'));
  }
});

test('incomplete session responses and failed session adoption are rejected', async () => {
  const cases = [
    { loginResult: null },
    { loginResult: { session: { access_token: 'token' } } },
    { setSessionResult: { data: null, error: new Error('Session failed') } },
  ];
  for (const options of cases) {
    const { loginAdmin, events } = await compileAuthService(options);
    await assert.rejects(loginAdmin('admin@example.test', 'Pass123!', 'captcha-token'));
    assert.ok(!events.some((event) => event.type === 'apiGet'));
  }
});
