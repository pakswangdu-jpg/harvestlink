import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const farmer = '10000000-0000-0000-0000-000000000001';
const buyer = '20000000-0000-0000-0000-000000000001';
const product = '30000000-0000-0000-0000-000000000001';
const first = '40000000-0000-0000-0000-000000000001';
const second = '40000000-0000-0000-0000-000000000002';
const migration = await readFile(new URL('../../supabase/migrations/20261010_order_integrity.sql', import.meta.url), 'utf8');

test('marketplace order decisions are atomic and protect stock', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table profiles(id uuid primary key, account_status text);
    create table products(id uuid primary key, quantity numeric check(quantity >= 0), status text, price_review jsonb, expiration_date date, updated_at timestamptz);
    create table orders(id uuid primary key, buyer_id uuid, farmer_id uuid, product_id uuid, quantity numeric,
      status text, delivery_status text, current_lat numeric, current_lng numeric, location_updated_at timestamptz, updated_at timestamptz);
    create table order_delivery_events(order_id uuid, status text, title text, description text, source text);
    insert into profiles values ('${farmer}','active'),('${buyer}','active');
    insert into products(id,quantity,status) values('${product}',10,'active');
    insert into orders(id,buyer_id,farmer_id,product_id,quantity,status,delivery_status) values
      ('${first}','${buyer}','${farmer}','${product}',7,'pending','pending'),
      ('${second}','${buyer}','${farmer}','${product}',7,'pending','pending');`);
  await db.exec(migration);
  await db.exec(migration);
  const row = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const act = (id, actor, action, reason = null) => row('select * from transition_marketplace_order($1,$2,$3,$4)', [actor, id, action, reason]);
  const stock = async () => Number((await row('select quantity from products')).quantity);

  await t.test('competing confirmations cannot oversell or apply twice', async () => {
    const results = await Promise.allSettled([act(first, farmer, 'confirmed'), act(second, farmer, 'confirmed')]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(await stock(), 3);
    await assert.rejects(act(first, farmer, 'confirmed'), { code: '23514' });
    assert.equal(await stock(), 3);
    assert.equal((await row('select status from orders where id=$1', [second])).status, 'pending');
  });
  await t.test('cancellation restores confirmed stock once and records the reason', async () => {
    const cancelled = await act(first, buyer, 'cancelled', 'Ordered by mistake');
    assert.equal(cancelled.cancellation_reason, 'Ordered by mistake');
    assert.equal(await stock(), 10);
    await assert.rejects(act(first, buyer, 'cancelled'), { code: '23514' });
    assert.equal(await stock(), 10);
  });
  await t.test('wrong parties, suspended accounts and in-transit cancellations are blocked', async () => {
    await assert.rejects(act(second, buyer, 'confirmed'), { code: '42501' });
    await db.query("update profiles set account_status='suspended' where id=$1", [farmer]);
    await assert.rejects(act(second, farmer, 'confirmed'), { code: '42501' });
    await db.query("update profiles set account_status='active' where id=$1", [farmer]);
    await act(second, farmer, 'confirmed');
    await db.query("update orders set delivery_status='preparing' where id=$1", [second]);
    await assert.rejects(act(second, buyer, 'cancelled'), { code: '23514' });
    assert.equal(await stock(), 3);
  });
  await t.test('history write failure rolls back stock and order status together', async () => {
    await db.query("update orders set status='pending',delivery_status='pending' where id=$1", [second]);
    await db.exec("update products set quantity=10; alter table order_delivery_events add constraint reject_confirm check(status <> 'confirmed') not valid;");
    await assert.rejects(act(second, farmer, 'confirmed'), { code: '23514' });
    assert.equal(await stock(), 10);
    assert.equal((await row('select status from orders where id=$1', [second])).status, 'pending');
    await db.exec('alter table order_delivery_events drop constraint reject_confirm');
  });
  await t.test('expired stock cannot be confirmed and rejection does not change stock', async () => {
    await db.exec("update products set expiration_date='2020-01-01'");
    await assert.rejects(act(second, farmer, 'confirmed'), { code: '23514' });
    assert.equal((await act(second, farmer, 'rejected', 'Cannot fulfill')).rejection_reason, 'Cannot fulfill');
    assert.equal(await stock(), 10);
  });
  await t.test('checkout request uniqueness is scoped to the buyer', async () => {
    const key = '50000000-0000-4000-8000-000000000001';
    await db.query('update orders set checkout_key=$1 where id=$2', [key, first]);
    await assert.rejects(db.query('update orders set checkout_key=$1 where id=$2', [key, second]), { code: '23505' });
  });
  await t.test('only service role can execute stock decisions', async () => {
    for (const role of ['anon', 'authenticated']) {
      const result = await row("select has_function_privilege($1,'transition_marketplace_order(uuid,uuid,text,text)','execute') as allowed", [role]);
      assert.equal(result.allowed, false);
    }
  });
});
