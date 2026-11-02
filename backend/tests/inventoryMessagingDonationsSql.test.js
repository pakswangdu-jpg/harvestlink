import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const farmer = '10000000-0000-0000-0000-000000000001';
const buyer = '20000000-0000-0000-0000-000000000001';
const stakeholder = '20000000-0000-0000-0000-000000000002';
const product = '30000000-0000-0000-0000-000000000001';
const migration = await readFile(new URL('../../supabase/migrations/20261030_inventory_messaging_donations.sql', import.meta.url), 'utf8');
const traceabilityMigration = await readFile(new URL('../../supabase/migrations/20261031_traceability_context.sql', import.meta.url), 'utf8');
const unifiedMessagingMigration = await readFile(new URL('../../supabase/migrations/20261101_unified_listing_messaging.sql', import.meta.url), 'utf8');
const productInventoryRealtimeMigration = await readFile(new URL('../../supabase/migrations/20261103_product_inventory_realtime.sql', import.meta.url), 'utf8');
const confirmedOrderCancellationMigration = await readFile(new URL('../../supabase/migrations/20261104_prevent_confirmed_order_cancellation.sql', import.meta.url), 'utf8');

const baseSchema = `
  create function gen_random_uuid() returns uuid language sql volatile as $func$
    select ('00000000-0000-4000-8000-' || lpad(substr(md5(clock_timestamp()::text || random()::text), 1, 12), 12, '0'))::uuid;
  $func$;
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $func$
    select null::uuid;
  $func$;
  create table profiles(
    id uuid primary key, name text, role text, account_status text,
    verification_status text, organization_name text, avatar_url text,
    farm_name text, gcash_account_name text, gcash_qr_url text
  );
  create table products(
    id uuid primary key, farmer_id uuid, name text, unit text, price numeric,
    cost_price numeric, quantity numeric, location text, image_url text,
    description text, status text, selling_type text, moq numeric, wholesale_price numeric,
    wholesale_min_quantity numeric, price_review jsonb, expiration_date date,
    updated_at timestamptz
  );
  create table orders(
    id uuid primary key default gen_random_uuid(), product_id uuid,
    product_name text, product_image_url text, unit text, unit_price numeric,
    unit_cost_price numeric, farmer_id uuid, farmer_name text,
    farmer_avatar_url text, farmer_farm_name text, farmer_verification_status text,
    buyer_id uuid, buyer_name text, buyer_avatar_url text, quantity numeric,
    delivery_fee numeric, delivery_distance_km numeric, delivery_duration_minutes numeric,
    delivery_fee_tier text, total_amount numeric, checkout_key uuid,
    checkout_fingerprint text, message text, payment_method text,
    payment_status text, delivery_method text, delivery_status text,
    origin_municipality text, delivery_municipality text, status text,
    stock_state text, cancellation_reason text, rejection_reason text,
    current_lat numeric, current_lng numeric, location_updated_at timestamptz,
    paid_at timestamptz, created_at timestamptz, updated_at timestamptz
  );
  create table order_delivery_events(order_id uuid, status text, title text, description text, source text);
  create table messages(id uuid primary key default gen_random_uuid(), order_id uuid, recipient_id uuid,
    sender_id uuid, sender_name text, sender_role text, text text, message_type text not null default 'text',
    read boolean default false, created_at timestamptz);
  create table notifications(id uuid default gen_random_uuid(), user_id uuid, type text, title text, message text, link text);
  create table donations(
    id uuid primary key default gen_random_uuid(), product_id uuid, product_name text,
    unit text, quantity numeric, location text, image_url text, expiration_date date,
    farmer_id uuid, farmer_name text, restore_status text,
    status text, requested_by_id uuid, requested_by_name text, pickup_date date,
    rated boolean default false, created_at timestamptz default now(), updated_at timestamptz default now()
  );
  insert into profiles(id, name, role, account_status, verification_status, organization_name)
    values('${farmer}', 'Farmer', 'farmer', 'active', 'verified', null),
      ('${buyer}', 'Buyer', 'buyer', 'active', null, null),
      ('${stakeholder}', 'Food Bank', 'stakeholder', 'active', 'verified', 'Food Bank');
  insert into products(id, farmer_id, name, unit, price, quantity, location, description, status, selling_type)
    values('${product}', '${farmer}', 'Cabbage', 'kg', 50, 10, 'Cebu City', 'Fresh cabbage for donation.', 'active', 'retail');
  insert into messages(recipient_id, sender_id, sender_name, sender_role, text)
    values('${farmer}', '${buyer}', 'Buyer', 'buyer', 'Existing direct thread');
`;

