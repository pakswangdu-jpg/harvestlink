import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ARRIVAL_GEOFENCE_RADIUS_METERS,
  DONATION_ARRIVAL_POKE_COOLDOWN_MS,
  evaluateDonationArrival,
  FARMER_ARRIVAL_NOTIFICATION_MESSAGE,
  FARMER_ARRIVAL_NOTIFICATION_TITLE,
} from '../src/lib/donationArrival.js';

const FARMER_ID = '10000000-0000-0000-0000-000000000001';
const OTHER_FARMER_ID = '10000000-0000-0000-0000-000000000002';
const STAKEHOLDER_ID = '20000000-0000-0000-0000-000000000001';
const OTHER_STAKEHOLDER_ID = '20000000-0000-0000-0000-000000000002';
const BUYER_ID = '40000000-0000-0000-0000-000000000001';
const DONATION_ID = '30000000-0000-0000-0000-000000000001';

const FARM_COORDS = { lat: 10.3157, lng: 123.8854 };

test('evaluateDonationArrival enforces geofence radius, GPS accuracy, and consecutive readings', () => {
  // 1. Stakeholder 350m away: approaching (<500m), but not arrived (>80m)
  const approachingSample = { lat: 10.3188, lng: 123.8854, accuracy: 12 };
  const step1 = evaluateDonationArrival({
    previousReadings: 0,
    arrivedAt: null,
    sample: approachingSample,
    farmCoords: FARM_COORDS,
    now: '2026-11-12T08:00:00.000Z',
  });
  assert.equal(step1.isApproaching, true);
  assert.equal(step1.arrived, false);
  assert.equal(step1.consecutiveArrivalReadings, 0);
  assert.equal(step1.pickupStatus, 'on_the_way');

  // 2. Stakeholder at farm coordinates, but GPS accuracy is poor (140m > 65m): must NOT trigger arrival
  const inaccurateAtFarm = { lat: FARM_COORDS.lat, lng: FARM_COORDS.lng, accuracy: 140 };
  const step2 = evaluateDonationArrival({
    previousReadings: 1,
    arrivedAt: null,
    sample: inaccurateAtFarm,
    farmCoords: FARM_COORDS,
    now: '2026-11-12T08:01:00.000Z',
  });
  assert.equal(step2.hasReliableAccuracy, false);
  assert.equal(step2.arrived, false);
  assert.equal(step2.consecutiveArrivalReadings, 0);
  assert.equal(step2.pickupStatus, 'on_the_way');

  // 3. First reliable reading inside the 80m farm geofence: increments count to 1, not yet arrived
  const accurateReading1 = { lat: 10.3158, lng: 123.8855, accuracy: 10 };
  const step3 = evaluateDonationArrival({
    previousReadings: 0,
    arrivedAt: null,
    sample: accurateReading1,
    farmCoords: FARM_COORDS,
    now: '2026-11-12T08:02:00.000Z',
  });
  assert.ok(step3.distanceMeters <= ARRIVAL_GEOFENCE_RADIUS_METERS);
  assert.equal(step3.isReliableWithinGeofence, true);
  assert.equal(step3.consecutiveArrivalReadings, 1);
  assert.equal(step3.arrived, false);
  assert.equal(step3.newlyArrived, false);
  assert.equal(step3.pickupStatus, 'on_the_way');

  // 4. Second consecutive reliable reading inside the farm geofence: confirms arrival!
  const accurateReading2 = { lat: 10.31575, lng: 123.88545, accuracy: 8 };
  const step4 = evaluateDonationArrival({
    previousReadings: step3.consecutiveArrivalReadings,
    arrivedAt: step3.arrivedAt,
    sample: accurateReading2,
    farmCoords: FARM_COORDS,
    now: '2026-11-12T08:02:10.000Z',
  });
  assert.equal(step4.consecutiveArrivalReadings, 2);
  assert.equal(step4.arrived, true);
  assert.equal(step4.newlyArrived, true);
  assert.equal(step4.arrivedAt, '2026-11-12T08:02:10.000Z');
  assert.equal(step4.pickupStatus, 'awaiting_confirmation');
});

