import assert from 'node:assert/strict';
import { test } from 'node:test';

test('nearby map profiles include full active user details while scoping donation availability', async (t) => {
  const calls = [];
  const profileSelections = [];
  const profiles = [
    {
      id: 'farmer-1',
      role: 'farmer',
      name: 'Farmer',
      farm_name: 'Sunny Farm',
      verification_status: 'verified',
      address: 'B. Ceniza St',
      barangay: 'Subangdaku',
      municipality: 'Mandaue City',
      zip_code: '6014',
      contact_number: '09171234567',
      latitude: '10.3',
      longitude: '123.9',
    },
    {
      id: 'farmer-pending',
      role: 'farmer',
      name: 'Pending Farmer',
      verification_status: 'pending',
      latitude: '10.31',
      longitude: '123.91',
    },
    {
      id: 'buyer-1',
      role: 'buyer',
      name: 'Buyer',
      address: '12 Osmena Blvd',
      barangay: 'Looc',
      municipality: 'Lapu-Lapu City',
      contact_number: '09180001111',
      latitude: '10.4',
      longitude: '123.8',
    },
    {
      id: 'stakeholder-1',
      role: 'stakeholder',
      name: 'Partner',
      organization_name: 'Cebu Food Bank',
      organization_type: 'NGO / Food Bank',
      contact_person: 'Maria Santos',
      verification_status: 'verified',
      address: '45 Mango Ave',
      barangay: 'Kamputhaw',
      municipality: 'Cebu City',
      contact_number: '09192223333',
      latitude: '10.5',
      longitude: '123.7',
    },
    {
      id: 'stakeholder-rejected',
      role: 'stakeholder',
      name: 'Rejected Partner',
      verification_status: 'rejected',
      latitude: '10.51',
      longitude: '123.71',
    },
  ];

  t.mock.module('../src/lib/supabaseClient.js', {
    namedExports: {
      supabaseAdmin: {
        from(table) {
          calls.push(table);
          const resultByTable = {
            profiles: { data: profiles, error: null },
            donations: { data: [{ farmer_id: 'farmer-1' }], error: null },
            ratings: { data: [{ farmer_id: 'farmer-1', rating: 5 }, { farmer_id: 'farmer-1', rating: 4 }], error: null },
            products: { data: [{ farmer_id: 'farmer-1', category: 'Vegetables' }], error: null },
          };
          const result = resultByTable[table] || { data: [], error: null };
          const query = {
            then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
          };
          query.select = (columns) => {
            if (table === 'profiles') profileSelections.push(columns);
            return query;
          };
          for (const method of ['in', 'eq', 'neq', 'not', 'or', 'gt']) {
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
  assert.deepEqual(calls, ['profiles', 'ratings', 'products']);
  assert.equal('hasAvailableDonations' in buyerProfiles[0], false);
  const buyerViewedFarmer = buyerProfiles.find((profile) => profile.id === 'farmer-1');
  assert.equal(buyerViewedFarmer.address, 'B. Ceniza St');
  assert.equal(buyerViewedFarmer.barangay, 'Subangdaku');
  assert.equal(buyerViewedFarmer.contactNumber, '09171234567');
  assert.equal(buyerViewedFarmer.avgRating, 4.5);
  assert.equal(buyerViewedFarmer.ratingCount, 2);
  assert.equal(buyerViewedFarmer.productCount, 1);
  assert.deepEqual(buyerViewedFarmer.categories, ['Vegetables']);
  assert.match(profileSelections.at(-1), /address, barangay/);
  assert.match(profileSelections.at(-1), /contact_number/);

  calls.length = 0;
  const farmerProfiles = await readProfiles('farmer');
  assert.deepEqual(calls, ['profiles', 'donations', 'ratings', 'products']);
  assert.equal(farmerProfiles.find((profile) => profile.id === 'farmer-1').hasAvailableDonations, true);
  assert.equal(farmerProfiles.find((profile) => profile.id === 'buyer-1').hasAvailableDonations, false);
  assert.equal(farmerProfiles.find((profile) => profile.id === 'buyer-1').address, '12 Osmena Blvd');
  assert.equal(farmerProfiles.find((profile) => profile.id === 'stakeholder-1').contactPerson, 'Maria Santos');

  calls.length = 0;
  const stakeholderProfiles = await readProfiles('stakeholder');
  assert.deepEqual(calls, ['profiles', 'donations', 'ratings', 'products']);
  assert.equal(stakeholderProfiles.find((profile) => profile.id === 'farmer-1').hasAvailableDonations, true);
  assert.equal(stakeholderProfiles.find((profile) => profile.id === 'farmer-1').address, 'B. Ceniza St');
  assert.equal(stakeholderProfiles.find((profile) => profile.id === 'farmer-1').barangay, 'Subangdaku');
  assert.equal(stakeholderProfiles.find((profile) => profile.id === 'buyer-1').barangay, 'Looc');

  const expectedIds = ['farmer-1', 'buyer-1', 'stakeholder-1'];
  for (const roleProfiles of [buyerProfiles, farmerProfiles, stakeholderProfiles]) {
    assert.deepEqual(roleProfiles.map((profile) => profile.id), expectedIds);
    roleProfiles.forEach((profile) => {
      assert.equal(typeof profile.latitude, 'number');
      assert.equal(typeof profile.longitude, 'number');
    });
  }
});
