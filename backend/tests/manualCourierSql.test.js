import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const farmer = '10000000-0000-0000-0000-000000000001';
const buyer = '20000000-0000-0000-0000-000000000001';
const admin = '30000000-0000-0000-0000-000000000001';
const orderId = '40000000-0000-0000-0000-000000000001';
const migration = await readFile(new URL('../../supabase/migrations/20261017_manual_lalamove.sql', import.meta.url), 'utf8');
const details = { booking_reference: 'PH-123', tracking_url: 'https://share.lalamove.com/?token=real-share-token', driver_name: null, vehicle_plate_number: null };

test('manual Lalamove booking and physical handover use atomic, owner-only transitions', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table profiles(id uuid primary key, role text, account_status text);
    create table orders(id uuid primary key, buyer_id uuid, farmer_id uuid, delivery_method text,
      status text, delivery_status text, payment_method text, payment_status text,
      transit_started_at timestamptz, updated_at timestamptz, total_amount numeric default 201);
    create table deliveries(id uuid primary key default gen_random_uuid(), order_id uuid unique references orders(id),
      courier_company text, booking_reference text, tracking_url text, driver_name text,
      delivery_status text, lalamove_order_id text, created_at timestamptz default now(), updated_at timestamptz default now());
    create table order_delivery_events(order_id uuid, status text, title text, description text, source text);
    insert into profiles values ('${farmer}','farmer','active'),('${buyer}','buyer','active'),('${admin}','admin','active');
    insert into orders(id,buyer_id,farmer_id,delivery_method,status,delivery_status,payment_method,payment_status)
      values('${orderId}','${buyer}','${farmer}','courier','confirmed','packed','cod','pending');`);
  await db.exec(migration);
  await db.exec(migration);
  const row = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const act = (action, data = details, actor = farmer) => row('select manage_manual_courier($1,$2,$3,$4::jsonb) as result', [actor, orderId, action, JSON.stringify(data)]).then((value) => value.result);
  const reset = () => db.exec(`delete from order_delivery_events; delete from deliveries;
    update orders set status='confirmed',delivery_status='packed',delivery_method='courier',payment_method='cod',payment_status='pending',transit_started_at=null;
    update profiles set account_status='active';`);
  await t.test('booking keeps a packed order packed, creates one record and records no GPS or transit time', async () => {
    const saved = await act('book');
    assert.equal(saved.order.delivery_status, 'packed');
    assert.equal(saved.order.status, 'confirmed');
    assert.equal(saved.order.transit_started_at, null);
    assert.equal(saved.order.payment_status, 'pending');
    assert.equal(saved.order.total_amount, 201);
    assert.equal(saved.delivery.delivery_status, 'booked');
    assert.ok(saved.delivery.created_at);
    assert.equal(saved.delivery.lalamove_order_id, null);
    assert.equal((await row('select count(*)::int as count from order_delivery_events')).count, 1);
  });
  await t.test('duplicate or competing bookings cannot overwrite the original booking', async () => {
    await assert.rejects(act('book', { ...details, booking_reference: 'OTHER' }), { code: '23505' });
    assert.equal((await row('select booking_reference from deliveries')).booking_reference, 'PH-123');
    await reset();
    const attempts = await Promise.allSettled([act('book'), act('book')]);
    assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
    assert.equal((await row('select count(*)::int as count from deliveries')).count, 1);
  });
  await t.test('handover atomically starts both delivery records, timestamps the real event and is not repeatable', async () => {
    const saved = await act('handover');
    assert.equal(saved.order.delivery_status, 'out_for_delivery');
    assert.equal(saved.delivery.delivery_status, 'out_for_delivery');
    assert.ok(saved.order.transit_started_at);
    assert.equal(saved.delivery.handed_over_at, saved.order.transit_started_at);
    assert.equal(saved.order.status, 'confirmed');
    assert.equal(saved.order.payment_status, 'pending');
    await assert.rejects(act('handover'), { code: '23514' });
    assert.equal((await row("select count(*)::int as count from order_delivery_events where status='out_for_delivery'")).count, 1);
  });
  await t.test('edits preserve original booking and handover timestamps and delivery progress', async () => {
    const before = await row('select created_at from deliveries');
    const transit = await row('select transit_started_at from orders');
    const saved = await act('edit', { ...details, driver_name: 'Actual driver', vehicle_plate_number: 'abc 123' });
    assert.equal(saved.delivery.vehicle_plate_number, 'ABC 123');
    assert.equal(saved.delivery.delivery_status, 'out_for_delivery');
    assert.equal(new Date(saved.delivery.handed_over_at).getTime(), new Date(transit.transit_started_at).getTime());
    assert.equal(new Date(saved.delivery.created_at).getTime(), new Date(before.created_at).getTime());
    assert.equal(new Date(saved.order.transit_started_at).getTime(), new Date(transit.transit_started_at).getTime());
  });
  await t.test('existing Buyer receipt completion synchronizes courier status without new completion or payment rules', async () => {
    await db.exec("update orders set status='completed',delivery_status='delivered'");
    assert.equal((await row('select delivery_status from deliveries')).delivery_status, 'delivered');
    assert.equal((await row('select payment_status from orders')).payment_status, 'pending');
    await assert.rejects(act('edit'), { code: '23514' });
  });
  await t.test('Buyer, Admin, unrelated Farmer and suspended owner cannot book, edit or hand over', async () => {
    await reset();
    for (const actor of [buyer, admin, '10000000-0000-0000-0000-000000000099']) {
      for (const action of ['book', 'edit', 'handover']) await assert.rejects(act(action, details, actor), { code: '42501' });
    }
    await db.exec("update profiles set account_status='suspended'");
    await assert.rejects(act('book'), { code: '42501' });
    await reset();
  });
  await t.test('wrong method, unconfirmed and unpacked orders cannot book or hand over', async () => {
    for (const method of ['farmer_delivery', 'buyer_pickup']) {
      await db.query('update orders set delivery_method=$1', [method]);
      await assert.rejects(act('book'), { code: '23514' });
    }
    await reset();
    for (const stage of ['pending', 'preparing', 'delivered']) {
      await db.query('update orders set delivery_status=$1', [stage]);
      await assert.rejects(act('book'), { code: '23514' });
    }
    await reset();
    await db.exec("update orders set status='pending'");
    await assert.rejects(act('book'), { code: '23514' });
    await reset();
  });
  await t.test('required booking fields and official HTTPS URLs are enforced inside the transaction', async () => {
    for (const patch of [
      { booking_reference: '' }, { booking_reference: 'x'.repeat(101) },
      { tracking_url: 'http://share.lalamove.com/' }, { tracking_url: 'https://evil.test/' },
      { tracking_url: 'https://lalamove.com.evil.test/' }, { tracking_url: 'https://lalamove.com@evil.test/' },
      { tracking_url: 'https://share.lalamove.com/has a space' }, { tracking_url: null },
      { driver_name: 'x'.repeat(121) }, { vehicle_plate_number: '<script>' },
    ]) await assert.rejects(act('book', { ...details, ...patch }), { code: '23514' });
    assert.equal((await row('select count(*)::int as count from deliveries')).count, 0);
  });
  await t.test('payment gate remains unchanged, missing bookings cannot be handed over, and delivery cannot be fabricated', async () => {
    await assert.rejects(act('handover'), { code: 'P0002' });
    await db.exec("update orders set payment_method='gcash'");
    await assert.rejects(act('book'), { code: '23514' });
    await db.exec("update orders set payment_status='paid'");
    await act('book');
    await assert.rejects(act('delivered'), { code: '23514' });
    await db.exec("update orders set payment_status='pending'");
    await assert.rejects(act('handover'), { code: '23514' });
    await reset();
  });
  await t.test('failed history write rolls back both handover records and the timestamp', async () => {
    await act('book');
    await db.exec("alter table order_delivery_events add constraint fail_handover check(status <> 'out_for_delivery') not valid");
    await assert.rejects(act('handover'), { code: '23514' });
    assert.equal((await row('select delivery_status from orders')).delivery_status, 'packed');
    assert.equal((await row('select transit_started_at from orders')).transit_started_at, null);
    assert.equal((await row('select delivery_status from deliveries')).delivery_status, 'booked');
    assert.equal((await row('select handed_over_at from deliveries')).handed_over_at, null);
    await db.exec('alter table order_delivery_events drop constraint fail_handover');
  });
  await t.test('only the service role can execute the transition RPC', async () => {
    for (const role of ['anon', 'authenticated']) {
      const result = await row("select has_function_privilege($1,'manage_manual_courier(uuid,uuid,text,jsonb)','execute') as allowed", [role]);
      assert.equal(result.allowed, false);
    }
  });
});
