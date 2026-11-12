import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getMapProfilesForRole,
  includeCurrentRoleProfile,
} from '../src/components/map/mapDirectoryProfiles.js';

test('Active Users always includes the authenticated role profile and prefers its latest fields', () => {
  const currentUser = {
    id: 'farmer-current',
    role: 'farmer',
    name: 'Updated Farm',
    latitude: 10.3237,
    longitude: 123.9224,
  };
  const profiles = [
    { id: 'farmer-other', role: 'farmer', name: 'Other Farm' },
    { id: 'farmer-current', role: 'farmer', name: 'Old Farm', latitude: 10, longitude: 123 },
  ];

  const withCurrentUser = includeCurrentRoleProfile(profiles, 'farmer', currentUser);
  assert.equal(withCurrentUser.length, 2);
  assert.equal(withCurrentUser[1].name, 'Updated Farm');
  assert.equal(withCurrentUser[1].latitude, 10.3237);
  assert.equal(includeCurrentRoleProfile([], 'farmer', currentUser)[0].id, currentUser.id);
  assert.equal(includeCurrentRoleProfile(profiles, 'buyer', currentUser), profiles);
});

test('Nearby adds the authenticated account marker when the nearby endpoint omits it', () => {
  const mapProfiles = [
    { id: 'farmer-2', role: 'farmer', name: 'Chads Farm' },
  ];
  const directoryProfiles = [
    { id: 'farmer-2', name: 'Chads Farm', municipality: 'Alcantara' },
    { id: 'farmer-current', name: 'Doms Farm', farmName: 'DOMS FARM', municipality: 'Mandaue City', latitude: 10.3237, longitude: 123.9224 },
    { id: 'farmer-not-nearby', name: 'Unlisted Farm', municipality: 'Bogo' },
  ];
  const currentUser = { id: 'farmer-current', role: 'farmer', name: 'Doms Farm' };

  const result = getMapProfilesForRole(
    mapProfiles,
    directoryProfiles,
    'farmer',
    '',
    true,
    ['name', 'farmName', 'municipality'],
    currentUser,
  );

  assert.deepEqual(result.map((profile) => profile.id), ['farmer-2', 'farmer-current']);
  assert.equal(result[1].farmName, 'DOMS FARM');
  assert.equal(result[1].latitude, 10.3237);
});

test('the authenticated account is added only for its own visible role and matching search', () => {
  const currentUser = { id: 'buyer-current', role: 'buyer', name: 'Current Buyer' };
  const directoryProfiles = [currentUser];
  const common = [[], directoryProfiles, 'buyer'];

  assert.deepEqual(
    getMapProfilesForRole(...common, '', true, ['name'], currentUser).map((profile) => profile.id),
    ['buyer-current'],
  );
  assert.deepEqual(getMapProfilesForRole(...common, '', false, ['name'], currentUser), []);
  assert.deepEqual(getMapProfilesForRole(...common.slice(0, 2), 'farmer', '', true, ['name'], currentUser), []);
  assert.deepEqual(getMapProfilesForRole(...common, 'missing', true, ['name'], currentUser), []);
});
