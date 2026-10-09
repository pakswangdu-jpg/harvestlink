import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('admin reference updates notify marketplace roles atomically without changing selling prices', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table profiles(id uuid primary key, role text, account_status text);
    create table notifications(id uuid default gen_random_uuid(), user_id uuid references profiles(id), type text, title text, message text, link text);
    create table products(id int, price numeric);
    create table market_price_overrides(commodity_id text primary key, commodity_label text, reference_price numeric, reference_year int, reason text);
    insert into profiles values
    ('10000000-0000-4000-8000-000000000001','buyer','active'),
    ('10000000-0000-4000-8000-000000000002','farmer','active'),
    ('10000000-0000-4000-8000-000000000003','stakeholder','active'),
    ('10000000-0000-4000-8000-000000000004','admin','active'),
    ('10000000-0000-4000-8000-000000000005','buyer','suspended');
    insert into products values (1,55);`);
  const migration = await readFile(new URL('../../supabase/migrations/20261010_market_price_notifications.sql', import.meta.url), 'utf8');
  await db.exec(migration); await db.exec(migration);
  await db.exec("insert into market_price_overrides values('28','Cabbage',40,2025,'Local market reference');");
  const notifications = (await db.query('select n.*, p.role from notifications n join profiles p on p.id=n.user_id order by p.role')).rows;
  assert.deepEqual(notifications.map((row) => row.role), ['buyer','farmer','stakeholder']);
  assert.ok(notifications.every((row) => row.type === 'market_price' && row.link === '/marketplace' && row.message.includes('PHP 40.00/kg') && row.message.includes('Farmer selling prices are unchanged.')));
  await db.exec("update market_price_overrides set reference_price=40, reference_year=2025, reason='Same price';");
  assert.equal((await db.query('select count(*)::int as count from notifications')).rows[0].count,3);
  await db.exec('update market_price_overrides set reference_price=42;');
  assert.equal((await db.query('select count(*)::int as count from notifications')).rows[0].count,6);
  assert.equal(Number((await db.query('select price from products')).rows[0].price),55);
  await db.exec("alter table notifications add constraint simulate_failure check(type <> 'market_price') not valid;");
  await assert.rejects(db.exec('update market_price_overrides set reference_price=44;'),{code:'23514'});
  assert.equal(Number((await db.query('select reference_price from market_price_overrides')).rows[0].reference_price),42);
  assert.equal((await db.query('select count(*)::int as count from notifications')).rows[0].count,6);
  const privileges = (await db.query("select has_function_privilege('authenticated','notify_admin_market_price()','EXECUTE') as callable")).rows[0];
  assert.equal(privileges.callable,false);
});
