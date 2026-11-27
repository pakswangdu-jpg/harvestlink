import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

const FARMER_ID = '10000000-0000-0000-0000-000000000001';
const STAKEHOLDER_A = '20000000-0000-0000-0000-000000000001';
const STAKEHOLDER_B = '20000000-0000-0000-0000-000000000002';
const DONATION_ID = '30000000-0000-0000-0000-000000000001';

let donation;
let claims;
let notifications;
let pushLog;
let failNextDb;
let lockTail = Promise.resolve();

// Serialized row-lock simulator matching PostgreSQL `SELECT ... FOR UPDATE`.
function withRowLock(fn) {
  const next = lockTail.then(fn, fn);
  lockTail = next.catch(() => {});
  return next;
}

const supabaseAdmin = {
  from(table) {
    return {
      select() { return this; },
      eq() { return this; },
      async maybeSingle() {
        if (table === 'donations') return { data: donation, error: null };
        return { data: null, error: null };
      },
    };
  },
  async rpc(name, args) {
    if (name !== 'claim_surplus_donation') return { data: null, error: null };
    return withRowLock(async () => {
      // Simulate async DB work while holding the row lock.
      await new Promise((resolve) => setTimeout(resolve, 10));

      if (failNextDb) {
        failNextDb = false;
        return {
          data: null,
          error: { code: 'XX000', message: 'internal postgres disk write failure at block 42' },
        };
      }

      const { actor_id, target_donation_id, requested_quantity, p_claim_key } = args;

      if (p_claim_key) {
        const existing = claims.find((c) => c.stakeholder_id === actor_id && c.claim_key === p_claim_key);
        if (existing) {
          if (existing.donation_id === target_donation_id && existing.quantity === requested_quantity) {
            return { data: existing, error: null };
          }
          return { data: null, error: { code: '23505', message: 'DUPLICATE_DONATION_CLAIM' } };
        }
      }

      if (donation.status !== 'available' || donation.available_quantity <= 0) {
        return { data: null, error: { code: '23514', message: 'DONATION_NO_LONGER_AVAILABLE' } };
      }

      if (requested_quantity > donation.available_quantity) {
        return { data: null, error: { code: '23514', message: 'INSUFFICIENT_DONATION_STOCK' } };
      }

      if (claims.some((c) => c.donation_id === target_donation_id && c.stakeholder_id === actor_id && ['pending', 'scheduled'].includes(c.status))) {
        return { data: null, error: { code: '23505', message: 'DUPLICATE_DONATION_CLAIM' } };
      }

      // Atomic stock deduction + claim creation + notifications.
      donation.available_quantity = Number((donation.available_quantity - requested_quantity).toFixed(2));
      donation.claimed_quantity = Number((donation.claimed_quantity + requested_quantity).toFixed(2));
      donation.status = donation.available_quantity <= 0 ? 'fully_claimed' : 'available';

      const claim = {
        id: `claim-${claims.length + 1}`,
        donation_id: target_donation_id,
        stakeholder_id: actor_id,
        stakeholder_name: actor_id === STAKEHOLDER_A ? 'Hope Orphanage' : 'Care Foundation',
        quantity: requested_quantity,
        status: 'pending',
        pickup_status: 'requested',
        claim_key: p_claim_key || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      claims.push(claim);
      notifications.push(
        { user_id: donation.farmer_id, title: 'Donation claim received' },
        { user_id: actor_id, title: 'Donation Claimed Successfully' },
      );
      return { data: claim, error: null };
    });
  },
};

mock.module('../src/lib/supabaseClient.js', { namedExports: { supabaseAdmin } });
mock.module('../src/lib/webPushService.js', {
  namedExports: {
    sendPushToUser: async (userId, payload) => {
      pushLog.push({ userId, ...payload });
      return { sent: 1, failed: 0, removedExpired: 0, totalDevices: 1 };
    },
  },
});

const { createDonationClaim } = await import('../src/controllers/donations.controller.js');

async function invokeClaim(actorId, quantity, claimKey = null) {
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; },
  };
  await createDonationClaim({
    profile: { id: actorId, role: 'stakeholder' },
    params: { id: DONATION_ID },
    body: { quantity, ...(claimKey ? { claimKey } : {}) },
  }, res);
  return res;
}

beforeEach(() => {
  donation = {
    id: DONATION_ID,
    farmer_id: FARMER_ID,
    product_name: 'Cabbage',
    unit: 'kg',
    quantity: 1,
    available_quantity: 1,
    claimed_quantity: 0,
    status: 'available',
  };
  claims = [];
  notifications = [];
  pushLog = [];
  failNextDb = false;
  lockTail = Promise.resolve();
});

