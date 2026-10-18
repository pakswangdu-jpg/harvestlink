import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

let rpcResult;
const calls = [];
mock.module('../src/lib/supabaseClient.js', { namedExports: { supabaseAdmin: {
  async rpc(name, args) { calls.push({ name, args }); return rpcResult; },
} } });
const { shouldCheckAccountInactivity, assertAccountActive, suspendInactiveAccounts, startInactivitySuspensionJob } = await import('../src/lib/accountInactivity.js');
beforeEach(() => { rpcResult = { data: [], error: null }; calls.length = 0; });
const old = { id:'buyer', role:'buyer', account_status:'active', created_at:'2020-01-01', last_active_at:'2020-01-01' };
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('only inactive marketplace roles require an authoritative database check', () => {
  for (const role of ['buyer','farmer','stakeholder']) assert.equal(shouldCheckAccountInactivity({ ...old, role }), true);
  for (const profile of [{ ...old, role:'admin' }, { ...old, account_status:'suspended' }, { ...old, last_active_at:new Date().toISOString() }, { role:'buyer', account_status:'active' }]) {
    assert.equal(shouldCheckAccountInactivity(profile), false);
  }
  assert.equal(shouldCheckAccountInactivity({ ...old, last_active_at:null }), true);
});
test('overdue account is suspended before login/request can refresh its last activity', async () => {
  rpcResult = { data:[{ user_id:old.id }], error:null };
  await assert.rejects(assertAccountActive(old), (error) => error.status === 403 && error.message.includes('six months'));
  assert.deepEqual(calls, [{ name:'suspend_inactive_accounts', args:{ p_user:old.id } }]);
});
test('reactivated or not-yet-due account stays active when the database says it is not eligible', async () => {
  await assertAccountActive(old);
  assert.equal(calls.length, 1);
});
test('Admin exemption and current activity do not make unnecessary RPC calls', async () => {
  await assertAccountActive({ ...old, role:'admin' });
  await assertAccountActive({ ...old, last_active_at:new Date().toISOString() });
  assert.equal(calls.length, 0);
});
test('manual and automatic suspension messages remain distinct, with no automatic reactivation', async () => {
  await assert.rejects(assertAccountActive({ ...old, account_status:'suspended' }), (error) => error.status === 403 && error.message.includes('support'));
  await assert.rejects(assertAccountActive({ ...old, account_status:'suspended', inactivity_suspended_at:'2026-10-19' }), (error) => error.status === 403 && error.message.includes('Admin'));
  assert.equal(calls.length, 0);
});
test('failed or unavailable protection fails closed instead of silently restoring overdue accounts', async () => {
  for (const code of ['PGRST202','42883','42703']) {
    rpcResult = { error:{ code } };
    await assert.rejects(assertAccountActive(old), (error) => error.status === 503 && error.message.includes('migration'));
  }
  for (const data of [null, {}, [{ wrong:'shape' }]]) {
    rpcResult = { data, error:null };
    await assert.rejects(assertAccountActive(old), { status:503 });
  }
});
test('sweep uses only the service RPC, with no browser-provided dates or role overrides', async () => {
  rpcResult = { data:[{ user_id:'one' },{ user_id:'two' }], error:null };
  assert.deepEqual(await suspendInactiveAccounts(), ['one','two']);
  assert.deepEqual(calls[0], { name:'suspend_inactive_accounts', args:{ p_user:null } });
});
test('scheduled job runs on startup, hourly, invalidates suspended sessions and stops cleanly', async (t) => {
  t.mock.timers.enable({ apis:['setInterval'] });
  const invalidated = [];
  let runs = 0;
  const stop = startInactivitySuspensionJob({ run:async () => { runs += 1; return ['suspended-user']; }, onSuspended:(id) => invalidated.push(id) });
  t.after(stop);
  await flush();
  assert.equal(runs, 1);
  t.mock.timers.tick(60 * 60 * 1000);
  await flush();
  assert.equal(runs, 2);
  assert.deepEqual(invalidated, ['suspended-user','suspended-user']);
  stop();
  t.mock.timers.tick(60 * 60 * 1000);
  await flush();
  assert.equal(runs, 2);
});
test('scheduled sweeps never overlap and recover after a failed run', async (t) => {
  t.mock.timers.enable({ apis:['setInterval'] });
  let release;
  let runs = 0;
  const logged = [];
  const stop = startInactivitySuspensionJob({ intervalMs:100, run:async () => {
    runs += 1;
    if (runs === 1) return new Promise((resolve) => { release = resolve; });
    if (runs === 2) throw new Error('Database unavailable');
    return [];
  }, logger:{ error:(...args) => logged.push(args.join(' ')) } });
  t.after(stop);
  t.mock.timers.tick(500);
  assert.equal(runs, 1);
  release([]);
  await flush();
  t.mock.timers.tick(100);
  await flush();
  assert.equal(logged.length, 1);
  t.mock.timers.tick(100);
  await flush();
  assert.equal(runs, 3);
});
test('a backlog is processed in bounded batches without losing cache invalidations', async (t) => {
  const ids = Array.from({ length:500 }, (_, i) => `user-${i}`);
  let runs = 0;
  const invalidated = [];
  const stop = startInactivitySuspensionJob({ run:async () => { runs += 1; return runs === 1 ? ids : ['last']; }, onSuspended:(id) => invalidated.push(id) });
  t.after(stop);
  await flush();
  assert.equal(runs, 2);
  assert.equal(invalidated.length, 501);
});
