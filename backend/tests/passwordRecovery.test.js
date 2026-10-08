import assert from 'node:assert/strict';
import { test } from 'node:test';

test('password reset sends only for a verified existing account', async (t) => {
  const oldOrigin = process.env.CORS_ALLOWED_ORIGIN;
  process.env.CORS_ALLOWED_ORIGIN = 'http://localhost:5173,https://*.harvestlink.test';
  t.after(() => {
    if (oldOrigin === undefined) delete process.env.CORS_ALLOWED_ORIGIN;
    else process.env.CORS_ALLOWED_ORIGIN = oldOrigin;
  });
  let state;
  let calls;
  const email = 'buyer@example.com';
  const user = { id: 'account-1', email, email_confirmed_at: '2026-10-09T00:00:00Z' };
  const reset = () => {
    calls = [];
    state = {
      profile: { data: { id: user.id, email }, error: null },
      account: { data: { user }, error: null },
      recovery: { data: { user, properties: { hashed_token: 'recovery-token-hash', action_link: 'https://auth.example.com/recovery?token=secret' } }, error: null },
    };
  };
  t.mock.module('../src/lib/supabaseClient.js', {
    namedExports: { supabaseAdmin: {
      from(table) {
        calls.push(['table', table]);
        return {
          select() { return this; },
          eq(field, value) { calls.push(['lookup', field, value]); return this; },
          async maybeSingle() { return state.profile; },
        };
      },
      auth: { admin: {
        async getUserById(id) { calls.push(['account', id]); return state.account; },
        async generateLink(options) { calls.push(['generate', options]); return state.recovery; },
      } },
    } },
  });
  t.mock.module('../src/lib/email.js', {
    namedExports: { async sendPasswordResetEmail(to, link) {
      calls.push(['send', to, link]);
      if (state.deliveryError) throw new Error('Provider failed');
      return { id: 'email-1' };
    } },
  });
  const { requestPasswordReset } = await import('../src/controllers/passwordRecovery.controller.js');
  const request = (body = {}) => ({ body: { email, redirectTo: 'http://localhost:5173/reset-password', ...body } });
  let response;
  const res = { json(value) { response = value; } };

  await t.test('normalizes the email and sends one real recovery link without exposing it to the browser', async () => {
    reset();
    await requestPasswordReset(request({ email: '  BUYER@EXAMPLE.COM  ' }), res);
    assert.deepEqual(calls.find(([name]) => name === 'lookup'), ['lookup', 'email', email]);
    assert.deepEqual(calls.find(([name]) => name === 'generate')[1], {
      type: 'recovery', email, options: { redirectTo: 'http://localhost:5173/reset-password' },
    });
    assert.equal(calls.filter(([name]) => name === 'send').length, 1);
    assert.equal(calls.find(([name]) => name === 'send')[2], 'http://localhost:5173/reset-password?token_hash=recovery-token-hash&type=recovery');
    assert.deepEqual(response, { sent: true });
  });

  for (const [name, configure, status, message] of [
    ['unknown email', () => { state.profile.data = null; }, 404, /No account exists/],
    ['profile with no auth account', () => { state.account = { data: null, error: { status: 404 } }; }, 404, /No account exists/],
    ['different auth email', () => { state.account.data.user = { ...user, email: 'other@example.com' }; }, 404, /No account exists/],
    ['unverified account', () => { state.account.data.user = { ...user, email_confirmed_at: null }; }, 400, /verify your email/],
    ['database lookup failure', () => { state.profile.error = { message: 'Database failed' }; }, 503, /Unable to check/],
    ['auth service failure', () => { state.account = { data: null, error: { status: 500 } }; }, 503, /Unable to check/],
    ['link generation failure', () => { state.recovery.error = { message: 'Failed' }; }, 503, /Unable to create/],
    ['missing recovery link', () => { state.recovery.data.properties = {}; }, 503, /Unable to create/],
    ['recovery belongs to another account', () => { state.recovery.data.user = { ...user, id: 'other' }; }, 503, /Unable to create/],
  ]) {
    await t.test(`${name} never sends email`, async () => {
      reset();
      configure();
      await assert.rejects(requestPasswordReset(request(), res), (error) => error.status === status && message.test(error.message));
      assert.equal(calls.some(([step]) => step === 'send'), false);
    });
  }

  await t.test('delivery failure is not reported as success', async () => {
    reset();
    state.deliveryError = true;
    response = undefined;
    await assert.rejects(requestPasswordReset(request(), res), (error) => error.status === 503 && /couldn't send/.test(error.message));
    assert.equal(response, undefined);
  });

  await t.test('malformed email or untrusted reset origin cannot reach account lookup or delivery', async () => {
    for (const body of [
      { email: '' }, { email: 'not-email' }, { email: {} },
      { redirectTo: 'https://evil.example/reset-password' },
      { redirectTo: 'https://shop.harvestlink.test.evil.example/reset-password' },
      { redirectTo: 'javascript:alert(1)' }, { redirectTo: '' },
    ]) {
      reset();
      await assert.rejects(requestPasswordReset(request(body), res), { status: 400 });
      assert.equal(calls.length, 0);
    }
  });

  await t.test('approved preview origins send users to the canonical domain without supplied query or fragment', async () => {
    reset();
    await requestPasswordReset(request({ redirectTo: 'https://preview.harvestlink.test/other?next=evil#fragment' }), res);
    assert.equal(calls.find(([name]) => name === 'generate')[1].options.redirectTo, 'https://harvestlink.dev/reset-password');
  });

  await t.test('harvestlink.dev is accepted even if the CORS environment still lists the old deployment', async () => {
    reset();
    await requestPasswordReset(request({ redirectTo: 'https://harvestlink.dev/reset-password' }), res);
    assert.equal(calls.find(([name]) => name === 'send')[2], 'https://harvestlink.dev/reset-password?token_hash=recovery-token-hash&type=recovery');
  });

  await t.test('the live www redirect can request a reset email', async () => {
    reset();
    await requestPasswordReset(request({ redirectTo: 'https://www.harvestlink.dev/reset-password' }), res);
    assert.equal(calls.find(([name]) => name === 'send')[2], 'https://harvestlink.dev/reset-password?token_hash=recovery-token-hash&type=recovery');
  });
});
