import assert from 'node:assert/strict';
import { test } from 'node:test';

test('profile lookup returns display fields without private contact or document data', async (t) => {
  const selectedFields = [];
  const profile = {
    id: '20000000-0000-0000-0000-000000000001',
    role: 'stakeholder',
    name: 'Community Pantry',
    farm_name: null,
    avatar_url: null,
    verification_status: 'verified',
    organization_name: 'Community Pantry',
    last_active_at: '2026-11-01T10:00:00.000Z',
    email: 'private@example.com',
    contact_number: 'private number',
    address: 'private address',
    accreditation_file_url: 'private document',
  };

  t.mock.module('../src/lib/supabaseClient.js', {
    namedExports: {
      supabaseAdmin: {
        from(table) {
          assert.equal(table, 'profiles');
          return {
            select(fields) {
              selectedFields.push(fields);
              return this;
            },
            eq(field, value) {
              assert.equal(field, 'id');
              assert.equal(value, profile.id);
              return this;
            },
            single() {
              return Promise.resolve({ data: profile, error: null });
            },
          };
        },
      },
    },
  });

  const { getProfileById } = await import('../src/controllers/profiles.controller.js');
  let response;
  await getProfileById({ params: { id: profile.id } }, { json(value) { response = value; } });

  assert.deepEqual(response, {
    id: profile.id,
    role: 'stakeholder',
    name: 'Community Pantry',
    farmName: null,
    avatarUrl: null,
    verificationStatus: 'verified',
    organizationName: 'Community Pantry',
    lastActiveAt: '2026-11-01T10:00:00.000Z',
  });
  assert.deepEqual(selectedFields, [
    'id, role, name, farm_name, avatar_url, verification_status, organization_name, last_active_at',
  ]);
});
