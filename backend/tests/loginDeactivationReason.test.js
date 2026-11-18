import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

let profile;
let deactivationEvent;
let authResult;
const queries = [];

mock.module('@supabase/supabase-js', {
  namedExports: {
    createClient: () => ({
      auth: { signInWithPassword: async () => authResult },
    }),
  },
});
mock.module('../src/lib/supabaseClient.js', {
  namedExports: {
    supabaseAdmin: {
      from(table) {
        queries.push({ table });
        const query = {
          select() { return query; },
          eq(column, value) { queries.at(-1)[column] = value; return query; },
          in(column, value) { queries.at(-1)[column] = value; return query; },
          order() { return query; },
          limit() { return query; },
          async maybeSingle() {
            return queries.at(-1).table === 'profiles'
              ? { data: profile, error: null }
              : { data: deactivationEvent, error: null };
          },
        };
        return query;
      },
    },
  },
});
mock.module('../src/lib/accountInactivity.js', {
  namedExports: {
    async assertAccountActive(value) {
      if (value.account_status === 'suspended') {
        const error = new Error('Automatically suspended for inactivity.');
        error.status = 403;
        error.code = 'ACCOUNT_SUSPENDED';
        throw error;
      }
    },
  },
});
mock.module('../src/lib/recaptcha.js', {
  namedExports: { async verifyRecaptchaToken() {} },
});

const { login } = await import('../src/controllers/login.controller.js');

beforeEach(() => {
  profile = {
    id: 'user-id',
    role: 'buyer',
    account_status: 'suspended',
    inactivity_suspended_at: null,
  };
  deactivationEvent = { reason: 'Repeated policy violations' };
  authResult = {
    data: {
      session: { access_token: 'access-token', refresh_token: 'refresh-token' },
      user: { id: 'user-id' },
    },
    error: null,
  };
  queries.length = 0;
  process.env.SUPABASE_URL = 'https://supabase.example';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
});

function requestLogin() {
  const req = { body: { email: 'user@example.com', password: 'valid-password' }, path: '/login' };
  const res = {
    setHeader() {},
    json() {},
  };
  return { req, res };
}

test('valid credentials for a manually deactivated account receive its recorded reason', async () => {
  const { req, res } = requestLogin();
  await assert.rejects(login(req, res), (error) => {
    assert.equal(error.status, 403);
    assert.equal(error.code, 'ACCOUNT_DEACTIVATED');
    assert.match(error.message, /Reason: Repeated policy violations/);
    return true;
  });
  assert.ok(queries.some((query) => query.table === 'account_admin_events'
    && query.user_id === 'user-id' && query.action.includes('USER_DEACTIVATED')));
});

test('valid credentials for a policy-deactivated account receive its recorded reason', async () => {
  deactivationEvent = { action: 'USER_AUTO_DEACTIVATED', reason: 'A prohibited listing was detected.' };
  const { req, res } = requestLogin();
  await assert.rejects(login(req, res), (error) => {
    assert.equal(error.status, 403);
    assert.equal(error.code, 'ACCOUNT_DEACTIVATED');
    assert.match(error.message, /automatically deactivated/);
    assert.match(error.message, /A prohibited listing was detected/);
    return true;
  });
});

test('automatic inactivity suspension keeps its existing message and does not query admin reason', async () => {
  profile.inactivity_suspended_at = '2026-11-18T00:00:00.000Z';
  const req = { body: { email: 'user@example.com', password: 'valid-password' }, path: '/login' };
  await assert.rejects(login(req, { setHeader() {}, json() {} }), { code: 'ACCOUNT_SUSPENDED' });
  assert.equal(queries.some((query) => query.table === 'account_admin_events'), false);
});

test('deactivation reasons are not disclosed when credentials are invalid', async () => {
  authResult = { data: { session: null }, error: { status: 401, message: 'Invalid login credentials' } };
  const req = { body: { email: 'user@example.com', password: 'incorrect-password' }, path: '/login' };
  await assert.rejects(login(req, { setHeader() {}, json() {} }), { code: 'INVALID_CREDENTIALS' });
  assert.equal(queries.length, 0);
});
