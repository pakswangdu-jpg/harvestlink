import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadFrontend } from './helpers/loadFrontend.mjs';

const url = (path) => new URL(`../src/${path}`, import.meta.url).href;
const origin = { lat: 10.315678, lng: 123.912345 };
const destination = { lat: 10.32, lng: 123.93 };
const latLng = (point) => ({ lat: () => point.lat, lng: () => point.lng });

test('Google receives exact GPS and saved destination; traffic failure falls back to normal driving directions', async () => {
  const requests = [];
  const directions = [];
  const [google] = await loadFrontend([url('services/googleDirectionsService.js')], {
    fetch: async (endpoint, request) => { requests.push(JSON.parse(request.body)); return { ok: false }; },
  }, { [url('lib/googleMapsLoader.js')]: {
    loadGoogleGeometry: async () => ({}),
    loadGoogleRoutes: async () => ({ DirectionsService: class {
      async route(request) {
        directions.push(request);
        if (request.drivingOptions) throw new Error('Traffic unavailable');
        return { routes: [{ overview_path: [latLng(origin), latLng(destination)],
          legs: [{ distance: { value: 2800 }, duration: { value: 480 } }] }] };
      }
    } }),
  } });
  const routes = await google.fetchTrafficRoutes(origin, destination);
  assert.deepEqual(requests[0].origin.location.latLng, { latitude: origin.lat, longitude: origin.lng });
  assert.deepEqual(requests[0].destination.location.latLng, { latitude: destination.lat, longitude: destination.lng });
  assert.equal(directions.length, 2);
  assert.equal(directions[1].origin, origin);
  assert.equal(directions[1].destination, destination);
  assert.equal(routes[0].durationMinutes, 8);
  assert.equal(routes[0].distanceKm, 2.8);
  assert.equal(routes[0].hasTrafficData, false);
  assert.deepEqual(JSON.parse(JSON.stringify(routes[0].points)), [origin, destination]);
});
