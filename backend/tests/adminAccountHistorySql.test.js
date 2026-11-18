import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('admin account changes preserve identity, verification and history atomically', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const admin = '10000000-0000-4000-8000-000000000001';
  const farmer = '10000000-0000-4000-8000-000000000002';
  const buyer = '10000000-0000-4000-8000-000000000003';
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table profiles(id uuid primary key, role text, account_status text, verification_status text, verified_at timestamptz, verification_acknowledged boolean, updated_at timestamptz);
    create table notifications(user_id uuid,type text,title text,message text,link text);
    create table products(id uuid primary key, farmer_id uuid references profiles(id), status text, updated_at timestamptz);
    create table orders(id int primary key,buyer_id uuid references profiles(id));
    insert into profiles(id,role,account_status,verification_status) values('${admin}','admin','active',null),('${farmer}','farmer','active','pending'),('${buyer}','buyer','active',null);
    insert into orders values(1,'${buyer}');`);
  const migration = await readFile(new URL('../../supabase/migrations/2026101001_admin_account_history.sql', import.meta.url), 'utf8');
  await db.exec(migration); await db.exec(migration);
  const reasonMigration = await readFile(new URL('../../supabase/migrations/20261119_require_admin_deactivation_reason.sql', import.meta.url), 'utf8');
  await db.exec(reasonMigration); await db.exec(reasonMigration);
  const policyMigration = await readFile(new URL('../../supabase/migrations/20261119005954_prohibited_listing_deactivation.sql', import.meta.url), 'utf8');
  await db.exec(policyMigration); await db.exec(policyMigration);
  const act = async (user, kind, status, reason = null, expected = null, actor = admin) => (await db.query('select * from manage_admin_account($1,$2,$3,$4,$5,$6)', [actor,user,kind,status,reason,expected])).rows[0];
  await t.test('verification records admin, action, reason and timestamps', async () => {
    await act(farmer,'verification','rejected','Incomplete information','pending');
    const rejected = (await db.query('select * from profiles where id=$1',[farmer])).rows[0];
    assert.equal(rejected.verification_status,'rejected');
    assert.equal(rejected.verification_rejection_reason,'Incomplete information');
    assert.equal(rejected.verified_at,null);
    const verified = await act(farmer,'verification','verified',null,'rejected');
    assert.ok(verified.verified_at);
    assert.equal(verified.verification_rejection_reason,null);
    const events = (await db.query('select * from account_admin_events order by occurred_at')).rows;
    assert.equal(events.length,2); assert.equal(events[0].admin_id,admin); assert.equal(events[0].user_id,farmer);
    assert.equal(events[0].reason,'Incomplete information'); assert.equal(events[1].action,'USER_VERIFIED');
  });
  await t.test('deactivation and reactivation preserve verification and relational records', async () => {
    const before = (await db.query('select verified_at from profiles where id=$1',[farmer])).rows[0].verified_at;
    await assert.rejects(act(farmer,'account','suspended',null,'active'), { code:'22023' });
    const reason = 'Repeated policy violations';
    const blocked = await act(farmer,'account','suspended',reason,'active');
    assert.equal(blocked.verification_status,'verified'); assert.deepEqual(blocked.verified_at,before);
    assert.equal((await db.query("select reason from account_admin_events where user_id=$1 and action='USER_DEACTIVATED'",[farmer])).rows[0].reason,reason);
    assert.equal((await act(farmer,'account','active',null,'suspended')).id,farmer);
    await act(buyer,'account','suspended','Repeated abuse','active'); await act(buyer,'account','active',null,'suspended');
    assert.equal((await db.query('select count(*)::int as count from orders')).rows[0].count,1);
    assert.equal((await db.query('select count(*)::int as count from profiles')).rows[0].count,3);
  });
  await t.test('prohibited listings atomically deactivate a farmer, hide their listings and record a reason', async () => {
    const firstProduct = '20000000-0000-4000-8000-000000000001';
    const secondProduct = '20000000-0000-4000-8000-000000000002';
    await db.query("insert into products values($1,$2,'active',now()),($3,$2,'active',now())", [firstProduct, farmer, secondProduct]);
    const result = await db.query('select deactivate_for_prohibited_listing($1,$2,$3) as deactivated', [farmer, firstProduct, 'Cannabis listing']);
    assert.equal(result.rows[0].deactivated, true);
    assert.equal((await db.query('select account_status from profiles where id=$1', [farmer])).rows[0].account_status, 'suspended');
    assert.deepEqual((await db.query('select status from products where farmer_id=$1 order by id', [farmer])).rows.map((row) => row.status), ['inactive', 'inactive']);
    const event = (await db.query("select admin_id,action,reason from account_admin_events where user_id=$1 and action='USER_AUTO_DEACTIVATED'", [farmer])).rows[0];
    assert.equal(event.admin_id, null);
    assert.match(event.reason, /Cannabis listing/);
    assert.equal((await db.query("select count(*)::int as count from notifications where user_id=$1 and title='Account deactivated'", [farmer])).rows[0].count, 1);
    assert.equal((await db.query('select deactivate_for_prohibited_listing($1,$2,$3) as deactivated', [farmer, firstProduct, 'Cannabis listing'])).rows[0].deactivated, false);
    assert.equal((await db.query("select count(*)::int as count from account_admin_events where user_id=$1 and action='USER_AUTO_DEACTIVATED'", [farmer])).rows[0].count, 1);
  });
  await t.test('failed policy notification insertion rolls back all deactivation changes', async () => {
    const productId = '20000000-0000-4000-8000-000000000003';
    await act(farmer, 'account', 'active', null, 'suspended');
    await db.query("insert into products values($1,$2,'active',now())", [productId, farmer]);
    await db.query("delete from notifications where user_id=$1 and title='Account deactivated'", [farmer]);
    await db.exec("alter table notifications add constraint reject_policy_notification check(title <> 'Account deactivated')");
    await assert.rejects(db.query('select deactivate_for_prohibited_listing($1,$2,$3)', [farmer, productId, 'Marijuana listing']), { code: '23514' });
    assert.equal((await db.query('select account_status from profiles where id=$1', [farmer])).rows[0].account_status, 'active');
    assert.equal((await db.query('select status from products where id=$1', [productId])).rows[0].status, 'active');
    await db.exec('alter table notifications drop constraint reject_policy_notification');
  });
  await t.test('role guards, self-protection and stale updates are enforced in storage', async () => {
    await assert.rejects(act(admin,'account','suspended','Admin account'),{code:'42501'});
    await assert.rejects(act(buyer,'verification','verified'),{code:'22023'});
    await assert.rejects(act(farmer,'verification','rejected'),{code:'22023'});
    await assert.rejects(act(farmer,'account','suspended','   '),{code:'22023'});
    await assert.rejects(act(farmer,'account','suspended','Valid reason','suspended'),{code:'23514'});
    await assert.rejects(act(farmer,'account','suspended','Valid reason',null,buyer),{code:'42501'});
  });
  await t.test('failed audit insertion rolls back the account change', async () => {
    await db.exec("alter table account_admin_events add constraint reject_deactivation check(action <> 'USER_DEACTIVATED') not valid;");
    await assert.rejects(act(farmer,'account','suspended','Valid reason'),{code:'23514'});
    assert.equal((await db.query('select account_status from profiles where id=$1',[farmer])).rows[0].account_status,'active');
    await db.exec('alter table account_admin_events drop constraint reject_deactivation');
  });
  await t.test('audit table is not editable and RPC is not available to browser roles', async () => {
    const { rows } = await db.query("select has_table_privilege('service_role','account_admin_events','UPDATE') as editable, has_table_privilege('service_role','account_admin_events','DELETE') as deletable, has_function_privilege('authenticated','manage_admin_account(uuid,uuid,text,text,text,text)','EXECUTE') as admin_callable, has_function_privilege('authenticated','deactivate_for_prohibited_listing(uuid,uuid,text)','EXECUTE') as policy_callable");
    assert.equal(rows[0].editable,false); assert.equal(rows[0].deletable,false);
    assert.equal(rows[0].admin_callable,false); assert.equal(rows[0].policy_callable,false);
  });
});
