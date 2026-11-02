import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const adminId = '10000000-0000-4000-8000-000000000001';
const farmerId = '20000000-0000-4000-8000-000000000001';
const buyerId = '30000000-0000-4000-8000-000000000001';
const migration = await readFile(
  new URL('../../supabase/migrations/20261102_admin_profile_location_access.sql', import.meta.url),
  'utf8',
);

test('profile RLS permits Admin location reads, limits columns and blocks non-Admin accounts', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table public.profiles (
      id uuid primary key,
      role text not null,
      name text,
      email text,
      farm_name text,
      organization_name text,
      address text,
      barangay text,
      municipality text,
      latitude double precision,
      longitude double precision,
      account_status text,
      inactivity_suspended_at timestamptz,
      verification_status text,
      avatar_url text,
      created_at timestamptz,
      contact_number text,
      gcash_number text,
      gov_id_file_url text
    );
    alter table public.profiles enable row level security;
    grant select, update on public.profiles to authenticated;
    create policy profiles_select_own on public.profiles
      for select to authenticated using ((select auth.uid()) = id);
    create policy profiles_update_own on public.profiles
      for update to authenticated using ((select auth.uid()) = id)
      with check ((select auth.uid()) = id);
    create policy profiles_own_row_guard on public.profiles
      as restrictive for all to authenticated
      using ((select auth.uid()) = id)
      with check ((select auth.uid()) = id);
    insert into public.profiles (id, role, name, email, latitude, longitude, contact_number, gcash_number, gov_id_file_url)
    values
      ('${adminId}', 'admin', 'Admin', 'admin@example.test', null, null, 'admin-private', null, null),
      ('${farmerId}', 'farmer', 'Farmer', 'farmer@example.test', 10.3, 124.1, 'farmer-private', 'payment-private', 'document-private'),
      ('${buyerId}', 'buyer', 'Buyer', 'buyer@example.test', null, null, 'buyer-private', null, null);
  `);
  await db.exec(migration);

  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${adminId}';`);
  const adminRows = (await db.query('select id, role, email, latitude from public.profiles order by id')).rows;
  assert.equal(adminRows.length, 3);
  await assert.rejects(
    db.query('select contact_number from public.profiles'),
    { code: '42501' },
  );
  const adminUpdate = await db.query(
    "update public.profiles set name = 'Changed' where id = $1 returning id",
    [farmerId],
  );
  assert.equal(adminUpdate.rows.length, 0);

  await db.exec('reset role; set role authenticated;');
  await db.exec(`set request.jwt.claim.sub = '${buyerId}';`);
  const buyerRows = (await db.query('select id from public.profiles order by id')).rows;
  assert.deepEqual(buyerRows.map((row) => row.id), [buyerId]);
});
