import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import * as webpush from 'web-push';

const store = new Map();
let idCounter = 0;

const supabaseAdmin = {
  from(table) {
    assert.equal(table, 'push_subscriptions');
    const filters = [];
    let pendingUpsert = null;
    let isDelete = false;
    let deleteInIds = null;

    const runQuery = () => {
      if (pendingUpsert) {
        const existing = [...store.values()].find((row) => row.endpoint === pendingUpsert.endpoint);
        const id = existing ? existing.id : `sub-${++idCounter}`;
        const saved = {
          id,
          ...pendingUpsert,
          created_at: existing?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        store.set(id, saved);
        return { data: saved, error: null };
      }
      if (isDelete) {
        if (deleteInIds) {
          deleteInIds.forEach((id) => store.delete(id));
        } else {
          for (const [id, row] of store.entries()) {
            if (filters.every(([col, val]) => row[col] === val)) store.delete(id);
          }
        }
        return { data: null, error: null };
      }
      const rows = [...store.values()].filter((row) => filters.every(([col, val]) => row[col] === val));
      return { data: rows, error: null };
    };

    const builder = {
      select() { return this; },
      eq(col, val) { filters.push([col, val]); return this; },
      in(_col, ids) { deleteInIds = ids; return Promise.resolve(runQuery()); },
      upsert(row) { pendingUpsert = row; return this; },
      delete() { isDelete = true; return this; },
      single() { return Promise.resolve(runQuery()); },
      then(resolve, reject) { return Promise.resolve(runQuery()).then(resolve, reject); },
    };
    return builder;
  },
};

mock.module('../src/lib/supabaseClient.js', { namedExports: { supabaseAdmin } });

const {
  getWebPushPublicConfig,
  listUserPushSubscriptions,
  removePushSubscription,
  sanitizeNotificationLink,
  savePushSubscription,
  sendPushToUser,
  validatePushSubscription,
} = await import('../src/lib/webPushService.js');

const {
  getPushConfig,
  subscribePush,
  unsubscribePush,
} = await import('../src/controllers/notifications.controller.js');

beforeEach(() => {
  store.clear();
  idCounter = 0;
});

test('getWebPushPublicConfig exposes only public key and enabled flag, never private key', () => {
  const unconfigured = getWebPushPublicConfig({});
  assert.deepEqual(unconfigured, { enabled: false, publicKey: null });

  const configured = getWebPushPublicConfig({
    VAPID_PUBLIC_KEY: 'BPublicTestKey123',
    VAPID_PRIVATE_KEY: 'SuperSecretPrivateKey',
    VAPID_SUBJECT: 'mailto:support@harvestlink.dev',
  });
  assert.deepEqual(configured, { enabled: true, publicKey: 'BPublicTestKey123' });
  assert.equal('privateKey' in configured, false);
});

test('validatePushSubscription rejects non-HTTPS endpoints and missing encryption keys', () => {
  assert.throws(() => validatePushSubscription(null), { status: 400 });
  assert.throws(() => validatePushSubscription({
    endpoint: 'http://insecure.example.com/push',
    keys: { p256dh: 'abc', auth: 'def' },
  }), { status: 400 });
  assert.throws(() => validatePushSubscription({
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    keys: { p256dh: '', auth: 'def' },
  }), { status: 400 });

  const valid = validatePushSubscription({
    endpoint: 'https://fcm.googleapis.com/fcm/send/device-1',
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  });
  assert.equal(valid.endpoint, 'https://fcm.googleapis.com/fcm/send/device-1');
});

test('supports multiple devices per user and reassigns endpoint safely on account switch', async () => {
  await savePushSubscription({
    userId: 'user-1',
    subscription: { endpoint: 'https://push.example.com/phone', keys: { p256dh: 'k1', auth: 'a1' } },
  });
  await savePushSubscription({
    userId: 'user-1',
    subscription: { endpoint: 'https://push.example.com/laptop', keys: { p256dh: 'k2', auth: 'a2' } },
  });

  const user1Subs = await listUserPushSubscriptions('user-1');
  assert.equal(user1Subs.count, 2);

  // Account switch on the same phone browser reassigns endpoint to user-2
  await savePushSubscription({
    userId: 'user-2',
    subscription: { endpoint: 'https://push.example.com/phone', keys: { p256dh: 'k1', auth: 'a1' } },
  });

  assert.equal((await listUserPushSubscriptions('user-1')).count, 1);
  assert.equal((await listUserPushSubscriptions('user-2')).count, 1);

  // Logout removes device subscription for user-2 only
  await removePushSubscription({ userId: 'user-2', endpoint: 'https://push.example.com/phone' });
  assert.equal((await listUserPushSubscriptions('user-2')).count, 0);
  assert.equal((await listUserPushSubscriptions('user-1')).count, 1);
});

test('sendPushToUser delivers only to target user devices, sets deduplication tag, and prunes 410 expired devices', async () => {
  await savePushSubscription({
    userId: 'farmer-1',
    subscription: { endpoint: 'https://push.example.com/active', keys: { p256dh: 'k1', auth: 'a1' } },
  });
  await savePushSubscription({
    userId: 'farmer-1',
    subscription: { endpoint: 'https://push.example.com/expired', keys: { p256dh: 'k2', auth: 'a2' } },
  });
  await savePushSubscription({
    userId: 'buyer-1',
    subscription: { endpoint: 'https://push.example.com/other-user', keys: { p256dh: 'k3', auth: 'a3' } },
  });

  const delivered = [];
  const fakeSender = async (sub, payload) => {
    if (sub.endpoint.endsWith('/expired')) {
      const err = new Error('Gone');
      err.statusCode = 410;
      throw err;
    }
    delivered.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
  };

  const testKeys = webpush.generateVAPIDKeys();
  const result = await sendPushToUser(
    'farmer-1',
    {
      id: 'notif-42',
      type: 'order',
      title: 'New order received',
      message: 'Buyer ordered 10 kg Cabbage.',
      link: '/farmer-orders',
    },
    {
      sender: fakeSender,
      env: {
        VAPID_PUBLIC_KEY: testKeys.publicKey,
        VAPID_PRIVATE_KEY: testKeys.privateKey,
        VAPID_SUBJECT: 'mailto:support@harvestlink.dev',
      },
    },
  );

  assert.equal(result.sent, 1);
  assert.equal(result.removedExpired, 1);
  assert.equal(result.totalDevices, 2);
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].endpoint, 'https://push.example.com/active');
  assert.equal(delivered[0].payload.tag, 'harvestlink-notification-notif-42');
  assert.equal(delivered[0].payload.link, '/farmer-orders');

  // Expired subscription was automatically pruned, while other user's subscription is untouched
  assert.equal((await listUserPushSubscriptions('farmer-1')).count, 1);
  assert.equal((await listUserPushSubscriptions('buyer-1')).count, 1);
});

test('sanitizeNotificationLink blocks external redirects and push endpoints work for authenticated users', async () => {
  assert.equal(sanitizeNotificationLink('/farmer-orders'), '/farmer-orders');
  assert.equal(sanitizeNotificationLink('https://evil.example/phish'), '/');
  assert.equal(sanitizeNotificationLink('//evil.example/phish'), '/');

  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; },
    end() {},
  };

  await subscribePush({
    profile: { id: 'buyer-9' },
    headers: { 'user-agent': 'TestBrowser/1.0' },
    body: { subscription: { endpoint: 'https://push.example.com/b9', keys: { p256dh: 'p', auth: 'a' } } },
  }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.subscribed, true);

  await unsubscribePush({
    profile: { id: 'buyer-9' },
    body: { endpoint: 'https://push.example.com/b9' },
  }, res);
  assert.equal(res.statusCode, 204);

  await getPushConfig({}, res);
  assert.equal(typeof res.body.enabled, 'boolean');
});
