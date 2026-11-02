import assert from 'node:assert/strict';
import { test } from 'node:test';

test('admin location directory returns paged, minimal profiles with validated coordinates', async (t) => {
  const calls = [];
  const rows = [
    {
      id: 'farmer-1', role: 'farmer', name: 'Farmer One', email: 'farmer@example.test',
      farm_name: 'Green Acres', organization_name: null, address: 'Farm Road',
      barangay: 'North', municipality: 'Cebu City', latitude: 10.3, longitude: 124.1,
      account_status: 'active', inactivity_suspended_at: null, verification_status: 'verified',
      avatar_url: 'https://example.test/avatar.jpg', created_at: '2026-01-02T00:00:00.000Z',
      contact_number: 'must not be returned', gov_id_file_url: 'must not be returned',
    },
    {
      id: 'buyer-1', role: 'buyer', name: 'Buyer One', email: 'buyer@example.test',
      farm_name: null, organization_name: null, address: 'Buyer Street',
      barangay: null, municipality: 'Danao', latitude: null, longitude: null,
      account_status: 'active', inactivity_suspended_at: null, verification_status: null,
      avatar_url: null, created_at: '2026-01-03T00:00:00.000Z',
    },
    {
      id: 'stakeholder-1', role: 'stakeholder', name: 'Community Group', email: 'group@example.test',
      farm_name: null, organization_name: 'Community Group', address: 'Barangay Road',
      barangay: 'Central', municipality: 'Carmen', latitude: 91, longitude: 124,
      account_status: 'suspended', inactivity_suspended_at: '2026-02-01T00:00:00.000Z',
      verification_status: 'pending', avatar_url: null, created_at: '2026-01-04T00:00:00.000Z',
    },
    {
      id: 'admin-1', role: 'admin', name: 'Admin One', email: 'admin@example.test',
      farm_name: null, organization_name: null, address: 'Admin Road',
      barangay: null, municipality: 'Cebu City', latitude: 10.31, longitude: 123.89,
      account_status: 'active', inactivity_suspended_at: null, verification_status: null,
      avatar_url: null, created_at: '2026-01-05T00:00:00.000Z',
    },
  ];

  t.mock.module('../src/lib/supabaseClient.js', {
    namedExports: {
      supabaseAdmin: {
        from(table) {
          assert.equal(table, 'profiles');
          const query = {
            then(resolve, reject) {
              const range = calls.findLast((call) => call[0] === 'range');
              const roles = calls.findLast((call) => call[0] === 'in')?.[2] || [];
              const eligibleRows = rows.filter((row) => roles.includes(row.role));
              const data = range?.[1] === 500 ? [] : eligibleRows;
              return Promise.resolve({ data, count: eligibleRows.length, error: null }).then(resolve, reject);
            },
          };
          for (const method of ['select', 'in', 'order', 'range']) {
            query[method] = (...args) => {
              calls.push([method, ...args]);
              return query;
            };
          }
          return query;
        },
      },
    },
  });

  const { getAdminUserLocations } = await import('../src/controllers/profiles.controller.js');
  let response;
  await getAdminUserLocations(
    { profile: { role: 'admin' }, query: { page: '1' } },
    { json(value) { response = value; } },
  );

  assert.equal(response.total, 3);
  assert.equal(response.pageSize, 500);
  assert.equal(response.users.length, 3);
  assert.equal(response.users[0].latitude, 10.3);
  assert.equal(response.users[0].farmName, 'Green Acres');
  assert.equal(response.users[1].latitude, null);
  assert.equal(response.users[1].longitude, null);
  assert.equal(response.users[2].latitude, null);
  assert.equal(response.users[2].organizationName, 'Community Group');
  assert.deepEqual(response.users.map((user) => user.role), ['farmer', 'buyer', 'stakeholder']);
  assert.equal(response.users.some((user) => user.role === 'admin'), false);
  assert.equal('contactNumber' in response.users[0], false);
  assert.equal('govIdFile' in response.users[0], false);
  assert.equal('password' in response.users[0], false);
  assert.deepEqual(calls.find((call) => call[0] === 'in'), ['in', 'role', ['farmer', 'buyer', 'stakeholder']]);
  assert.deepEqual(calls.find((call) => call[0] === 'range'), ['range', 0, 499]);
  assert.ok(calls.find((call) => call[0] === 'select')[2].count === 'exact');

  calls.length = 0;
  await getAdminUserLocations(
    { profile: { role: 'admin' }, query: { page: '2' } },
    { json(value) { response = value; } },
  );
  assert.equal(response.page, 2);
  assert.equal(response.total, null);
  assert.deepEqual(calls.find((call) => call[0] === 'range'), ['range', 500, 999]);

  await assert.rejects(
    getAdminUserLocations({ profile: { role: 'buyer' }, query: { page: '1' } }, { json() {} }),
    { status: 403 },
  );
  await assert.rejects(
    getAdminUserLocations({ profile: { role: 'admin' }, query: { page: '0' } }, { json() {} }),
    { status: 400 },
  );
});
