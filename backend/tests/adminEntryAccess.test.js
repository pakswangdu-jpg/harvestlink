import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { mock, test } from 'node:test';
import express from 'express';
import { errorHandler } from '../src/middleware/errorHandler.js';

test('Admin entry and workspace enforce the network and authenticated account role', async t => {
  const hostname = 'harvestlink-backend-t1t2.onrender.com';
  const allowedIp = '143.44.164.23';
  Object.assign(process.env, {
    NODE_ENV: 'production',
    RENDER: 'true',
    RENDER_SERVICE_TYPE: 'web',
    RENDER_EXTERNAL_HOSTNAME: hostname,
    ADMIN_ALLOWED_IPS: allowedIp,
    PENDING_REGISTRATION_SECRET: 'admin-entry-tests'.padEnd(32, '0'),
  });
  delete process.env.TRUSTED_PROXY_IPS;

  let authCalls = 0;
  mock.module('../src/lib/supabaseClient.js', { namedExports: { supabaseAdmin: {
    auth: {
      async getUser(token) {
        authCalls += 1;
        return token === 'invalid'
          ? { error: new Error('Invalid session') }
          : { data: { user: { id: token } } };
      },
    },
    from(table) {
      assert.equal(table, 'profiles');
      let id;
      const query = {
        select() { return query; },
        eq(column, value) {
          assert.equal(column, 'id');
          id = value;
          return query;
        },
        async single() {
          return { data: {
            id,
            role: id === 'suspended-admin' ? 'admin' : id,
            account_status: id === 'suspended-admin' ? 'suspended' : 'active',
            last_active_at: new Date().toISOString(),
          } };
        },
      };
      return query;
    },
  } } });

  const { default: authRoutes } = await import('../src/routes/auth.routes.js');
  const app = express();
  app.set('trust proxy', false);
  app.use('/api/auth', authRoutes);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/auth`;
  const allowedHeaders = { Host: hostname, 'CF-Connecting-IP': allowedIp };
  const request = (path, headers = allowedHeaders) => new Promise((resolve, reject) => {
    // Native HTTP preserves the deployed ingress Host fixture.
    const req = httpRequest(`${base}${path}`, { headers }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: JSON.parse(body),
      }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });

  try {
    await t.test('anonymous allowed-network preflight permits only the login entry', async () => {
      const before = authCalls;
      const result = await request('/admin-entry-access');
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, { allowed: true });
      assert.equal(result.headers['cache-control'], 'no-store');
      assert.equal(authCalls, before);
      assert.equal((await request('/admin-access')).status, 401);
    });

    await t.test('unverified IPs and forged headers cannot authorize the entry', async () => {
      const before = authCalls;
      const blockedHeaders = [
        { ...allowedHeaders, 'CF-Connecting-IP': '8.8.8.8' },
        { Host: hostname },
        { ...allowedHeaders, 'CF-Connecting-IP': `${allowedIp}, 8.8.8.8` },
        { ...allowedHeaders, 'CF-Connecting-IP': '127.0.0.1' },
        { ...allowedHeaders, Host: 'localhost' },
        { Host: hostname, 'X-Forwarded-For': allowedIp, 'X-Admin-IP': allowedIp },
      ];
      for (const headers of blockedHeaders) {
        const result = await request('/admin-entry-access', headers);
        assert.equal(result.status, 403);
        assert.equal(result.body.error, 'ADMIN_NETWORK_NOT_ALLOWED');
        assert.equal(result.headers['cache-control'], 'no-store');
        assert.ok(!JSON.stringify(result.body).includes(allowedIp));
      }
      assert.equal(authCalls, before);
    });

    for (const role of ['buyer', 'farmer', 'stakeholder']) {
      await t.test(`${role} cannot use an allowed IP to enter the Admin portal`, async () => {
        const headers = { ...allowedHeaders, Authorization: `Bearer ${role}` };
        for (const path of ['/admin-entry-access', '/admin-access']) {
          const result = await request(path, headers);
          assert.equal(result.status, 403);
          assert.notEqual(result.body.allowed, true);
        }
      });
    }

    await t.test('only an active Admin on an allowed IP passes both gates', async () => {
      const headers = { ...allowedHeaders, Authorization: 'Bearer admin' };
      for (const path of ['/admin-entry-access', '/admin-access']) {
        const result = await request(path, headers);
        assert.equal(result.status, 200);
        assert.deepEqual(result.body, { allowed: true });
        assert.equal(result.headers['cache-control'], 'no-store');
        const denied = await request(path, { ...headers, 'CF-Connecting-IP': '8.8.8.8', 'X-Forwarded-For': allowedIp });
        assert.equal(denied.status, 403);
        assert.equal(denied.body.error, 'ADMIN_NETWORK_NOT_ALLOWED');
      }
    });

    await t.test('suspended and invalid sessions cannot fall back to anonymous entry', async () => {
      for (const [authorization, status] of [
        ['Bearer suspended-admin', 403],
        ['Bearer invalid', 401],
        ['Basic admin', 401],
      ]) {
        for (const path of ['/admin-entry-access', '/admin-access']) {
          assert.equal((await request(path, { ...allowedHeaders, Authorization: authorization })).status, status);
        }
      }
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
