import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  canFarmerConfirmDonationHandover,
  DONATION_WORKFLOW_STEPS,
  getDonationWorkflowLabel,
  getDonationWorkflowStepIndex,
  isDonationArrivalVerified,
  isDonationPickupTrackable,
  resolveDonationPickupStatus,
} from '../src/utils/donationWorkflow.js';

test('Donation 7-step workflow sequence resolves consistently for Farmer and Stakeholder', () => {
  assert.deepEqual(
    DONATION_WORKFLOW_STEPS.map((s) => s.label),
    [
      'Donation Requested',
      'Accepted by Farmer',
      'Awaiting Stakeholder Pickup',
      'Stakeholder on the Way',
      'Stakeholder Arrived',
      'Awaiting Farmer Confirmation',
      'Donation Confirmed',
    ],
  );

  // 1. Donation Requested
  const requested = { status: 'requested', pickupStatus: 'requested' };
  assert.equal(resolveDonationPickupStatus(requested), 'requested');
  assert.equal(getDonationWorkflowLabel(requested), 'Donation Requested');
  assert.equal(getDonationWorkflowStepIndex(requested), 0);
  assert.equal(isDonationPickupTrackable(requested), false);
  assert.equal(canFarmerConfirmDonationHandover(requested), false);

  // 2 & 3. Accepted by Farmer -> Awaiting Stakeholder Pickup
  const accepted = { status: 'scheduled', pickupStatus: 'accepted' };
  assert.equal(resolveDonationPickupStatus(accepted), 'accepted');
  assert.equal(getDonationWorkflowLabel(accepted), 'Accepted by Farmer');
  assert.equal(isDonationPickupTrackable(accepted), true);

  const awaitingPickup = { status: 'scheduled', pickupStatus: 'awaiting_pickup' };
  assert.equal(resolveDonationPickupStatus(awaitingPickup), 'awaiting_pickup');
  assert.equal(getDonationWorkflowLabel(awaitingPickup), 'Awaiting Stakeholder Pickup');
  assert.equal(isDonationPickupTrackable(awaitingPickup), true);
  assert.equal(canFarmerConfirmDonationHandover(awaitingPickup), false);

  // 4. Stakeholder on the Way
  const onTheWay = {
    status: 'scheduled',
    pickupStatus: 'on_the_way',
    currentLat: 10.312,
    currentLng: 123.888,
  };
  assert.equal(resolveDonationPickupStatus(onTheWay), 'on_the_way');
  assert.equal(getDonationWorkflowLabel(onTheWay), 'Stakeholder on the Way');
  assert.equal(isDonationPickupTrackable(onTheWay), true);
  assert.equal(canFarmerConfirmDonationHandover(onTheWay), false);

  // 5 & 6. Stakeholder Arrived -> Awaiting Farmer Confirmation
  const arrived = {
    status: 'scheduled',
    pickupStatus: 'arrived',
    arrivedAt: '2026-11-12T08:02:10.000Z',
    consecutiveArrivalReadings: 2,
  };
  assert.equal(isDonationArrivalVerified(arrived), true);
  assert.equal(getDonationWorkflowLabel(arrived), 'Stakeholder Arrived');
  assert.equal(canFarmerConfirmDonationHandover(arrived), false);
  assert.equal(canFarmerConfirmDonationHandover({ ...arrived, arrivalNotifiedAt: '2026-11-12T08:03:00.000Z' }), true);
  assert.equal(
    canFarmerConfirmDonationHandover({
      status: 'scheduled',
      pickupStatus: 'awaiting_confirmation',
      arrivedAt: '2026-11-12T08:02:10.000Z',
      consecutiveArrivalReadings: 2,
    }),
    false,
  );

  const awaitingConfirmation = {
    status: 'scheduled',
    pickupStatus: 'awaiting_confirmation',
    arrivedAt: '2026-11-12T08:02:10.000Z',
    consecutiveArrivalReadings: 2,
  };
  assert.equal(resolveDonationPickupStatus(awaitingConfirmation), 'awaiting_confirmation');
  assert.equal(getDonationWorkflowLabel(awaitingConfirmation), 'Awaiting Farmer Confirmation');
  assert.equal(canFarmerConfirmDonationHandover(awaitingConfirmation), false);

  // 7. Donation Confirmed (tracking stops)
  const confirmed = {
    status: 'completed',
    pickupStatus: 'confirmed',
    confirmedAt: '2026-11-12T08:05:00.000Z',
  };
  assert.equal(resolveDonationPickupStatus(confirmed), 'confirmed');
  assert.equal(getDonationWorkflowLabel(confirmed), 'Donation Confirmed');
  assert.equal(getDonationWorkflowStepIndex(confirmed), 6);
  assert.equal(isDonationPickupTrackable(confirmed), false);
  assert.equal(canFarmerConfirmDonationHandover(confirmed), false);
  assert.equal(
    canFarmerConfirmDonationHandover({
      status: 'scheduled',
      pickupStatus: 'awaiting_pickup',
      arrivalNotifiedAt: '2026-11-12T08:03:00.000Z',
    }),
    true,
  );
});

