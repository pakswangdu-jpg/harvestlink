import assert from 'node:assert/strict';
import { test } from 'node:test';

test('admin users queries remain bounded, role-scoped and reuse existing account APIs', async (t) => {
  let calls = [];
  let historyError = null;
  t.mock.module('../src/lib/supabaseClient.js', { namedExports: { supabaseAdmin: {
    from(table) {
      calls.push(['from',table]);
      const query = {
        then(resolve,reject) { return Promise.resolve({data:[],count:21,error:table === 'account_admin_events' ? historyError : null}).then(resolve,reject); },
        single: async () => ({ data: { id:'target', role:'buyer', name:'Buyer', account_status:'active' }, error:null }),
      };
      for (const method of ['select','eq','in','or','gte','lt','order','range']) query[method] = (...values) => { calls.push([method,...values]); return query; };
      return query;
    },
    async rpc(name,args) { calls.push(['rpc',name,args]); return {data:{id:'target',account_status:'suspended',verification_status:'verified'},error:historyError ? {code:'PGRST202'} : null}; },
  } } });
  const { getAdminUserPage, getAdminUserDetails, manageAccount } = await import('../src/lib/adminUserQueries.js');
  const req = { profile:{id:'admin',role:'admin'},params:{id:'target'},query:{page:'2',search:'Farm, (Cebu)',verificationStatus:'not_required',accountStatus:'suspended'},body:{status:'suspended',expectedStatus:'active'} };
  let response;
  await getAdminUserPage(req,{json(value){response=value;}});
  assert.deepEqual(calls.find((call)=>call[0]==='range'),['range',10,19]);
  assert.ok(calls.some((call)=>call[0]==='in' && call[1]==='role' && call[2].includes('buyer')));
  assert.ok(calls.find((call)=>call[0]==='or')[1].includes('organization_name.ilike.'));
  assert.equal(calls.filter((call)=>call[0]==='select' && call[2]?.head).length,6);
  assert.equal(response.total,21); assert.equal(response.pageSize,10);
  const result=await manageAccount(req,'account');
  assert.equal(result.verification_status,'verified');
  assert.deepEqual(calls.at(-1),['rpc','manage_admin_account',{p_actor:'admin',p_user:'target',p_kind:'account',p_status:'suspended',p_reason:null,p_expected:'active'}]);
  req.profile.role='buyer';
  await assert.rejects(getAdminUserPage(req,{}),{status:403});
  await assert.rejects(manageAccount(req,'account'),{status:403});
  await assert.rejects(getAdminUserDetails(req,{}),{status:403});
  req.profile.role='admin';
  for (const code of ['PGRST205','42P01']) {
    historyError = {code};
    await getAdminUserDetails(req,{json(value){response=value;}});
    assert.equal(response.user.id,'target');
    assert.equal(response.activity['Total orders'],21);
    assert.equal(response.historyAvailable,false);
    assert.equal(response.accountManagementAvailable,false);
    assert.deepEqual(response.history,[]);
    await assert.rejects(manageAccount(req,'account'),{status:503});
  }
  historyError = {code:'42501',message:'Permission denied'};
  await assert.rejects(getAdminUserDetails(req,{}),{status:403});
  historyError = null;
  await getAdminUserDetails(req,{json(value){response=value;}});
  assert.equal(response.historyAvailable,true);
  assert.equal(response.accountManagementAvailable,true);
});