test('inventory reservations, product context columns, and donation claims are atomic', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(baseSchema);
  await db.exec(migration);
  await db.exec(migration);
  await db.exec(productInventoryRealtimeMigration);
  await db.exec(productInventoryRealtimeMigration);
  await db.exec(traceabilityMigration);
  await db.exec(traceabilityMigration);
  await db.exec(unifiedMessagingMigration);
  await db.exec(unifiedMessagingMigration);
  await db.exec(confirmedOrderCancellationMigration);
  await db.exec(confirmedOrderCancellationMigration);

  const row = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const migratedThread = await row('select conversation_id from messages where text=$1', ['Existing direct thread']);
  assert.ok(migratedThread.conversation_id);
  const orderPayload = (key, quantity = 4) => ({
    product_id: product, quantity, unit_price: 50, delivery_fee: 0, total_amount: quantity * 50,
    checkout_key: key, checkout_fingerprint: `fingerprint-${key}`, message: '',
    payment_method: 'cod', delivery_method: 'buyer_pickup', delivery_status: 'pending',
    origin_municipality: 'Cebu City', delivery_municipality: 'Cebu City', created_at: new Date().toISOString(),
  });

  await t.test('checkout reserves once, idempotent retries do not double reserve, and rejection releases', async () => {
    const key = '40000000-0000-4000-8000-000000000001';
    const created = await row('select * from create_marketplace_order($1,$2::jsonb)', [buyer, JSON.stringify(orderPayload(key))]);
    assert.equal(created.stock_state, 'reserved');
    assert.equal(Number((await row('select quantity from products where id=$1', [product])).quantity), 6);
    assert.equal(Number((await row('select reserved_quantity from products where id=$1', [product])).reserved_quantity), 4);
    const retry = await row('select * from create_marketplace_order($1,$2::jsonb)', [buyer, JSON.stringify(orderPayload(key))]);
    assert.equal(retry.id, created.id);
    assert.equal(Number((await row('select quantity from products where id=$1', [product])).quantity), 6);
    const released = await row('select * from transition_marketplace_order($1,$2,$3,$4)', [farmer, created.id, 'rejected', 'Not available']);
    assert.equal(released.stock_state, 'released');
    assert.equal(Number((await row('select quantity from products where id=$1', [product])).quantity), 10);
    assert.equal(Number((await row('select reserved_quantity from products where id=$1', [product])).reserved_quantity), 0);
    await assert.rejects(
      row('select * from transition_marketplace_order($1,$2,$3,$4)', [farmer, created.id, 'rejected', null]),
      { code: '23514' },
    );
  });

  await t.test('completion moves a reservation into sold stock', async () => {
    const key = '40000000-0000-4000-8000-000000000002';
    const created = await row('select * from create_marketplace_order($1,$2::jsonb)', [buyer, JSON.stringify(orderPayload(key))]);
    await row('select * from transition_marketplace_order($1,$2,$3,$4)', [farmer, created.id, 'confirmed', null]);
    const completed = await row('select * from complete_marketplace_order($1,$2,$3,$4)', [buyer, created.id, 'picked_up', 'paid']);
    assert.equal(completed.stock_state, 'sold');
    assert.equal(completed.status, 'completed');
    assert.equal(Number((await row('select reserved_quantity from products where id=$1', [product])).reserved_quantity), 0);
    assert.equal(Number((await row('select sold_quantity from products where id=$1', [product])).sold_quantity), 4);
  });

  await t.test('competing orders reserve a single remaining unit only once', async () => {
    await db.query('update products set quantity = 1, reserved_quantity = 0, sold_quantity = 0, status = $2 where id = $1', [product, 'active']);
    const before = Number((await row('select count(*) as count from orders where product_id = $1', [product])).count);
    const attempts = await Promise.allSettled([
      db.query('select * from create_marketplace_order($1,$2::jsonb)', [buyer, JSON.stringify(orderPayload('40000000-0000-4000-8000-000000000003', 1))]),
      db.query('select * from create_marketplace_order($1,$2::jsonb)', [stakeholder, JSON.stringify(orderPayload('40000000-0000-4000-8000-000000000004', 1))]),
    ]);
    assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
    assert.equal(attempts.filter((attempt) => attempt.status === 'rejected').length, 1);
    assert.equal(Number((await row('select quantity from products where id = $1', [product])).quantity), 0);
    assert.equal(Number((await row('select reserved_quantity from products where id = $1', [product])).reserved_quantity), 1);
    assert.equal(Number((await row('select count(*) as count from orders where product_id = $1', [product])).count), before + 1);
    const inventoryEvent = await row('select quantity, status from product_inventory_events where product_id = $1 order by recorded_at desc, id desc limit 1', [product]);
    assert.equal(Number(inventoryEvent.quantity), 0);
    assert.equal(inventoryEvent.status, 'inactive');
  });

  await t.test('multiple simultaneous requests cannot reserve the same final unit', async () => {
    await db.query('update products set quantity = 1, reserved_quantity = 0, sold_quantity = 0, status = $2 where id = $1', [product, 'active']);
    const attempts = await Promise.all([
      buyer,
      stakeholder,
      buyer,
      stakeholder,
    ].map((actor, index) => db.query(
      'select * from create_marketplace_order($1,$2::jsonb)',
      [actor, JSON.stringify(orderPayload(`40000000-0000-4000-8000-${String(index + 11).padStart(12, '0')}`, 1))],
    ).then(
      (result) => ({ status: 'fulfilled', result }),
      (reason) => ({ status: 'rejected', reason }),
    )));
    assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
    assert.equal(attempts.filter((attempt) => attempt.status === 'rejected').length, 3);
    assert.equal(Number((await row('select quantity from products where id = $1', [product])).quantity), 0);
    assert.equal(Number((await row('select reserved_quantity from products where id = $1', [product])).reserved_quantity), 1);
  });

  await t.test('multiple competing orders and partial stock cannot oversell', async () => {
    await db.query('update products set quantity = 5, reserved_quantity = 0, sold_quantity = 0, status = $2 where id = $1', [product, 'active']);
    const attempts = await Promise.allSettled([
      db.query('select * from create_marketplace_order($1,$2::jsonb)', [buyer, JSON.stringify(orderPayload('40000000-0000-4000-8000-000000000005', 3))]),
      db.query('select * from create_marketplace_order($1,$2::jsonb)', [stakeholder, JSON.stringify(orderPayload('40000000-0000-4000-8000-000000000006', 3))]),
    ]);
    assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
    assert.equal(Number((await row('select quantity from products where id = $1', [product])).quantity), 2);

    await db.query('update products set quantity = 2, reserved_quantity = 0, sold_quantity = 0, status = $2 where id = $1', [product, 'active']);
    const before = Number((await row('select count(*) as count from orders where product_id = $1', [product])).count);
    await assert.rejects(
      row('select * from create_marketplace_order($1,$2::jsonb)', [buyer, JSON.stringify(orderPayload('40000000-0000-4000-8000-000000000007', 3))]),
      { code: '23514' },
    );
    assert.equal(Number((await row('select count(*) as count from orders where product_id = $1', [product])).count), before);
    assert.equal(Number((await row('select quantity from products where id = $1', [product])).quantity), 2);
  });

  await t.test('positive fractional quantities reserve and release correctly', async () => {
    await db.query('update products set quantity = 1, reserved_quantity = 0, sold_quantity = 0, status = $2 where id = $1', [product, 'active']);
    const created = await row('select * from create_marketplace_order($1,$2::jsonb)', [
      buyer,
      JSON.stringify(orderPayload('40000000-0000-4000-8000-000000000010', 0.5)),
    ]);
    assert.equal(Number(created.quantity), 0.5);
    assert.equal(Number((await row('select quantity from products where id = $1', [product])).quantity), 0.5);
    await row('select * from transition_marketplace_order($1,$2,$3,$4)', [farmer, created.id, 'rejected', 'Not available']);
    assert.equal(Number((await row('select quantity from products where id = $1', [product])).quantity), 1);
  });

  await t.test('zero stock is rejected and cancellation releases its reservation once', async () => {
    await db.query('update products set quantity = 0, reserved_quantity = 0, sold_quantity = 0, status = $2 where id = $1', [product, 'inactive']);
    await assert.rejects(
      row('select * from create_marketplace_order($1,$2::jsonb)', [buyer, JSON.stringify(orderPayload('40000000-0000-4000-8000-000000000008', 1))]),
      { code: '23514' },
    );

    await db.query('update products set quantity = 2, status = $2 where id = $1', [product, 'active']);
    const created = await row('select * from create_marketplace_order($1,$2::jsonb)', [buyer, JSON.stringify(orderPayload('40000000-0000-4000-8000-000000000009', 2))]);
    const cancelled = await row('select * from transition_marketplace_order($1,$2,$3,$4)', [buyer, created.id, 'cancelled', 'Changed my mind']);
    assert.equal(cancelled.stock_state, 'released');
    assert.equal(Number((await row('select quantity from products where id = $1', [product])).quantity), 2);
    await assert.rejects(
      row('select * from transition_marketplace_order($1,$2,$3,$4)', [buyer, created.id, 'cancelled', null]),
      { code: '23514' },
    );
    assert.equal(Number((await row('select quantity from products where id = $1', [product])).quantity), 2);
  });

  await t.test('a buyer cannot cancel after farmer confirmation', async () => {
    await db.query('update products set quantity = 5, reserved_quantity = 0, sold_quantity = 0, status = $2 where id = $1', [product, 'active']);
    const created = await row('select * from create_marketplace_order($1,$2::jsonb)', [
      buyer,
      JSON.stringify(orderPayload('40000000-0000-4000-8000-000000000016', 2)),
    ]);
    const confirmed = await row('select * from transition_marketplace_order($1,$2,$3,$4)', [farmer, created.id, 'confirmed', null]);
    assert.equal(confirmed.status, 'confirmed');
    assert.equal(confirmed.delivery_status, 'pending');
    await assert.rejects(
      row('select * from transition_marketplace_order($1,$2,$3,$4)', [buyer, created.id, 'cancelled', 'Changed my mind']),
      { code: '23514', message: /Only pending orders can be cancelled/ },
    );
    const unchanged = await row('select status, stock_state from orders where id = $1', [created.id]);
    assert.equal(unchanged.status, 'confirmed');
    assert.equal(unchanged.stock_state, 'reserved');
    assert.equal(Number((await row('select quantity from products where id = $1', [product])).quantity), 3);
    assert.equal(Number((await row('select reserved_quantity from products where id = $1', [product])).reserved_quantity), 2);
  });

  await t.test('concurrent confirmation and cancellation leave stock in one valid state', async () => {
    await db.query('update products set quantity = 1, reserved_quantity = 0, sold_quantity = 0, status = $2 where id = $1', [product, 'active']);
    const created = await row('select * from create_marketplace_order($1,$2::jsonb)', [
      buyer,
      JSON.stringify(orderPayload('40000000-0000-4000-8000-000000000015', 1)),
    ]);
    const transitions = await Promise.allSettled([
      row('select * from transition_marketplace_order($1,$2,$3,$4)', [farmer, created.id, 'confirmed', null]),
      row('select * from transition_marketplace_order($1,$2,$3,$4)', [buyer, created.id, 'cancelled', null]),
    ]);
    assert.ok(transitions.filter((transition) => transition.status === 'fulfilled').length >= 1);
    const state = await row('select quantity, reserved_quantity from products where id = $1', [product]);
    const finalOrder = await row('select status, stock_state from orders where id = $1', [created.id]);
    if (finalOrder.status === 'cancelled') {
      assert.equal(finalOrder.stock_state, 'released');
      assert.equal(Number(state.quantity), 1);
      assert.equal(Number(state.reserved_quantity), 0);
    } else {
      assert.equal(finalOrder.status, 'confirmed');
      assert.equal(finalOrder.stock_state, 'reserved');
      assert.equal(Number(state.quantity), 0);
      assert.equal(Number(state.reserved_quantity), 1);
    }
    assert.equal(Number(state.quantity) + Number(state.reserved_quantity), 1);
  });

  await t.test('donation claims enforce quantity, preserve claim history, and expire', async () => {
    await db.query('update products set quantity = 6, status = $2 where id = $1', [product, 'active']);
    const donation = await row('select * from create_surplus_donation($1,$2,$3)', [farmer, product, new Date(Date.now() + 86400000).toISOString()]);
    assert.equal(Number(donation.available_quantity), 6);
    assert.equal(donation.description, 'Fresh cabbage for donation.');
    const claim = await row('select * from claim_surplus_donation($1,$2,$3)', [stakeholder, donation.id, 2]);
    assert.equal(Number(claim.quantity), 2);
    assert.equal(Number((await row('select available_quantity from donations where id=$1', [donation.id])).available_quantity), 4);
    const claimEvent = await row('select conversation_id, sender_id, recipient_id, message_type, context_donation_id, context_donation_description from messages where context_donation_id=$1', [donation.id]);
    assert.deepEqual(claimEvent, {
      conversation_id: claimEvent.conversation_id,
      sender_id: stakeholder,
      recipient_id: farmer,
      message_type: 'system',
      context_donation_id: donation.id,
      context_donation_description: 'Fresh cabbage for donation.',
    });
    assert.ok(claimEvent.conversation_id);
    await assert.rejects(row('select * from claim_surplus_donation($1,$2,$3)', [stakeholder, donation.id, 5]), { code: '23514' });
    await assert.rejects(row('select * from claim_surplus_donation($1,$2,$3)', [stakeholder, donation.id, 1]), { code: '23505' });
    await row('select * from transition_surplus_donation_claim($1,$2,$3,$4)', [farmer, claim.id, 'reject', null]);
    assert.equal(Number((await row('select available_quantity from donations where id=$1', [donation.id])).available_quantity), 6);
    assert.equal(Number((await row('select count(*) as count from messages where context_donation_id=$1', [donation.id])).count), 2);
    await db.query('update donations set expiration_at = now() - interval \'1 minute\' where id = $1', [donation.id]);
    assert.equal(Number((await row('select expire_donations()')).expire_donations), 1);
    await assert.rejects(row('select * from claim_surplus_donation($1,$2,$3)', [stakeholder, donation.id, 1]), { code: '23514' });

    await db.query('update products set quantity = 3, status = $2 where id = $1', [product, 'active']);
    const handoff = await row('select * from create_surplus_donation($1,$2,$3)', [farmer, product, new Date(Date.now() + 86400000).toISOString()]);
    const handoffClaim = await row('select * from claim_surplus_donation($1,$2,$3)', [stakeholder, handoff.id, 2]);
    const today = (await row("select (now() at time zone 'Asia/Manila')::date as today")).today;
    await row('select * from transition_surplus_donation_claim($1,$2,$3,$4)', [farmer, handoffClaim.id, 'schedule', today]);
    const received = await row('select * from transition_surplus_donation_claim($1,$2,$3,$4)', [stakeholder, handoffClaim.id, 'receive', null]);
    assert.equal(received.status, 'completed');
    const rated = await row('select * from transition_surplus_donation_claim($1,$2,$3,$4)', [stakeholder, handoffClaim.id, 'rate', null]);
    assert.equal(rated.rated, true);
    assert.equal(Number((await row('select count(*) as count from messages where context_donation_id=$1', [handoff.id])).count), 3);
    const withdrawn = await row('select * from withdraw_surplus_donation($1,$2)', [farmer, handoff.id]);
    assert.equal(withdrawn.status, 'cancelled');
    assert.equal(Number((await row('select quantity from products where id=$1', [product])).quantity), 1);
  });

  await t.test('browser roles cannot execute privileged inventory or donation functions', async () => {
    const privileges = await row(`select has_function_privilege($1, 'create_marketplace_order(uuid,jsonb)', 'execute') as order_write,
      has_function_privilege($1, 'claim_surplus_donation(uuid,uuid,numeric)', 'execute') as donation_write`, ['authenticated']);
    assert.deepEqual(privileges, { order_write: false, donation_write: false });
  });

  await t.test('messaging grants backend writes while keeping browser writes revoked', async () => {
    const privileges = await row(`select
      has_table_privilege('service_role', 'public.direct_conversations', 'select') as backend_conversation_read,
      has_table_privilege('service_role', 'public.direct_conversations', 'insert') as backend_conversation_write,
      has_table_privilege('service_role', 'public.messages', 'select') as backend_message_read,
      has_table_privilege('service_role', 'public.messages', 'insert') as backend_message_write,
      has_table_privilege('authenticated', 'public.messages', 'select') as browser_message_read,
      has_table_privilege('authenticated', 'public.messages', 'insert') as browser_message_write,
      has_table_privilege('anon', 'public.messages', 'select') as anonymous_message_read`);
    assert.deepEqual(privileges, {
      backend_conversation_read: true,
      backend_conversation_write: true,
      backend_message_read: true,
      backend_message_write: true,
      browser_message_read: true,
      browser_message_write: false,
      anonymous_message_read: false,
    });
  });

  await t.test('traceability snapshots retain product and order identifiers', async () => {
    const columns = await db.query(`select column_name from information_schema.columns
      where table_name = 'messages' and column_name in ('context_product_category', 'context_product_farmer_name', 'context_product_quantity', 'context_order_id')
      order by column_name`);
    assert.deepEqual(columns.rows.map((entry) => entry.column_name), [
      'context_order_id', 'context_product_category', 'context_product_farmer_name', 'context_product_quantity',
    ]);

    const orderId = '40000000-0000-4000-8000-000000000001';
    await db.query(`insert into orders(id, product_id, product_name, unit, unit_price, farmer_id, farmer_name,
      buyer_id, buyer_name, quantity, total_amount, payment_method, delivery_method, delivery_status,
      origin_municipality, delivery_municipality, status)
      values($1, $2, 'Cabbage', 'kg', 50, $3, 'Farmer', $4, 'Buyer', 1, 50, 'cod', 'buyer_pickup', 'pending', 'Cebu City', 'Cebu City', 'pending')`,
    [orderId, product, farmer, buyer]);
    assert.equal((await row('select product_id_snapshot from orders where id=$1', [orderId])).product_id_snapshot, product);
    await db.query('update orders set product_id = null where id = $1', [orderId]);
    assert.equal((await row('select product_id_snapshot from orders where id=$1', [orderId])).product_id_snapshot, product);

    await db.query(`insert into messages(recipient_id, sender_id, sender_name, sender_role, text, context_product_id,
      context_product_category, context_product_farmer_id, context_product_farmer_name, context_product_quantity,
      context_product_status, context_order_id)
      values($1, $2, 'Buyer', 'buyer', 'Is this available?', $3, 'Vegetables', $4, 'Farmer', 10, 'active', $5)`,
    [farmer, buyer, product, farmer, orderId]);
    const snapshot = await row('select context_product_id, context_order_id, context_product_category from messages where context_product_id=$1', [product]);
    assert.deepEqual(snapshot, { context_product_id: product, context_order_id: orderId, context_product_category: 'Vegetables' });
  });
});
