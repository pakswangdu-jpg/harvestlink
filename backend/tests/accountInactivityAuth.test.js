import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let profile;
let rpcIds = [];
let activityWrites = 0;
const filters = [];
mock.module('../src/lib/supabaseClient.js', { namedExports:{ supabaseAdmin:{
  auth:{ getUser:async () => ({ data:{ user:{ id:profile.id } }, error:null }) },
  from() {
    const query = { select(){ return this; }, eq(...args){ filters.push(args); return this; },
      single:async () => ({ data:profile, error:null }),
      update(){ activityWrites += 1; return this; },
      then(resolve,reject){ return Promise.resolve({ error:null }).then(resolve,reject); },
    };
    return query;
  },
  rpc:async () => ({ data:rpcIds.map((id) => ({ user_id:id })), error:null }),
} } });
const { requireAuth, invalidateAuthCacheForUser } = await import('../src/middleware/requireAuth.js');
async function request(token) {
  const req = { headers:{ authorization:`Bearer ${token}` }, method:'GET', originalUrl:'/api/profiles/me' };
  let error;
  await requireAuth(req, {}, (failure) => { error = failure; });
  return { req, error };
}
test('login bootstrap cannot reset overdue activity; Admin-reactivated accounts can return normally', async () => {
  profile = { id:'old-buyer', role:'buyer', account_status:'active', last_active_at:'2020-01-01', created_at:'2020-01-01' };
  rpcIds = [profile.id];
  assert.equal((await request('old-token')).error.status, 403);
  assert.equal(activityWrites, 0);
  rpcIds = [];
  const reactivated = await request('reactivated-token');
  assert.equal(reactivated.error, undefined);
  assert.equal(activityWrites, 1);
  assert.ok(filters.some(([field,value]) => field === 'account_status' && value === 'active'));
  invalidateAuthCacheForUser(profile.id);
  profile = { ...profile, account_status:'suspended', inactivity_suspended_at:new Date().toISOString() };
  assert.equal((await request('reactivated-token')).error.status, 403);
});
