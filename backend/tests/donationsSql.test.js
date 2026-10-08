import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const farmer = '10000000-0000-0000-0000-000000000001';
const stakeholder = '20000000-0000-0000-0000-000000000001';
const other = '20000000-0000-0000-0000-000000000002';
const pending = '20000000-0000-0000-0000-000000000003';
const product = '30000000-0000-0000-0000-000000000001';
const migration = await readFile(new URL('../../supabase/migrations/20261009_shared_donations.sql', import.meta.url), 'utf8');

test('shared donation transaction lifecycle', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table profiles(id uuid primary key, name text, role text, account_status text,
      verification_status text, organization_name text);
    create table products(id uuid primary key, farmer_id uuid, name text, unit text, quantity numeric,
      location text, image_url text, expiration_date date, status text, price_review jsonb, updated_at timestamptz);
    create table notifications(id uuid default gen_random_uuid(), user_id uuid, type text, title text, message text, link text);
    insert into profiles values
      ('${farmer}', 'Farmer', 'farmer', 'active', 'verified', null),
      ('${stakeholder}', 'Recipient', 'stakeholder', 'active', 'verified', 'Food Bank'),
      ('${other}', 'Other recipient', 'stakeholder', 'active', 'verified', 'Other NGO'),
      ('${pending}', 'Pending', 'stakeholder', 'active', 'pending', 'Pending NGO');
  `);
  await db.exec(migration);
  await db.exec(migration);
  const row = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const newDonation = async (status = 'active') => {
    await db.query(`insert into products(id, farmer_id, name, unit, quantity, location, status)
      values($1,$2,'Cabbage','kg',10,'Cebu',$3) on conflict(id) do update
      set quantity = 10, status = excluded.status, expiration_date = null`, [product, farmer, status]);
    return row('select * from create_surplus_donation($1,$2)', [farmer, product]);
  };
  const act = (id, who, action, date = null) => row('select * from transition_surplus_donation($1,$2,$3,$4)', [who, id, action, date]);
  const today = (await row("select (now() at time zone 'Asia/Manila')::date::text as today")).today;
  let donation;

  await t.test('reserves real stock and notifies verified organizations', async () => {
    donation = await newDonation();
    assert.equal(donation.status, 'available');
    assert.equal(Number(donation.quantity), 10);
    const stock = await row('select * from products where id=$1', [product]);
    assert.equal(Number(stock.quantity), 0);
    assert.equal(stock.status, 'inactive');
    const notifications = (await db.query('select * from notifications')).rows;
    assert.equal(notifications.length, 2);
    assert.ok(notifications.every((notice) => notice.user_id !== pending));
    await assert.rejects(newDonationForWrongOwner(), { code: '42501' });
    async function newDonationForWrongOwner() {
      return row('select * from create_surplus_donation($1,$2)', [stakeholder, product]);
    }
    await assert.rejects(row('select * from create_surplus_donation($1,$2)', [farmer, product]), { code: '23514' });
  });

  await t.test('requires verification, takes identity from profiles, rejects a second claim', async () => {
    await assert.rejects(act(donation.id, pending, 'request'), { code: '42501' });
    const requested = await act(donation.id, stakeholder, 'request');
    assert.equal(requested.requested_by_id, stakeholder);
    assert.equal(requested.requested_by_name, 'Food Bank');
    await assert.rejects(act(donation.id, other, 'request'), { code: '23514' });
    await assert.rejects(act(donation.id, other, 'receive'), { code: '42501' });
    await assert.rejects(act(donation.id, stakeholder, 'receive'), { code: '23514' });
  });

  await t.test('only the farmer schedules, only the recipient confirms receipt', async () => {
    await assert.rejects(act(donation.id, other, 'schedule', today), { code: '42501' });
    await assert.rejects(act(donation.id, farmer, 'schedule'), { code: '22007' });
    await assert.rejects(act(donation.id, farmer, 'schedule', '2020-01-01'), { code: '22007' });
    assert.equal((await act(donation.id, farmer, 'schedule', today)).status, 'scheduled');
    assert.equal((await act(donation.id, stakeholder, 'receive')).status, 'completed');
    assert.equal((await act(donation.id, stakeholder, 'rate')).rated, true);
    await assert.rejects(act(donation.id, stakeholder, 'receive'), { code: '23514' });
    await assert.rejects(act(donation.id, farmer, 'cancel'), { code: '23514' });
    assert.equal(Number((await row('select quantity from products where id=$1', [product])).quantity), 0);
  });

  await t.test('decline releases the request, cancellation restores stock exactly once', async () => {
    const next = await newDonation();
    await act(next.id, stakeholder, 'request');
    const declined = await act(next.id, farmer, 'decline');
    assert.equal(declined.status, 'available');
    assert.equal(declined.requested_by_id, null);
    await act(next.id, other, 'request');
    await act(next.id, farmer, 'cancel');
    await assert.rejects(act(next.id, farmer, 'cancel'), { code: '23514' });
    const stock = await row('select * from products where id=$1', [product]);
    assert.equal(Number(stock.quantity), 10);
    assert.equal(stock.status, 'active');
  });

  await t.test('donation-only listings stay hidden when cancelled', async () => {
    const next = await newDonation('inactive');
    await act(next.id, farmer, 'cancel');
    assert.equal((await row('select status from products where id=$1', [product])).status, 'inactive');
  });

  await t.test('competing requests produce one recipient, not two successful claims', async () => {
    const next = await newDonation();
    const claims = await Promise.allSettled([act(next.id, stakeholder, 'request'), act(next.id, other, 'request')]);
    assert.equal(claims.filter((claim) => claim.status === 'fulfilled').length, 1);
    assert.equal(claims.find((claim) => claim.status === 'rejected').reason.code, '23514');
    await act(next.id, farmer, 'cancel');
  });

  await t.test('notification failure rolls back the entire stock reservation', async () => {
    await db.query('update products set quantity=10 where id=$1', [product]);
    const before = await row('select count(*)::int as count from donations');
    await db.exec("alter table notifications add constraint reject_test_notification check (title <> 'New surplus donation available') not valid");
    await assert.rejects(row('select * from create_surplus_donation($1,$2)', [farmer, product]), { code: '23514' });
    assert.equal(Number((await row('select quantity from products where id=$1', [product])).quantity), 10);
    assert.deepEqual(await row('select count(*)::int as count from donations'), before);
    await db.exec('alter table notifications drop constraint reject_test_notification');
  });

  await t.test('expired produce and suspended accounts cannot initiate a handoff', async () => {
    await db.query("update products set quantity=10, expiration_date='2020-01-01' where id=$1", [product]);
    await assert.rejects(row('select * from create_surplus_donation($1,$2)', [farmer, product]), { code: '23514' });
    const next = await newDonation();
    await db.query("update profiles set account_status='suspended' where id=$1", [stakeholder]);
    await assert.rejects(act(next.id, stakeholder, 'request'), { code: '42501' });
  });

  await t.test('browser roles cannot call privileged functions or read donation rows directly', async () => {
    for (const role of ['anon', 'authenticated']) {
      const rights = await row(`select has_function_privilege($1, 'create_surplus_donation(uuid,uuid)', 'execute') as create,
        has_function_privilege($1, 'transition_surplus_donation(uuid,uuid,text,date)', 'execute') as transition,
        has_table_privilege($1, 'donations', 'select') as read`, [role]);
      assert.deepEqual(rights, { create: false, transition: false, read: false });
    }
  });
});