test('DonationPickupTrackingModal and FarmerDonations implement GPS permission gate, arrival banner, and handover confirmation dialog', async () => {
  const modalSource = await readFile(
    new URL('../src/components/orders/DonationPickupTrackingModal.jsx', import.meta.url),
    'utf8',
  );
  const hookSource = await readFile(
    new URL('../src/hooks/useStakeholderDonationPickupSharing.js', import.meta.url),
    'utf8',
  );
  const farmerDonationsSource = await readFile(
    new URL('../src/features/farmer/FarmerDonations.jsx', import.meta.url),
    'utf8',
  );
  const stakeholderRequestsSource = await readFile(
    new URL('../src/features/stakeholder/StakeholderRequests.jsx', import.meta.url),
    'utf8',
  );
  const appShellSource = await readFile(
    new URL('../src/components/layout/AppShell.jsx', import.meta.url),
    'utf8',
  );

  // 1. Automatic popup in AppShell when Farmer accepts Stakeholder donation request
  assert.match(appShellSource, /useStakeholderDonationPickupSharing/);
  assert.match(appShellSource, /<DonationPickupTrackingModal/);
  assert.match(modalSource, /<DeliveryTrackingOverlay\s+open\b/);
  assert.match(modalSource, /Pickup route/);
  assert.match(modalSource, /Stakeholder location/);
  assert.doesNotMatch(modalSource, /<DonationWorkflowStepper record=\{activeRecord\}/);

  // 2. GPS tracking begins only after Stakeholder grants permission, with clear retry when denied
  assert.match(hookSource, /permissionState !== 'granted'/);
  assert.match(hookSource, /navigator\.geolocation\.watchPosition/);
  assert.match(hookSource, /latestPositionRef\.current = \{ coords, timestampMs \}/);
  assert.match(hookSource, /if \(!sessionKey \|\| !latestPositionRef\.current\) return/);
  assert.match(hookSource, /Could not share your GPS location/);
  assert.match(hookSource, /setTrackingLoadError\(error\?\.message/);
  assert.match(appShellSource, /trackingLoadError=\{stakeholderPickup\.trackingLoadError\}/);
  assert.match(appShellSource, /locationAccess\.rawPermission/);
  assert.match(hookSource, /Retry Location Sharing/);
  assert.match(appShellSource, /lastUpdatedAt=\{stakeholderPickup\.lastUpdatedAt\}/);
  assert.match(modalSource, /!hasRecentGps \|\| permissionError/);
  assert.match(modalSource, /Start Live GPS Tracking/);
  assert.match(modalSource, /Retry Location Sharing/);

  // 3. Farmer Arrival Notification and Confirm Donation Handover popup copy match exact specification
  assert.match(modalSource, /Stakeholder Has Arrived/);
  assert.match(modalSource, /I’ve Arrived — Poke Farmer/);
  assert.match(modalSource, /notifyFarmerOfDonationArrival\(donationId, claimId\)/);
  assert.match(modalSource, /donation-poke-farmer/);
  assert.ok(
    modalSource.indexOf('className="donation-poke-farmer"') > modalSource.indexOf('<LiveDeliveryMap'),
    'the poke action should appear below the live tracking map',
  );
  assert.doesNotMatch(stakeholderRequestsSource, /I’ve Arrived — Poke Farmer/);
  assert.match(modalSource, /Wait for them to poke you before confirming the handover/);
  assert.match(modalSource, /Confirm Donation Handover\?/);
  assert.match(
    modalSource,
    /Please confirm that you have successfully handed over the donated products to the Stakeholder\./,
  );
  assert.match(modalSource, /Confirm Donation/);
  assert.match(modalSource, /Handover Confirmation Not Ready/);
  assert.match(modalSource, /must tap the arrival poke button below their live tracking map/);
  assert.match(modalSource, /disabled=\{!canConfirm \|\| confirming\}/);
  assert.match(modalSource, /Stakeholder Reports Arrival/);
  assert.match(modalSource, /handleNotifyFarmer = async/);
  assert.match(modalSource, /ARRIVAL_POKE_COOLDOWN_MS = 60_000/);
  assert.match(modalSource, /disabled=\{notifyingFarmer \|\| pokeCooldownSeconds > 0\}/);
  assert.match(modalSource, /You can poke again in/);
  assert.match(modalSource, /donation-poke-farmer/);
  assert.match(farmerDonationsSource, /canFarmerConfirmDonationHandover/);
  assert.match(farmerDonationsSource, /disabled=\{saving \|\| !canConfirm\}/);
  assert.match(farmerDonationsSource, /Available after the Stakeholder arrival is verified/);
  assert.doesNotMatch(stakeholderRequestsSource, /Poke Farmer to Confirm|I’ve Arrived/);
  assert.match(stakeholderRequestsSource, /Live Pickup Tracking/);
});
