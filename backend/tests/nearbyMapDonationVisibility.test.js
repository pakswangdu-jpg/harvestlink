import assert from 'node:assert/strict';
import { test } from 'node:test';

test('only Farmer and Stakeholder map responses include donation availability', async (t) => {
  const calls = [];
  const profileSelections = [];
  const profiles = [
    { id: 'farmer-1', role: 'farmer', name: 'Farmer', address: 'B. Ceniza St', barangay: 'Subangdaku', municipality: 'Mandaue City', latitude: '10.3', longitude: '123.9' },
    { id: 'buyer-1', role: 'buyer', name: 'Buyer', latitude: '10.4', longitude: '123.8' },
    { id: 'stakeholder-1', role: 'stakeholder', name: 'Partner', latitude: '10.5', longitude: '123.7' },
  ];

  t.mock.module('../src/lib/supabaseClient.js', {
    namedExports: {
      supabaseAdmin: {
        from(table) {
          calls.push(table);
          const result = table === 'profiles'
            ? { data: profiles, error: null }
            : { data: [{ farmer_id: 'farmer-1' }], error: null };
          const query = {
            then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
          };
          query.select = (columns) => {
            if (table === 'profiles') profileSelections.push(columns);
            return query;
          };
          for (const method of ['in', 'eq', 'neq', 'not', 'or']) {
            query[method] = () => query;
          }
          return query;
        },
      },
    },
  });

  const { getNearbyMapProfiles } = await import('../src/controllers/profiles.controller.js');
  const readProfiles = async (role) => {
    let response;
    await getNearbyMapProfiles({ profile: { role } }, { json: (data) => { response = data; } });
    return response;
  };

  const buyerProfiles = await readProfiles('buyer');
  assert.deepEqual(calls, ['profiles']);
  assert.equal('hasAvailableDonations' in buyerProfiles[0], false);
  assert.equal('address' in buyerProfiles.find((profile) => profile.id === 'farmer-1'), false);
  assert.doesNotMatch(profileSelections.at(-1), /address|barangay/);

  calls.length = 0;
  const farmerProfiles = await readProfiles('farmer');
  assert.deepEqual(calls, ['profiles', 'donations']);
  assert.equal(farmerProfiles.find((profile) => profile.id === 'farmer-1').hasAvailableDonations, true);
  assert.equal(farmerProfiles.find((profile) => profile.id === 'buyer-1').hasAvailableDonations, false);
  assert.equal('address' in farmerProfiles.find((profile) => profile.id === 'farmer-1'), false);
  assert.doesNotMatch(profileSelections.at(-1), /address|barangay/);

  calls.length = 0;
  const stakeholderProfiles = await readProfiles('stakeholder');
  assert.deepEqual(calls, ['profiles', 'donations']);
  assert.equal(stakeholderProfiles.find((profile) => profile.id === 'farmer-1').hasAvailableDonations, true);
  assert.equal(stakeholderProfiles.find((profile) => profile.id === 'farmer-1').address, 'B. Ceniza St');
  assert.equal(stakeholderProfiles.find((profile) => profile.id === 'farmer-1').barangay, 'Subangdaku');
  assert.equal('address' in stakeholderProfiles.find((profile) => profile.id === 'buyer-1'), false);
  assert.match(profileSelections.at(-1), /address, barangay/);

  const expectedIds = profiles.map((profile) => profile.id);
  for (const roleProfiles of [buyerProfiles, farmerProfiles, stakeholderProfiles]) {
    assert.deepEqual(roleProfiles.map((profile) => profile.id), expectedIds);
    roleProfiles.forEach((profile) => {
      assert.equal(typeof profile.latitude, 'number');
      assert.equal(typeof profile.longitude, 'number');
    });
  }
});
