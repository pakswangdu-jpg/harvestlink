import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import { profileLocationFields } from '../backend/src/lib/profileLocation.js';
import { serializeProfile } from '../backend/src/lib/serialize.js';
const context = vm.createContext({});
const modules = new Map();
async function load(path) {
 const url = new URL(path, import.meta.url);
 if (!url.pathname.endsWith('.js')) url.pathname += '.js';
 if (modules.has(url.href)) return modules.get(url.href);
 const mod = new vm.SourceTextModule(await readFile(url, 'utf8'), { context, identifier: url.href });
 modules.set(url.href, mod);
 await mod.link((specifier, parent) => load(new URL(specifier, parent.identifier).href));
 return mod;
}
const geo = await load('../src/utils/geo.js'); await geo.evaluate();
const { getRegisteredCoordinates, sortByRegisteredDistance, formatNearbyDistance, nearbyMapPoints } = geo.namespace;
const profileLocation = await load('../src/utils/profileLocation.js'); await profileLocation.evaluate();
const popup = await load('../src/components/map/userLocationMarker.js'); await popup.evaluate();
test('selected Places location supplies complete profile location fields for every role', () => {
 const { getProfileLocationFromPlace } = profileLocation.namespace;
 for (const role of ['farmer', 'buyer', 'stakeholder']) {
  const fields = getProfileLocationFromPlace({
   formattedAddress: '12 Main Street, Looc, Mandaue City, Cebu, 6014, Philippines',
   municipality: 'Mandaue City',
   zipCode: '6014',
   lat: 10.323456,
   lng: 123.912345,
  }, { role, address: 'Old address', municipality: 'Cebu City', zipCode: '6000' });
  assert.deepEqual(JSON.parse(JSON.stringify(fields)), {
   address: '12 Main Street, Looc, Mandaue City, Cebu, 6014, Philippines',
   municipality: 'Mandaue City',
   latitude: 10.323456,
   longitude: 123.912345,
   zipCode: '6014',
  });
 }
});
test('selected place without a valid coordinate pair does not retain stale coordinates', () => {
 const { getProfileLocationFromPlace } = profileLocation.namespace;
 assert.deepEqual(JSON.parse(JSON.stringify(getProfileLocationFromPlace({
  formattedAddress: 'New address', municipality: 'Unknown City', zipCode: '',
  lat: 10.3, lng: null,
 }, {
  address: 'Old address', municipality: 'Mandaue City', latitude: 10.3, longitude: 123.9, zipCode: '6014',
 }))), {
  address: 'New address', municipality: 'Mandaue City', latitude: null, longitude: null, zipCode: '',
 });
});
test('selected formatted address supplies city when primary Places locality is a barangay', () => {
 const { getProfileLocationFromPlace } = profileLocation.namespace;
 const fields = getProfileLocationFromPlace({
  formattedAddress: 'Looc, Mandaue City, Cebu, Philippines',
  municipality: 'Looc',
  zipCode: '6014',
  lat: 10.323456,
  lng: 123.912345,
 });
 assert.equal(fields.municipality, 'Mandaue City');
 assert.equal(fields.address, 'Looc, Mandaue City, Cebu, Philippines');
 assert.equal(fields.latitude, 10.323456);
 assert.equal(fields.longitude, 123.912345);
});
test('saved coordinates validate ranges and preserve zero and decimal strings', () => {
 assert.equal(getRegisteredCoordinates({latitude:null,longitude:null}),null);
 for (const v of ['', ' ', undefined, false, NaN, Infinity, 91, 'garbage']) assert.equal(getRegisteredCoordinates({latitude:v,longitude:12}),null);
 assert.equal(getRegisteredCoordinates({latitude:10,longitude:181}),null);
 assert.equal(JSON.stringify(getRegisteredCoordinates({latitude:'0',longitude:'0'})), '{"lat":0,"lng":0}');
 assert.equal(getRegisteredCoordinates({latitude:'10.1234567',longitude:'123.456789'}).lat,10.1234567);
});
test('nearby sorting uses saved coordinates, preserves input, and leaves missing coordinates last', () => {
 const people=[{id:'unknown',municipality:'Cebu City'},{id:'far',latitude:0,longitude:.02},{id:'near',latitude:0,longitude:.000063}];
 const result=sortByRegisteredDistance({lat:0,lng:0},people);
 assert.equal(result.map(x=>x.id).join(','),'near,far,unknown');
 assert.equal(formatNearbyDistance(result[0].distanceKm),'7 m away');
 assert.equal(formatNearbyDistance(result[1].distanceKm),'2.2 km away');
 assert.equal(people[0].id,'unknown');
 assert.ok(sortByRegisteredDistance(null,people).every(x=>x.distanceKm===null));
});
test('a farmer without saved coordinates has no distance when the viewer has a registered location', () => {
 const result = sortByRegisteredDistance(
  { lat: 10.3, lng: 123.9 },
  [{ id: 'located', latitude: 10.301, longitude: 123.9 }, { id: 'unset', municipality: 'Mandaue City' }],
 );
 assert.equal(result[0].id, 'located');
 assert.ok(result[0].distanceKm > 0);
 assert.equal(result[1].id, 'unset');
 assert.equal(result[1].distanceKm, null);
 assert.equal(formatNearbyDistance(result[1].distanceKm), 'Distance unavailable');
});
test('distances use sensible precision including the kilometer boundary',()=>{
 for (const [n,label] of [[.007,'7 m away'],[.317,'317 m away'],[1.2,'1.2 km away'],[5.8,'5.8 km away'],[.9999,'1 km away'],[1,'1 km away'],[0,'0 m away'],[null,'Distance unavailable']]) assert.equal(formatNearbyDistance(n),label);
});
test('invalid origin coordinates never produce non-finite farmer distances', () => {
 const farmers = [
  { id: 'valid', latitude: 10.3, longitude: 123.9 },
  { id: 'invalid', latitude: 91, longitude: 123.9 },
 ];
 const result = sortByRegisteredDistance({ lat: Number.NaN, lng: 123.9 }, farmers);
 assert.ok(result.every((farmer) => farmer.distanceKm === null));
 assert.ok(result.every((farmer) => formatNearbyDistance(farmer.distanceKm) === 'Distance unavailable'));
});
test('initial bounds include the user and nearby farmers without distant outliers',()=>{
 const result=nearbyMapPoints({lat:0,lng:0},[{lat:0,lng:.01},{lat:40,lng:40}]);
 assert.equal(result.length,2); assert.equal(result[0].lat,0); assert.equal(result[1].lng,.01);
});
test('popup shows only location context and safely escapes registered address',()=>{
 const html=popup.namespace.buildViewerPopup('<img src=x onerror=alert(1)>');
 assert.ok(html.includes('Your location')); assert.ok(html.includes('Used for nearby sorting.')); assert.ok(!html.includes('<img')); assert.ok(html.includes('&lt;img'));
});
test('profile persistence validates pairs and serializes saved values without zero defaults',()=>{
 assert.deepEqual(profileLocationFields({}),{});
 assert.deepEqual(profileLocationFields({latitude:null,longitude:null}),{latitude:null,longitude:null});
 assert.deepEqual(profileLocationFields({latitude:'10.5',longitude:'123.9'}),{latitude:10.5,longitude:123.9});
 for(const value of [{latitude:0},{latitude:'',longitude:''},{latitude:false,longitude:0},{latitude:91,longitude:180}]) assert.throws(()=>profileLocationFields(value), /valid profile location/);
 assert.equal(serializeProfile({id:'me',latitude:0,longitude:0}).latitude,0);
 assert.equal(serializeProfile({id:'me'}).latitude,null);
});
test('profile API serialization preserves valid farmer coordinates and rejects invalid pairs', () => {
 const farmer = serializeProfile({
  id: 'farmer-1',
  role: 'farmer',
  latitude: '10.323456',
  longitude: '123.912345',
 });
 assert.equal(farmer.latitude, 10.323456);
 assert.equal(farmer.longitude, 123.912345);
 const distance = sortByRegisteredDistance(
  { lat: 10.323, lng: 123.912 },
  [farmer],
 );
 assert.equal(distance[0].id, 'farmer-1');
 assert.ok(Number.isFinite(distance[0].distanceKm));
 assert.match(formatNearbyDistance(distance[0].distanceKm), /^\d+ m away$/);
 assert.deepEqual(
  { latitude: serializeProfile({ latitude: '', longitude: '123.9' }).latitude, longitude: serializeProfile({ latitude: '', longitude: '123.9' }).longitude },
  { latitude: null, longitude: null },
 );
 assert.deepEqual(
  { latitude: serializeProfile({ latitude: 91, longitude: 123 }).latitude, longitude: serializeProfile({ latitude: 91, longitude: 123 }).longitude },
  { latitude: null, longitude: null },
 );
});
