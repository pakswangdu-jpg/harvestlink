import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../../supabase/migrations/20261020_final_transaction_receipts.sql', import.meta.url), 'utf8');
test('final receipt queue is completion-only, durable, private and idempotent', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table orders(id uuid primary key default gen_random_uuid(),status text,payment_status text,
      payment_method text,payment_verification_status text,delivery_method text,delivery_status text);
    insert into orders(status,payment_status,payment_method,delivery_method,delivery_status)
      values('completed','paid','cod','farmer_delivery','delivered');`);
  await db.exec(migration);
  await db.exec(migration);
  const count = async () => Number((await db.query('select count(*) as n from order_receipt_emails')).rows[0].n);
  const insert = async (patch = {}) => {
    const row = { status: 'completed', payment_status: 'paid', payment_method: 'gcash', payment_verification_status: 'approved', delivery_method: 'courier', delivery_status: 'delivered', ...patch };
    return (await db.query('insert into orders(status,payment_status,payment_method,payment_verification_status,delivery_method,delivery_status) values($1,$2,$3,$4,$5,$6) returning *', Object.values(row))).rows[0];
  };
  await t.test('migration does not email or rewrite historical completions', async () => {
    assert.equal(await count(), 0);
    assert.equal((await db.query('select completed_at from orders')).rows[0].completed_at, null);
  });
  await t.test('pending payment, unverified GCash and ongoing delivery cannot queue a final paid receipt', async () => {
    for (const patch of [{ status: 'pending' }, { status: 'confirmed' }, { payment_status: 'pending' }, { payment_verification_status: 'pending' }, { payment_verification_status: null }, { delivery_status: 'out_for_delivery' }]) await insert(patch);
    assert.equal(await count(), 0);
  });
  let completed;
  await t.test('COD delivery and Buyer pickup queue only after payment and completion, exactly once', async () => {
    completed = await insert({ payment_method: 'cod', payment_verification_status: null });
    assert.ok(completed.completed_at);
    await db.query("update orders set status='completed',completed_at=now()+interval '1 day' where id=$1", [completed.id]);
    assert.deepEqual((await db.query('select completed_at from orders where id=$1', [completed.id])).rows[0].completed_at, completed.completed_at);
    assert.equal(await count(), 1);
    await insert({ delivery_method: 'buyer_pickup', delivery_status: 'picked_up' });
    assert.equal(await count(), 2);
  });
  await t.test('later payment approval can queue a completed transaction without altering its order state', async () => {
    const unpaid = await insert({ payment_verification_status: 'pending', payment_status: 'pending' });
    assert.equal(await count(), 2);
    await db.query("update orders set payment_status='paid',payment_verification_status='approved' where id=$1", [unpaid.id]);
    assert.equal(await count(), 3);
  });
  await t.test('multiple workers claim each row once; sent rows remain sent across later completion updates', async () => {
    const claims = await Promise.all([db.query('select * from claim_final_receipt_emails(10)'), db.query('select * from claim_final_receipt_emails(10)')]);
    const rows = claims.flatMap(result => result.rows);
    assert.equal(rows.length, 3);
    assert.equal(new Set(rows.map(row => row.order_id)).size, 3);
    await db.query("update order_receipt_emails set status='sent',sent_at=now() where order_id=$1", [completed.id]);
    await db.query("update orders set status='completed' where id=$1", [completed.id]);
    assert.equal((await db.query('select status from order_receipt_emails where order_id=$1', [completed.id])).rows[0].status, 'sent');
    assert.equal((await db.query('select * from claim_final_receipt_emails(10)')).rows.length, 0);
  });
  await t.test('expired leases recover, but ambiguous attempts beyond provider deduplication require review', async () => {
    await db.exec("update order_receipt_emails set locked_until=now()-interval '1 minute' where status='sending'");
    const recovered = (await db.query('select * from claim_final_receipt_emails(10)')).rows;
    assert.equal(recovered.length, 2);
    assert.ok(recovered.every(row => row.attempts === 2));
    await db.exec("update order_receipt_emails set locked_until=now()-interval '1 minute',first_attempt_at=now()-interval '25 hours' where status='sending'");
    assert.equal((await db.query('select * from claim_final_receipt_emails(10)')).rows.length, 0);
    assert.equal((await db.query("select count(*) as n from order_receipt_emails where status='needs_review'")).rows[0].n, 2);
  });
  await t.test('browser roles cannot inspect the queue or invoke its worker', async () => {
    for (const role of ['anon', 'authenticated']) {
      const permissions = (await db.query("select has_table_privilege($1,'order_receipt_emails','select') as read,has_function_privilege($1,'claim_final_receipt_emails(integer)','execute') as claim", [role])).rows[0];
      assert.equal(permissions.read, false);
      assert.equal(permissions.claim, false);
    }
  });
});
