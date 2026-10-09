import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { getTrustedProxies, normalizeIPv4, parseAdminAllowedIps } from '../src/lib/adminNetwork.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

process.env.ADMIN_ALLOWED_IPS = '143.44.164.23';
delete process.env.RENDER;
const { createAdminNetworkGuard } = await import('../src/middleware/requireAdminNetwork.js');

test('allowlist supports trimmed exact IPv4 and mapped addresses, not partial or wildcard matching', () => {
  const config = parseAdminAllowedIps({ NODE_ENV: 'production', ADMIN_ALLOWED_IPS: '143.44.164.23, 49.145.123.45, ,::ffff:112.198.20.50' });
  assert.equal(config.valid, true);
  assert.deepEqual([...config.allowed], ['143.44.164.23', '49.145.123.45', '112.198.20.50']);
  assert.equal(normalizeIPv4(' ::FFFF:143.44.164.23 '), '143.44.164.23');
  for (const value of ['143.44.164.2300','143.44.164.23:80','143.44.164.23/32','143.044.164.23','*','::1','']) assert.equal(normalizeIPv4(value), null);
  for (const value of ['', ' ', '*', '143.44.164.23,invalid', '192.168.1.9', '127.0.0.1', '100.64.0.1', '224.0.0.1']) {
    const result = parseAdminAllowedIps({ NODE_ENV: 'production', ADMIN_ALLOWED_IPS: value, ADMIN_ALLOW_LOCAL_IPS: 'true' });
    assert.equal(result.valid, false);
    assert.equal(result.allowed.size, 0);
  }
});

test('local addresses require explicit development opt-in and remain denied on Render', () => {
  const env = { ADMIN_ALLOWED_IPS: '192.168.1.9,127.0.0.1', NODE_ENV: 'development' };
  assert.equal(parseAdminAllowedIps(env).valid, false);
  assert.equal(parseAdminAllowedIps({ ...env, ADMIN_ALLOW_LOCAL_IPS: 'true' }).valid, true);
  assert.equal(parseAdminAllowedIps({ ...env, ADMIN_ALLOW_LOCAL_IPS: 'true', RENDER: 'true' }).valid, false);
});

test('proxy configuration defaults to no trust and rejects blanket trust', () => {
  assert.equal(getTrustedProxies({}), false);
  assert.deepEqual(getTrustedProxies({ TRUSTED_PROXY_IPS: '10.2.3.4/32, ::1/128' }), ['10.2.3.4/32', '::1/128']);
  for (const value of ['*','true','1','0.0.0.0/0','::/0','10.0.0.1/33','::1/129','10.0.0.1/no','10.0.0.1/8/extra']) assert.throws(() => getTrustedProxies({ TRUSTED_PROXY_IPS: value }));
});

test('network guard fails closed, checks active accounts, and logs no secrets or addresses', () => {
  const logs = [];
  const guard = createAdminNetworkGuard({ env: { NODE_ENV: 'production', ADMIN_ALLOWED_IPS: '143.44.164.23' }, logger: { warn: value => logs.push(value) } });
  const req = { ip: '8.8.8.8', headers: { 'x-admin-ip': '143.44.164.23' }, profile: { id:'admin', role:'admin', account_status:'active' } };
  let error;
  guard(req, {}, value => { error = value; });
  assert.equal(error.status, 403);
  assert.equal(error.code, 'ADMIN_NETWORK_NOT_ALLOWED');
  assert.equal(JSON.parse(logs[0]).userId, 'admin');
  assert.ok(!logs.join('').includes('143.44.164.23'));
  assert.ok(!logs.join('').includes('8.8.8.8'));
  req.ip = '::ffff:143.44.164.23';
  guard(req, {}, value => { error = value; });
  assert.equal(error, undefined);
  req.profile.account_status = null;
  guard(req, {}, value => { error = value; });
  assert.equal(error.status, 403);
  req.profile = { role:'buyer', account_status:'active' };
  guard(req, {}, value => { error = value; });
  assert.equal(error, undefined);
  for (const env of [{}, { RENDER:'true', ADMIN_ALLOWED_IPS:'143.44.164.23' }]) {
    const deny = createAdminNetworkGuard({ env, logger: { warn() {} } });
    deny({ ip:'143.44.164.23', profile:{ role:'admin', account_status:'active' } }, {}, value => { error = value; });
    assert.equal(error.code, 'ADMIN_NETWORK_NOT_ALLOWED');
  }
});

