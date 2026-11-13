import assert from 'node:assert/strict';
import { test } from 'node:test';

Object.assign(process.env, {
  NODE_ENV: 'test',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  PENDING_REGISTRATION_SECRET: '01234567890123456789012345678901',
  ADMIN_ALLOWED_IPS: '8.8.8.8',
  CORS_ALLOWED_ORIGIN: 'https://harvestlink.dev',
});
delete process.env.RENDER;
delete process.env.TRUSTED_PROXY_IPS;

const { default: app } = await import('../src/app.js');

test('GET /health returns backend status and allows the production frontend origin', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/health`, {
      headers: { Origin: 'https://harvestlink.dev' },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: 'ok',
      service: 'harvestlink-backend',
    });
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://harvestlink.dev');
  } finally {
    await new Promise((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  }
});
