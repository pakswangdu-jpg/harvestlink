import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../src/services/adminAuthService.js', import.meta.url), 'utf8');

async function compileAuthService({
  signInResult = null,
  signInError = null,
  adminAccessResult = { allowed: true },
  adminAccessError = null,
  profileResult = { id: 'admin-1', role: 'admin', accountStatus: 'active' },
  profileError = null,
  setSessionResult = { data: { session: { user: { id: 'admin-1' } } }, error: null },
} = {}) {
  const events = [];
  const clientAuth = {
    async signInWithPassword({ email, password }) {
      events.push({ type: 'signInWithPassword', email, password });
      if (signInError) throw signInError;
      return signInResult || {
        data: {
          session: {
            access_token: 'admin-access-token',
            refresh_token: 'admin-refresh-token',
            user: { id: 'admin-1' },
          },
        },
        error: null,
      };
    },
    async signOut(options) {
      events.push({ type: 'signOut', options });
    },
    async dispose() {
      events.push({ type: 'dispose' });
    },
  };

  const sharedSupabase = {
    auth: {
      async setSession(tokens) {
        events.push({ type: 'setSession', tokens });
        return setSessionResult;
      },
    },
  };

  const apiClientMock = {
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

  const context = vm.createContext({
    Error,
  });

  const module = new vm.SourceTextModule(source, { context });
  await module.link((specifier) => {
    if (specifier === '../lib/supabaseClient') {
      return new vm.SyntheticModule(['createAdminLoginClient', 'supabase'], function () {
        this.setExport('createAdminLoginClient', () => ({ auth: clientAuth }));
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

test('active admin signs in, authorizes network and profile, and stores session', async () => {
  const { loginAdmin, events } = await compileAuthService();
  const profile = await loginAdmin('  Admin@HarvestLink.Dev  ', 'Secret123!');
  assert.equal(profile.id, 'admin-1');
  assert.equal(profile.role, 'admin');

  const serialized = JSON.parse(JSON.stringify(events));
  assert.deepEqual(serialized[0], { type: 'signInWithPassword', email: 'admin@harvestlink.dev', password: 'Secret123!' });
  assert.deepEqual(serialized[1], { type: 'apiGet', path: '/auth/admin-access', options: { accessToken: 'admin-access-token' } });
  assert.deepEqual(serialized[2], { type: 'apiGet', path: '/profiles/me', options: { accessToken: 'admin-access-token' } });
  assert.deepEqual(serialized[3], { type: 'setSession', tokens: { access_token: 'admin-access-token', refresh_token: 'admin-refresh-token' } });
  assert.deepEqual(serialized[4], { type: 'dispose' });
});

test('invalid credentials throw friendly error and clean up client', async () => {
  const { loginAdmin, events } = await compileAuthService({
    signInResult: { data: null, error: { message: 'Invalid credentials' } },
  });
  await assert.rejects(
    () => loginAdmin('admin@harvestlink.dev', 'WrongPass'),
    /Invalid admin email or password\./,
  );
  assert.ok(events.some(e => e.type === 'dispose'));
  assert.ok(!events.some(e => e.type === 'setSession'));
});

test('non-admin roles (buyer, farmer, stakeholder) are rejected and temporary session is revoked', async () => {
  for (const role of ['buyer', 'farmer', 'stakeholder']) {
    const { loginAdmin, events } = await compileAuthService({
      profileResult: { id: 'user-1', role, accountStatus: 'active' },
      signInResult: {
        data: {
          session: {
            access_token: 'token',
            refresh_token: 'refresh',
            user: { id: 'user-1' },
          },
        },
      },
    });

    await assert.rejects(
      () => loginAdmin('user@harvestlink.dev', 'Pass123!'),
      /Admin sign-in is restricted to active administrator accounts\./,
    );

    assert.ok(events.some(e => e.type === 'signOut' && e.options?.scope === 'local'));
    assert.ok(events.some(e => e.type === 'dispose'));
    assert.ok(!events.some(e => e.type === 'setSession'), 'Never save non-admin session into persistent storage');
  }
});

test('suspended admin account is rejected and temporary session is revoked', async () => {
  const { loginAdmin, events } = await compileAuthService({
    profileResult: { id: 'admin-1', role: 'admin', accountStatus: 'suspended' },
  });

  await assert.rejects(
    () => loginAdmin('admin@harvestlink.dev', 'Pass123!'),
    /Admin sign-in is restricted to active administrator accounts\./,
  );

  assert.ok(events.some(e => e.type === 'signOut'));
  assert.ok(events.some(e => e.type === 'dispose'));
  assert.ok(!events.some(e => e.type === 'setSession'));
});

test('disallowed network preserves ADMIN_NETWORK_NOT_ALLOWED error code and revokes temporary session', async () => {
  const networkError = new Error('Admin access is not allowed from this network.');
  networkError.status = 403;
  networkError.code = 'ADMIN_NETWORK_NOT_ALLOWED';

  const { loginAdmin, events } = await compileAuthService({ adminAccessError: networkError });

  await assert.rejects(
    () => loginAdmin('admin@harvestlink.dev', 'Pass123!'),
    (err) => err.code === 'ADMIN_NETWORK_NOT_ALLOWED',
  );

  assert.ok(events.some(e => e.type === 'signOut'));
  assert.ok(events.some(e => e.type === 'dispose'));
  assert.ok(!events.some(e => e.type === 'setSession'));
});

test('server role denial stops sign-in before fetching or storing a profile', async () => {
  const denial = Object.assign(new Error('Forbidden'), { status: 403 });
  const { loginAdmin, events } = await compileAuthService({ adminAccessError: denial });
  await assert.rejects(loginAdmin('buyer@example.test', 'Pass123!'), /restricted to active administrator accounts/);
  assert.ok(!events.some(e => e.type === 'setSession' || e.path === '/profiles/me'));
  assert.equal(events.find(e => e.type === 'signOut').options.scope, 'local');
});

test('malformed, offline and failed access checks cannot become a saved login', async () => {
  const cases = [
    { adminAccessResult: null },
    { adminAccessResult: { allowed: false } },
    { adminAccessResult: { allowed: 'true' } },
    { adminAccessError: new Error('Offline') },
    { profileError: new Error('Profile unavailable') },
    { profileResult: null },
    { profileResult: { id: 'another-admin', role: 'admin', accountStatus: 'active' } },
    { profileResult: { id: 'admin-1', role: 'admin' } },
  ];
  for (const options of cases) {
    const { loginAdmin, events } = await compileAuthService(options);
    await assert.rejects(loginAdmin('admin@example.test', 'Pass123!'));
    assert.ok(!events.some(e => e.type === 'setSession'));
    assert.equal(events.find(e => e.type === 'signOut').options.scope, 'local');
    assert.equal(events.at(-1).type, 'dispose');
  }
});

test('incomplete Supabase sessions are rejected before contacting Admin APIs', async () => {
  for (const session of [null, {}, { access_token: 'token' }, { access_token: 'token', refresh_token: 'refresh' }]) {
    const { loginAdmin, events } = await compileAuthService({ signInResult: { data: { session } } });
    await assert.rejects(loginAdmin('admin@example.test', 'Pass123!'), /Unable to verify Admin sign-in/);
    assert.ok(!events.some(e => e.type === 'apiGet' || e.type === 'setSession'));
  }
});

test('failed session adoption is not reported as a successful Admin login', async () => {
  for (const setSessionResult of [
    { data: null, error: new Error('Session failed') },
    { data: { session: null }, error: null },
    { data: { session: { user: { id: 'another-account' } } }, error: null },
  ]) {
    const { loginAdmin, events } = await compileAuthService({ setSessionResult });
    await assert.rejects(loginAdmin('admin@example.test', 'Pass123!'), /Unable to complete Admin sign-in/);
    assert.equal(events.find(e => e.type === 'signOut').options.scope, 'local');
    assert.equal(events.at(-1).type, 'dispose');
  }
});