test('HTTP authentication gates Admin reads and writes and cannot be bypassed by forged headers', async t => {
  let token;
  t.mock.module('../src/lib/supabaseClient.js', { namedExports: { supabaseAdmin: {
    auth: { async getUser(value) { token = value; return value === 'bad' ? { error:new Error('Invalid') } : { data:{ user:{ id:value } } }; } },
    from() { const query = { select(){return query;},eq(){return query;},async single(){return {data:{id:token,role:token.startsWith('buyer')?'buyer':'admin',account_status:token==='suspended'?'suspended':'active',last_active_at:new Date().toISOString()}};} };return query; },
  } } });
  const { requireAuth } = await import('../src/middleware/requireAuth.js');
  const { requireRole } = await import('../src/middleware/requireRole.js');
  const { apiRateLimit } = await import('../src/middleware/apiRateLimit.js');
  async function withApp(trust, run) {
    const app = express();app.set('trust proxy', trust);
    let hits = 0;
    app.use('/api', apiRateLimit);
    app.get('/api/profiles/me', requireAuth, (req,res)=>res.json({id:req.profile.id,role:req.profile.role}));
    app.get('/api/orders', requireAuth, (req,res)=>{hits++;res.json({rows:['protected']});});
    app.patch('/api/profiles/me', requireAuth, (req,res)=>{hits++;res.json({saved:true});});
    app.get('/api/auth/admin-access', requireAuth, requireRole('admin'), (req,res)=>res.json({allowed:true}));
    app.use(errorHandler);
    const server = app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const request = (path, options={}) => fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { ...options, headers:{ Authorization:'Bearer admin',...options.headers } });
    try { await run(request,()=>hits); } finally { await new Promise(resolve=>server.close(resolve)); }
  }
  await withApp(false, async(request,hits)=>{
    const denied = await request('/orders',{headers:{'X-Forwarded-For':'143.44.164.23','X-Admin-IP':'143.44.164.23'}});
    assert.equal(denied.status,403);
    assert.deepEqual(await denied.json(),{error:'ADMIN_NETWORK_NOT_ALLOWED',message:'Admin access is not allowed from this network.'});
    assert.equal(hits(),0);
    assert.equal((await request('/profiles/me')).status,200);
    assert.equal((await request('/profiles/me',{method:'PATCH'})).status,403);
    assert.equal((await request('/orders',{headers:{Authorization:'Bearer bad'}})).status,401);
    assert.equal((await request('/orders',{headers:{Authorization:'Bearer suspended'}})).status,403);
    assert.equal((await request('/orders',{headers:{Authorization:'Bearer buyer-one'}})).status,200);
    assert.equal((await request('/auth/admin-access',{headers:{Authorization:'Bearer buyer-one'}})).status,403);
  });
  await withApp(getTrustedProxies({TRUSTED_PROXY_IPS:'127.0.0.1/32'}), async(request,hits)=>{
    assert.equal((await request('/auth/admin-access',{headers:{'X-Forwarded-For':'8.8.8.8, 143.44.164.23'}})).status,200);
    assert.equal((await request('/orders',{headers:{'X-Forwarded-For':'143.44.164.23, 8.8.8.8'}})).status,403);
    assert.equal(hits(),0);
    assert.equal((await request('/orders',{headers:{'X-Forwarded-For':'143.44.164.23'}})).status,200);
    assert.equal((await request('/orders',{headers:{'X-Forwarded-For':'143.44.164.230'}})).status,403);
    assert.equal(hits(),1);
  });
});
