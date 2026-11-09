import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../../supabase/migrations/20261110_commodity_reference_pricing.sql', import.meta.url), 'utf8');
const migrationWithoutPublication = migration.replace(/\r\n/g, '\n').replace(
  /do \$\$\s*begin\s*if not exists \(\s*select 1 from pg_publication_tables[\s\S]*?\nend \$\$;\n/,
  '',
);
assert.notEqual(migrationWithoutPublication, migration);
assert.match(migration, /alter publication supabase_realtime add table public\.commodity_catalog/);
assert.match(migration, /alter publication supabase_realtime add table public\.market_price_overrides/);

test('commodity reference migration is rerunnable, audited, and does not change farmer prices', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create table categories(id uuid primary key);
    create table units(id uuid primary key default gen_random_uuid(), name text unique, abbreviation text);
    create table profiles(id uuid primary key, role text, account_status text);
    create table notifications(id uuid primary key default gen_random_uuid(), user_id uuid, type text, title text, message text, link text);
    create table products(id uuid primary key, price numeric);
    create table market_price_overrides(
      commodity_id text primary key, commodity_label text, reference_price numeric,
      reference_year integer, baseline_price numeric, reason text,
      updated_by uuid, updated_by_name text, updated_at timestamptz
    );
    create table market_price_override_history(
      id uuid primary key default gen_random_uuid(), commodity_id text, commodity_label text,
      previous_price numeric, new_price numeric, reason text, updated_by uuid,
      updated_by_name text, created_at timestamptz default now()
    );
    insert into categories values ('10000000-0000-4000-8000-000000000001');
    insert into profiles values
      ('10000000-0000-4000-8000-000000000002','farmer','active'),
      ('10000000-0000-4000-8000-000000000003','buyer','active');
    insert into products values ('10000000-0000-4000-8000-000000000004', 55);`);

  await db.exec(migrationWithoutPublication);
  await db.exec(migrationWithoutPublication);

  await t.test('Admin writes create a source-aware reference, history row, and notification', async () => {
    const saved = await db.query(`select * from set_market_price_override(
      'custom-1', 'Purple Yam', 70, 2026, 40, 'kg', 'verified_local_market',
      '2026-11-10', 'Local survey', 'Cebu market survey', $1, 'Admin'
    )`, ['10000000-0000-4000-8000-000000000005']);
    assert.equal(Number(saved.rows[0].reference_price), 70);
    assert.equal(saved.rows[0].source, 'verified_local_market');
    assert.equal(saved.rows[0].is_active, true);
    assert.equal((await db.query('select count(*)::int as count from market_price_override_history')).rows[0].count, 1);
    assert.equal((await db.query("select count(*)::int as count from notifications where type='market_price'")).rows[0].count, 2);
    assert.equal(Number((await db.query('select price from products')).rows[0].price), 55);
  });

  await t.test('clear deactivates the reference and appends history without deleting it', async () => {
    await db.query("select clear_market_price_override('custom-1', $1, 'Admin')", ['10000000-0000-4000-8000-000000000005']);
    const row = (await db.query("select is_active from market_price_overrides where commodity_id='custom-1'")).rows[0];
    assert.equal(row.is_active, false);
    assert.equal((await db.query('select count(*)::int as count from market_price_override_history')).rows[0].count, 2);
    assert.equal(Number((await db.query('select price from products')).rows[0].price), 55);
  });

  await t.test('browser roles cannot execute pricing write functions', async () => {
    for (const role of ['anon', 'authenticated']) {
      const permissions = (await db.query(`select
        has_function_privilege($1, 'set_market_price_override(text,text,numeric,integer,numeric,text,text,date,text,text,uuid,text)', 'EXECUTE') as set_allowed,
        has_function_privilege($1, 'clear_market_price_override(text,uuid,text)', 'EXECUTE') as clear_allowed`, [role])).rows[0];
      assert.equal(permissions.set_allowed, false);
      assert.equal(permissions.clear_allowed, false);
    }
    assert.equal((await db.query("select has_table_privilege('authenticated', 'units', 'SELECT') as allowed")).rows[0].allowed, true);
  });
});
