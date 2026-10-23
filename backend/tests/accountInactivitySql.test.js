import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const admin = '10000000-0000-4000-8000-000000000001';
const buyer = '20000000-0000-4000-8000-000000000001';
const farmer = '30000000-0000-4000-8000-000000000001';
const stakeholder = '40000000-0000-4000-8000-000000000001';
const historyMigration = await readFile(new URL('../../supabase/migrations/2026101001_admin_account_history.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../../supabase/migrations/20261019_inactive_account_suspension.sql', import.meta.url), 'utf8');

test('six-month inactivity suspension preserves accounts and is atomic, auditable and recoverable by Admin', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table profiles(id uuid primary key, name text, role text, account_status text, verification_status text,
      verified_at timestamptz, verification_acknowledged boolean, last_active_at timestamptz,
      created_at timestamptz default now(), updated_at timestamptz, address text);
    create table notifications(user_id uuid references profiles(id),type text,title text,message text,link text);
    create table orders(id int primary key, buyer_id uuid references profiles(id), status text, amount numeric);
    insert into profiles(id,name,role,account_status,verification_status,last_active_at,created_at) values
      ('${admin}','Admin','admin','active',null,'2020-01-01','2020-01-01'),
      ('${buyer}','Buyer','buyer','active',null,'2026-04-19 04:00:00+00','2026-01-01'),
      ('${farmer}','Farmer','farmer','active','verified','2026-04-20','2026-01-01'),
      ('${stakeholder}','Organization','stakeholder','active','verified',null,'2026-04-19 04:00:00+00');
    insert into orders values(1,'${buyer}','confirmed',201);`);
  await db.exec(historyMigration);
  await db.exec(migration);
  await db.exec(migration);
  const row = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const sweep = async (time = '2026-10-19 04:00:00+00', user = null) => (await db.query('select * from suspend_inactive_accounts($1,$2)', [user,time])).rows;
  const reactivate = (user) => row("select * from manage_admin_account($1,$2,'account','active',null,'suspended')", [admin,user]);

  await t.test('migration does not immediately suspend or rewrite existing users', async () => {
    assert.equal((await row("select count(*)::int as count from profiles where account_status='active'")).count, 4);
    assert.equal((await row('select count(*)::int as count from account_admin_events')).count, 0);
  });
  await t.test('exact boundary suspends Buyer and never-active Stakeholder, but not recent Farmer or Admin', async () => {
    assert.deepEqual(await sweep('2026-10-19 03:59:59+00'), []);
    const ids = (await sweep()).map((value) => value.user_id).sort();
    assert.deepEqual(ids, [buyer, stakeholder].sort());
    assert.equal((await row('select account_status from profiles where id=$1',[admin])).account_status, 'active');
    assert.equal((await row('select account_status from profiles where id=$1',[farmer])).account_status, 'active');
    assert.equal((await row('select last_active_at from profiles where id=$1',[stakeholder])).last_active_at, null);
    assert.ok((await row('select inactivity_suspended_at from profiles where id=$1',[buyer])).inactivity_suspended_at);
  });
  await t.test('system history and notifications are written once; order and verification data stay intact', async () => {
    const events = (await db.query('select * from account_admin_events')).rows;
    assert.equal(events.length, 2);
    for (const event of events) {
      assert.equal(event.admin_id, null);
      assert.equal(event.action, 'USER_AUTO_SUSPENDED');
      assert.equal(event.reason, 'Six months of inactivity.');
    }
    assert.equal((await row('select count(*)::int as count from notifications')).count, 4);
    assert.deepEqual(await sweep(), []);
    assert.equal((await row('select count(*)::int as count from account_admin_events')).count, 2);
    assert.equal((await row('select status,amount from orders')).status, 'confirmed');
    assert.equal(Number((await row('select amount from orders')).amount), 201);
    assert.equal((await row('select verification_status from profiles where id=$1',[stakeholder])).verification_status, 'verified');
  });
  await t.test('Admin reactivation clears suspension and grants six new months without faking user activity', async () => {
    const lastActive = (await row('select last_active_at from profiles where id=$1',[buyer])).last_active_at;
    const active = await reactivate(buyer);
    assert.equal(active.account_status, 'active');
    assert.equal(active.inactivity_suspended_at, null);
    assert.deepEqual(active.last_active_at, lastActive);
    const { deadline, just_before: justBefore } = await row("select occurred_at + interval '6 months' as deadline, occurred_at + interval '6 months' - interval '1 second' as just_before from account_admin_events where user_id=$1 and action='USER_REACTIVATED' order by occurred_at desc limit 1", [buyer]);
    assert.deepEqual(await sweep(justBefore, buyer), []);
    assert.deepEqual(await sweep(deadline, buyer), [{ user_id: buyer }]);
    assert.equal((await row('select count(*)::int as count from orders')).count, 1);
  });
  await t.test('Farmer eligibility uses last activity, not profile age, and month ends clamp correctly in leap years', async () => {
    await db.query("update profiles set last_active_at='2026-08-31 10:00:00+00' where id=$1", [farmer]);
    assert.deepEqual(await sweep('2027-02-28 09:59:59+00', farmer), []);
    assert.deepEqual(await sweep('2027-02-28 10:00:00+00', farmer), [{ user_id: farmer }]);
    await reactivate(farmer);
    await db.query("delete from account_admin_events where user_id=$1", [farmer]);
    await db.query("update profiles set last_active_at='2027-08-31 10:00:00+00' where id=$1", [farmer]);
    assert.deepEqual(await sweep('2028-02-28 10:00:00+00', farmer), []);
    assert.deepEqual(await sweep('2028-02-29 10:00:00+00', farmer), [{ user_id: farmer }]);
  });
  await t.test('failed audit or notification insert rolls back suspension and cannot leave partial history', async () => {
    await reactivate(farmer);
    await db.query("delete from account_admin_events where user_id=$1", [farmer]);
    await db.query("update profiles set last_active_at='2020-01-01' where id=$1", [farmer]);
    await db.exec("alter table account_admin_events add constraint reject_auto check(action <> 'USER_AUTO_SUSPENDED') not valid");
    await assert.rejects(sweep(undefined, farmer), { code: '23514' });
    assert.equal((await row('select account_status from profiles where id=$1',[farmer])).account_status, 'active');
    await db.exec('alter table account_admin_events drop constraint reject_auto');
    await db.exec("alter table notifications add constraint reject_notice check(title <> 'Account suspended for inactivity') not valid");
    await assert.rejects(sweep(undefined, farmer), { code: '23514' });
    assert.equal((await row('select account_status from profiles where id=$1',[farmer])).account_status, 'active');
    assert.equal((await row('select count(*)::int as count from account_admin_events where user_id=$1',[farmer])).count, 0);
    await db.exec('alter table notifications drop constraint reject_notice');
  });
  await t.test('competing sweeps create only one suspension and one history event', async () => {
    const results = await Promise.all([sweep(undefined, farmer), sweep(undefined, farmer)]);
    assert.equal(results.flat().length, 1);
    assert.equal((await row("select count(*)::int as count from account_admin_events where user_id=$1 and action='USER_AUTO_SUSPENDED'", [farmer])).count, 1);
  });
  await t.test('browser roles cannot invoke the sweep or forge activity, role, registration date or account status', async () => {
    for (const role of ['anon','authenticated']) {
      assert.equal((await row("select has_function_privilege($1,'suspend_inactive_accounts(uuid,timestamptz)','execute') as allowed",[role])).allowed, false);
    }
    await db.exec('grant select,update,insert on profiles to authenticated');
    for (const patch of ["last_active_at=now()", "role='admin'", "created_at=now()", "account_status='active'", 'inactivity_suspended_at=null']) {
      await db.exec('set role authenticated');
      await assert.rejects(db.query(`update profiles set ${patch} where id=$1`,[buyer]), { code:'42501' });
      await db.exec('reset role');
    }
    await db.exec('set role authenticated');
    await db.query("update profiles set address='Updated address' where id=$1", [buyer]);
    await assert.rejects(db.query("insert into profiles(id,role,account_status) values(gen_random_uuid(),'admin','active')"), { code:'42501' });
    await db.exec('reset role');
    assert.equal((await row('select address from profiles where id=$1',[buyer])).address, 'Updated address');
  });
  await t.test('recent activity, future timestamps and manual suspensions are not overwritten', async () => {
    const future = '50000000-0000-4000-8000-000000000001';
    const manual = '60000000-0000-4000-8000-000000000001';
    await db.query("insert into profiles(id,name,role,account_status,last_active_at,created_at) values($1,'Future','buyer','active','2035-01-01','2020-01-01'),($2,'Manual','buyer','suspended','2020-01-01','2020-01-01')", [future,manual]);
    assert.deepEqual(await sweep(undefined, future), []);
    assert.deepEqual(await sweep(undefined, manual), []);
    assert.equal((await row('select inactivity_suspended_at from profiles where id=$1',[manual])).inactivity_suspended_at, null);
    await db.query("update profiles set last_active_at='2026-10-18' where id=$1", [future]);
    assert.deepEqual(await sweep(undefined, future), []);
  });
  await t.test('six months at Philippine midnight clamps to the local end of February', async () => {
    const local = '70000000-0000-4000-8000-000000000001';
    await db.query("insert into profiles(id,name,role,account_status,last_active_at,created_at) values($1,'Local','buyer','active','2026-08-31T00:30:00+08:00','2020-01-01')", [local]);
    assert.deepEqual(await sweep('2027-02-28T00:29:59+08:00', local), []);
    assert.deepEqual(await sweep('2027-02-28T00:30:00+08:00', local), [{ user_id:local }]);
  });
});