test('FCFS: two stakeholders simultaneously claiming the last 1 stock allows only the first and returns 409 for the second', async () => {
  const [first, second] = await Promise.allSettled([
    invokeClaim(STAKEHOLDER_A, 1, 'key-a-1'),
    invokeClaim(STAKEHOLDER_B, 1, 'key-b-1'),
  ]);

  assert.equal(first.status, 'fulfilled');
  assert.equal(first.value.statusCode, 201);
  assert.equal(second.status, 'rejected');
  assert.equal(second.reason.status, 409);
  assert.equal(second.reason.code, 'DONATION_NO_LONGER_AVAILABLE');
  assert.equal(second.reason.title, 'Donation No Longer Available');
  assert.equal(
    second.reason.message,
    'This donation has already been claimed by another stakeholder. Please explore other available donations.',
  );

  assert.equal(claims.length, 1);
  assert.equal(donation.available_quantity, 0);
  assert.equal(donation.claimed_quantity, 1);
  assert.equal(donation.status, 'fully_claimed');
  assert.equal(notifications.length, 2);

  // Allow microtask queue to flush async Web Push notifications
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(pushLog.length, 2);
  assert.ok(pushLog.some((entry) => entry.userId === FARMER_ID));
  assert.ok(pushLog.some((entry) => entry.userId === STAKEHOLDER_A && entry.title === 'Donation Claimed Successfully'));
});

test('multiple stakeholders claiming quantities exceeding available stock returns 409 Insufficient Donation Stock', async () => {
  donation.quantity = 5;
  donation.available_quantity = 5;

  const [first, second] = await Promise.allSettled([
    invokeClaim(STAKEHOLDER_A, 4, 'key-a-4'),
    invokeClaim(STAKEHOLDER_B, 3, 'key-b-3'),
  ]);

  assert.equal(first.status, 'fulfilled');
  assert.equal(second.status, 'rejected');
  assert.equal(second.reason.status, 409);
  assert.equal(second.reason.code, 'INSUFFICIENT_DONATION_STOCK');
  assert.equal(second.reason.title, 'Insufficient Donation Stock');
  assert.equal(
    second.reason.message,
    'The requested quantity exceeds the remaining available stock. Please adjust your requested quantity and try again.',
  );
  assert.equal(donation.available_quantity, 1);
  assert.equal(donation.status, 'available');
});

test('repeated clicks / network retries with the same claimKey are idempotent and never double-deduct stock', async () => {
  donation.quantity = 5;
  donation.available_quantity = 5;

  const [first, retry] = await Promise.all([
    invokeClaim(STAKEHOLDER_A, 2, 'same-click-key'),
    invokeClaim(STAKEHOLDER_A, 2, 'same-click-key'),
  ]);

  assert.equal(first.body.id, retry.body.id);
  assert.equal(claims.length, 1);
  assert.equal(donation.available_quantity, 3);
  assert.equal(donation.claimed_quantity, 2);
});

test('failed database transaction rolls back cleanly without deducting stock, sending notifications, or leaking DB errors', async () => {
  failNextDb = true;

  await assert.rejects(
    invokeClaim(STAKEHOLDER_A, 1, 'key-fail'),
    (error) => {
      assert.equal(error.status, 500);
      assert.equal(error.message.includes('postgres'), false);
      assert.equal(error.message.includes('block 42'), false);
      return true;
    },
  );

  assert.equal(claims.length, 0);
  assert.equal(donation.available_quantity, 1);
  assert.equal(donation.status, 'available');
  assert.equal(notifications.length, 0);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(pushLog.length, 0);
});

test('outdated inventory on another device is rejected cleanly on the backend when stock is already exhausted', async () => {
  donation.quantity = 5;
  donation.available_quantity = 5;

  // Device A claims all 5 kg
  const deviceA = await invokeClaim(STAKEHOLDER_A, 5, 'device-a-5');
  assert.equal(deviceA.statusCode, 201);
  assert.equal(donation.available_quantity, 0);

  // Device B still had stale UI showing 5 kg and submits a claim
  await assert.rejects(
    invokeClaim(STAKEHOLDER_B, 5, 'device-b-5'),
    {
      status: 409,
      code: 'DONATION_NO_LONGER_AVAILABLE',
      title: 'Donation No Longer Available',
    },
  );
  assert.equal(donation.available_quantity, 0);
  assert.equal(claims.length, 1);
});