test('Complete backend donation pickup tracking & farmer handover confirmation workflow', async (t) => {
  const notifications = [];
  let donationState = {
    id: DONATION_ID,
    product_id: '50000000-0000-0000-0000-000000000001',
    product_name: 'Organic Cabbage',
    unit: 'kg',
    quantity: 25,
    available_quantity: 25,
    claimed_quantity: 0,
    location: 'Cebu City',
    farmer_id: FARMER_ID,
    farmer_name: 'Green Valley Farm',
    status: 'requested',
    pickup_status: 'requested',
    requested_by_id: STAKEHOLDER_ID,
    requested_by_name: 'Cebu Food Bank',
    pickup_date: null,
    current_lat: null,
    current_lng: null,
    current_accuracy: null,
    current_heading: null,
    current_speed: null,
    location_updated_at: null,
    transit_started_at: null,
    consecutive_arrival_readings: 0,
    arrived_at: null,
    arrival_notified_at: null,
    confirmed_at: null,
    rated: false,
    created_at: '2026-11-12T07:00:00.000Z',
    updated_at: '2026-11-12T07:00:00.000Z',
  };
  let updateDatabaseError = null;

  const profilesById = {
    [FARMER_ID]: {
      id: FARMER_ID,
      role: 'farmer',
      name: 'Juan Dela Cruz',
      farm_name: 'Green Valley Farm',
      address: 'Sitio Sudlon, Busay',
      municipality: 'Cebu City',
      latitude: FARM_COORDS.lat,
      longitude: FARM_COORDS.lng,
    },
    [STAKEHOLDER_ID]: {
      id: STAKEHOLDER_ID,
      role: 'stakeholder',
      name: 'Cebu Food Bank',
      organization_name: 'Cebu Food Bank',
      address: 'Fuente Osmena',
      municipality: 'Cebu City',
      latitude: 10.3100,
      longitude: 123.8900,
    },
  };

  t.mock.module('../src/lib/notify.js', {
    namedExports: {
      async createNotification(payload) {
        notifications.push(payload);
        return true;
      },
    },
  });

  t.mock.module('../src/lib/supabaseClient.js', {
    namedExports: {
      supabaseAdmin: {
        from(table) {
          let filterId = null;
          let pendingUpdate = null;
          let notifiedAtFilter = null;
          let notifiedAtIsNull = false;
          const builder = {
            select() {
              return builder;
            },
            eq(col, val) {
              if (col === 'id') filterId = val;
              if (col === 'arrival_notified_at') notifiedAtFilter = val;
              return builder;
            },
            is(col, val) {
              if (col === 'arrival_notified_at' && val === null) notifiedAtIsNull = true;
              return builder;
            },
            update(values) {
              pendingUpdate = values;
              return builder;
            },
            async maybeSingle() {
              if (table === 'donations') {
                if (filterId && filterId !== donationState.id) return { data: null, error: null };
                if (notifiedAtIsNull && donationState.arrival_notified_at != null) return { data: null, error: null };
                if (notifiedAtFilter !== null && donationState.arrival_notified_at !== notifiedAtFilter) return { data: null, error: null };
                if (pendingUpdate) {
                  if (updateDatabaseError) return { data: null, error: updateDatabaseError };
                  donationState = { ...donationState, ...pendingUpdate };
                }
                return { data: { ...donationState }, error: null };
              }
              if (table === 'profiles') {
                return { data: profilesById[filterId] || null, error: null };
              }
              if (table === 'donation_claims') {
                return { data: null, error: null };
              }
              return { data: null, error: null };
            },
          };
          return builder;
        },
        async rpc(name, args) {
          if (name === 'transition_surplus_donation' && args.action_name === 'schedule') {
            donationState = {
              ...donationState,
              status: 'scheduled',
              pickup_status: 'awaiting_pickup',
              pickup_date: args.scheduled_date,
            };
            return { data: { ...donationState }, error: null };
          }
          if (name === 'confirm_surplus_donation_handover') {
            return { data: null, error: { code: 'PGRST202', message: 'Use controller fallback' } };
          }
          return { data: null, error: null };
        },
      },
    },
  });

  const controller = await import('../src/controllers/donations.controller.js');

  const callEndpoint = async (fn, profile, { params = {}, body = {}, query = {} } = {}) => {
    let responseBody;
    let statusCode = 200;
    const req = {
      profile,
      params: { id: DONATION_ID, ...params },
      body,
      query,
    };
    const res = {
      setHeader() {},
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        responseBody = payload;
        return this;
      },
    };
    await fn(req, res);
    return { statusCode, body: responseBody };
  };

  // Step 1: Farmer accepts Stakeholder donation request
  const scheduled = await callEndpoint(
    controller.updateDonation,
    { id: FARMER_ID, role: 'farmer' },
    { params: { id: DONATION_ID, action: 'schedule' }, body: { pickupDate: '2026-11-15' } },
  );
  assert.equal(scheduled.body.status, 'scheduled');
  assert.equal(scheduled.body.pickupStatus, 'awaiting_pickup');

  // Step 2: Both Stakeholder and Farmer can load tracking profiles with exact farm coordinates
  const stakeholderProfiles = await callEndpoint(
    controller.getDonationTrackingProfiles,
    { id: STAKEHOLDER_ID, role: 'stakeholder' },
  );
  assert.equal(stakeholderProfiles.body.farmer.latitude, FARM_COORDS.lat);
  assert.equal(stakeholderProfiles.body.farmer.longitude, FARM_COORDS.lng);
  assert.equal(stakeholderProfiles.body.farmer.farm_name, 'Green Valley Farm');
  const savedFarmerProfile = profilesById[FARMER_ID];
  const savedStakeholderProfile = profilesById[STAKEHOLDER_ID];
  profilesById[FARMER_ID] = { ...savedFarmerProfile, latitude: null, longitude: null };
  profilesById[STAKEHOLDER_ID] = { ...savedStakeholderProfile, latitude: null, longitude: null };
  const missingCoordinates = await callEndpoint(
    controller.getDonationTrackingProfiles,
    { id: STAKEHOLDER_ID, role: 'stakeholder' },
  );
  assert.equal(missingCoordinates.body.farmer.latitude, null);
  assert.equal(missingCoordinates.body.farmer.longitude, null);
  assert.equal(missingCoordinates.body.stakeholder.latitude, null);
  assert.equal(missingCoordinates.body.stakeholder.longitude, null);
  profilesById[FARMER_ID] = savedFarmerProfile;
  profilesById[STAKEHOLDER_ID] = savedStakeholderProfile;

  // Step 3: Security & Privacy - Buyer, other Stakeholder, and other Farmer are rejected (403)
  await assert.rejects(
    callEndpoint(controller.getDonationTrackingProfiles, { id: BUYER_ID, role: 'buyer' }),
    { status: 403 },
  );
  await assert.rejects(
    callEndpoint(controller.getDonationTrackingProfiles, { id: OTHER_STAKEHOLDER_ID, role: 'stakeholder' }),
    { status: 403 },
  );
  await assert.rejects(
    callEndpoint(controller.getDonationTrackingProfiles, { id: OTHER_FARMER_ID, role: 'farmer' }),
    { status: 403 },
  );
  await assert.rejects(
    callEndpoint(
      controller.updateDonationPickupLocation,
      { id: OTHER_STAKEHOLDER_ID, role: 'stakeholder' },
      { body: { lat: 10.312, lng: 123.888, accuracy: 10 } },
    ),
    { status: 403 },
  );
  await assert.rejects(
    callEndpoint(
      controller.updateDonationPickupLocation,
      { id: FARMER_ID, role: 'farmer' },
      { body: { lat: 10.312, lng: 123.888, accuracy: 10 } },
    ),
    { status: 403 },
  );

  // Step 4: Stakeholder moves toward the farm (300m away) -> status becomes 'on_the_way', not arrived
  const move1 = await callEndpoint(
    controller.updateDonationPickupLocation,
    { id: STAKEHOLDER_ID, role: 'stakeholder' },
    { body: { lat: 10.3184, lng: 123.8854, accuracy: 12, speed: 5.2, heading: 180 } },
  );
  assert.equal(move1.body.pickupStatus, 'on_the_way');
  assert.equal(move1.body.arrival.isApproaching, true);
  assert.equal(move1.body.arrival.arrived, false);
  assert.equal(notifications.length, 0);

  updateDatabaseError = { code: '42703', message: 'column current_lat does not exist' };
  await assert.rejects(
    callEndpoint(
      controller.updateDonationPickupLocation,
      { id: STAKEHOLDER_ID, role: 'stakeholder' },
      { body: { lat: 10.3184, lng: 123.8854, accuracy: 12 } },
    ),
    {
      status: 503,
      code: 'DONATION_TRACKING_MIGRATION_REQUIRED',
      message: /20261112_donation_pickup_tracking\.sql/,
    },
  );
  updateDatabaseError = null;

  // Step 5: Farmer cannot confirm donation before verified arrival
  await assert.rejects(
    callEndpoint(controller.confirmDonationHandover, { id: FARMER_ID, role: 'farmer' }),
    { status: 409, message: /must poke the farmer/i },
  );

  // Step 6: First accurate GPS reading inside farm geofence -> consecutiveArrivalReadings = 1
  const arrive1 = await callEndpoint(
    controller.updateDonationPickupLocation,
    { id: STAKEHOLDER_ID, role: 'stakeholder' },
    { body: { lat: FARM_COORDS.lat + 0.0001, lng: FARM_COORDS.lng + 0.0001, accuracy: 10, speed: 0.8 } },
  );
  assert.equal(arrive1.body.consecutiveArrivalReadings, 1);
  assert.equal(arrive1.body.arrival.arrived, false);
  assert.equal(notifications.length, 0);

  // Step 7: Second consecutive accurate GPS reading inside farm geofence -> verifies arrival
  const arrive2 = await callEndpoint(
    controller.updateDonationPickupLocation,
    { id: STAKEHOLDER_ID, role: 'stakeholder' },
    { body: { lat: FARM_COORDS.lat + 0.00005, lng: FARM_COORDS.lng + 0.00005, accuracy: 8, speed: 0 } },
  );
  assert.equal(arrive2.body.consecutiveArrivalReadings, 2);
  assert.equal(arrive2.body.arrival.arrived, true);
  assert.equal(arrive2.body.pickupStatus, 'awaiting_confirmation');
  assert.ok(arrive2.body.arrivedAt);
  // Donation must NOT be marked completed automatically on arrival
  assert.equal(arrive2.body.status, 'scheduled');
  assert.equal(notifications.length, 0, 'arrival alone does not notify before the Stakeholder pokes the Farmer');
  await assert.rejects(
    callEndpoint(controller.confirmDonationHandover, { id: FARMER_ID, role: 'farmer' }),
    { status: 409, message: /must poke the farmer/i },
  );

  // Step 8: Stakeholder explicitly notifies Farmer after geofence-verified arrival.
  const notified = await callEndpoint(
    controller.notifyFarmerOfDonationArrival,
    { id: STAKEHOLDER_ID, role: 'stakeholder' },
  );
  assert.equal(notified.body.notified, true);
  assert.equal(notified.body.alreadyNotified, false);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].userId, FARMER_ID);
  assert.equal(notifications[0].title, FARMER_ARRIVAL_NOTIFICATION_TITLE);
  assert.equal(notifications[0].message, FARMER_ARRIVAL_NOTIFICATION_MESSAGE);
  assert.ok(donationState.arrival_notified_at);

  await assert.rejects(
    callEndpoint(controller.notifyFarmerOfDonationArrival, { id: STAKEHOLDER_ID, role: 'stakeholder' }),
    { status: 429, message: /wait .* seconds/i },
  );
  assert.equal(notifications.length, 1, 'pokes during the one-minute cooldown do not notify again');

  donationState.arrival_notified_at = new Date(
    Date.now() - DONATION_ARRIVAL_POKE_COOLDOWN_MS - 1000,
  ).toISOString();
  const secondPoke = await callEndpoint(
    controller.notifyFarmerOfDonationArrival,
    { id: STAKEHOLDER_ID, role: 'stakeholder' },
  );
  assert.equal(secondPoke.body.notified, true);
  assert.equal(secondPoke.body.alreadyNotified, false);
  assert.equal(notifications.length, 2, 'a new notification is sent after the one-minute cooldown');

  await assert.rejects(
    callEndpoint(controller.notifyFarmerOfDonationArrival, { id: FARMER_ID, role: 'farmer' }),
    { status: 403 },
  );

  // Step 9: Unauthorized users cannot confirm handover
  await assert.rejects(
    callEndpoint(controller.confirmDonationHandover, { id: STAKEHOLDER_ID, role: 'stakeholder' }),
    { status: 403 },
  );
  await assert.rejects(
    callEndpoint(controller.confirmDonationHandover, { id: OTHER_FARMER_ID, role: 'farmer' }),
    { status: 403 },
  );

  // Step 10: Farmer confirms the handover -> status becomes 'completed', pickupStatus 'confirmed', coordinates cleared
  const confirmed = await callEndpoint(
    controller.confirmDonationHandover,
    { id: FARMER_ID, role: 'farmer' },
  );
  assert.equal(confirmed.body.status, 'completed');
  assert.equal(confirmed.body.pickupStatus, 'confirmed');
  assert.ok(confirmed.body.confirmedAt);
  assert.equal(confirmed.body.currentLat, null);
  assert.equal(confirmed.body.currentLng, null);

  // Stakeholder received Donation Confirmed notification
  assert.equal(notifications.length, 3);
  assert.equal(notifications[2].userId, STAKEHOLDER_ID);
  assert.equal(notifications[2].title, 'Donation Confirmed');

  // Step 11: Duplicate confirmation is rejected (409) and location sharing is blocked after confirmation (409)
  await assert.rejects(
    callEndpoint(controller.confirmDonationHandover, { id: FARMER_ID, role: 'farmer' }),
    { status: 409, message: /already been confirmed/i },
  );
  await assert.rejects(
    callEndpoint(
      controller.updateDonationPickupLocation,
      { id: STAKEHOLDER_ID, role: 'stakeholder' },
      { body: { lat: FARM_COORDS.lat, lng: FARM_COORDS.lng, accuracy: 8 } },
    ),
    { status: 409, message: /already been confirmed/i },
  );

  // A Stakeholder can explicitly report arrival without a GPS geofence fix.
  donationState = {
    ...donationState,
    status: 'scheduled',
    pickup_status: 'awaiting_pickup',
    current_lat: null,
    current_lng: null,
    location_updated_at: null,
    arrived_at: null,
    arrival_notified_at: null,
    consecutive_arrival_readings: 0,
    confirmed_at: null,
  };
  const selfReportedPoke = await callEndpoint(
    controller.notifyFarmerOfDonationArrival,
    { id: STAKEHOLDER_ID, role: 'stakeholder' },
  );
  assert.equal(selfReportedPoke.body.notified, true);
  assert.equal(selfReportedPoke.body.alreadyNotified, false);
  assert.ok(donationState.arrival_notified_at);
  assert.match(notifications[3].message, /reports arriving/);

  const farmerConfirmedSelfReportedArrival = await callEndpoint(
    controller.confirmDonationHandover,
    { id: FARMER_ID, role: 'farmer' },
  );
  assert.equal(farmerConfirmedSelfReportedArrival.body.status, 'completed');
  assert.equal(farmerConfirmedSelfReportedArrival.body.pickupStatus, 'confirmed');
  assert.equal(notifications.length, 5);
});
