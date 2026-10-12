import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activityTitle, partnerDashboardOverview, pickupDay, requestNextStep } from '../src/features/stakeholder/dashboardPresentation.js';

const now = new Date('2026-10-10T17:00:00Z');
test('Partner overview uses Cebu dates, valid saved schedules, and actual statuses', () => {
  const requests = [
    { id: 'future', status: 'scheduled', pickupDate: '2026-10-15' },
    { id: 'today', status: 'scheduled', pickupDate: '2026-10-11' },
    { id: 'past', status: 'scheduled', pickupDate: '2026-10-10' },
    { id: 'invalid', status: 'scheduled', pickupDate: '2026-02-30' },
    { id: 'completed', status: 'completed', pickupDate: '2026-10-11' },
    { id: 'pending', status: 'requested' },
    { id: 'cancelled', status: 'cancelled', pickupDate: '2026-10-11' },
  ];
  const before = structuredClone(requests);
  const result = partnerDashboardOverview(requests, now);
  assert.equal(result.scheduled.length, 4);
  assert.equal(result.completed.length, 1);
  assert.equal(result.awaitingApproval.length, 1);
  assert.equal(result.nextPickup.id, 'today');
  assert.deepEqual(result.attention.map(item => item.id), ['past', 'today']);
  assert.equal(result.attention[1].attentionTitle, 'Pickup scheduled for today');
  assert.deepEqual(requests, before);
});
test('empty Partner records do not invent attention, pickups, or activity', () => {
  const overview = partnerDashboardOverview([], now);
  assert.equal(overview.nextPickup, null);
  assert.deepEqual(overview.attention, []);
  assert.deepEqual(overview.latestActivity, []);
  assert.equal(pickupDay(null), null);
  assert.equal(pickupDay('2026-10-11T09:00:00Z'), null);
});
test('recent lists use real timestamps, are bounded, and describe cancellation correctly', () => {
  const items = Array.from({ length: 7 }, (_, i) => ({ id: i, status: 'cancelled', createdAt: `2026-10-0${i + 1}T00:00:00Z`, updatedAt: `2026-10-0${7 - i}T00:00:00Z` }));
  const result = partnerDashboardOverview(items, now);
  assert.equal(result.recentRequests.length, 5);
  assert.equal(result.recentRequests[0].id, 6);
  assert.equal(result.latestActivity.length, 5);
  assert.equal(result.latestActivity[0].id, 0);
  assert.equal(activityTitle('cancelled'), 'Donation cancelled');
  assert.equal(requestNextStep('requested'), 'Awaiting Farmer response');
});
