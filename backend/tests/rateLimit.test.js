import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rateLimit } from '../src/middleware/rateLimit.js';

test('general API cap applies only to anonymous and invalid sessions', async (t) => {
  t.mock.module('../src/middleware/requireAuth.js', { namedExports: {
    requireAuth(req, res, next) {
      if (req.headers.authorization !== 'Bearer valid-session') {
        return next(Object.assign(new Error('Invalid or expired session.'), { status: 401 }));
      }
      req.profile = { id: 'account-1', account_status: 'active' };
      next();
    },
  } });
  const { apiRateLimit } = await import('../src/middleware/apiRateLimit.js');
  const invoke = async (req) => {
    const headers = {};
    let error;
    await apiRateLimit(req, { setHeader(name, value) { headers[name] = value; } }, (next) => { error = next; });
    return { error, headers };
  };

  await t.test('authenticated sessions exceed the former 600-request allowance without a cap', async () => {
    const req = { ip: 'valid-test-ip', headers: { authorization: 'Bearer valid-session' } };
    for (let i = 0; i < 1200; i += 1) {
      const result = await invoke(req);
      assert.equal(result.error, undefined);
      assert.equal(result.headers['RateLimit-Limit'], undefined);
    }
    assert.equal(req.profile.id, 'account-1');
  });

  await t.test('anonymous traffic is still capped at 30 requests per minute', async () => {
    const req = { ip: 'anonymous-test-ip', headers: {} };
    for (let i = 0; i < 30; i += 1) assert.equal((await invoke(req)).error, undefined);
    const result = await invoke(req);
    assert.equal(result.error.status, 429);
    assert.equal(result.headers['RateLimit-Limit'], 30);
    assert.ok(result.headers['Retry-After'] > 0);
  });

  await t.test('forged bearer tokens do not bypass the anonymous IP allowance', async () => {
    for (let i = 0; i < 30; i += 1) {
      const result = await invoke({ ip: 'invalid-test-ip', headers: { authorization: `Bearer fake-${i}` } });
      assert.equal(result.error.status, 401);
    }
    const result = await invoke({ ip: 'invalid-test-ip', headers: { authorization: 'Bearer another-fake' } });
    assert.equal(result.error.status, 429);
  });

  await t.test('an authenticated session is not blocked by its IP anonymous bucket', async () => {
    const result = await invoke({ ip: 'anonymous-test-ip', headers: { authorization: 'Bearer valid-session' } });
    assert.equal(result.error, undefined);
  });
});

test('action-specific limits still reject excess writes and reset after their window', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const limiter = rateLimit({ name: 'payment-limit-test', limit: 5, windowMs: 60000, key: () => 'account-1' });
  const req = { headers: { authorization: 'Bearer valid-session' } };
  const headers = {};
  const res = { setHeader(name, value) { headers[name] = value; } };
  const invoke = () => { let error; limiter(req, res, (next) => { error = next; }); return error; };
  for (let i = 0; i < 5; i += 1) assert.equal(invoke(), undefined);
  assert.equal(invoke().status, 429);
  assert.equal(headers['Retry-After'], 60);
  t.mock.timers.tick(60000);
  assert.equal(invoke(), undefined);
  assert.equal(headers['RateLimit-Remaining'], 4);
});
