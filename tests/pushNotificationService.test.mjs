import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const pushServiceSource = await readFile(new URL('../src/services/pushNotificationService.js', import.meta.url), 'utf8');
const browserNotifSource = await readFile(new URL('../src/utils/browserNotifications.js', import.meta.url), 'utf8');
const bellSource = await readFile(new URL('../src/components/notifications/NotificationBell.jsx', import.meta.url), 'utf8');

async function loadPushService({
  permission = 'default',
  requestResult = 'granted',
  config = { enabled: false, publicKey: null },
  userAgent = 'Mozilla/5.0',
  standalone = false,
  supportsPush = true,
} = {}) {
  const storage = new Map();
  let currentPermission = permission;
  let subscription = null;
  const apiGets = [];
  const apiPosts = [];

  const NotificationMock = {
    get permission() { return currentPermission; },
    async requestPermission() {
      currentPermission = requestResult;
      return currentPermission;
    },
  };

  const registration = {
    pushManager: {
      async getSubscription() { return subscription; },
      async subscribe() {
        subscription = {
          endpoint: 'https://push.example.com/device-1',
          toJSON() {
            return { endpoint: this.endpoint, keys: { p256dh: 'k1', auth: 'a1' } };
          },
          async unsubscribe() {
            subscription = null;
          },
        };
        return subscription;
      },
    },
  };

  const navigatorMock = {
    userAgent,
    platform: 'iPhone',
    maxTouchPoints: 5,
    standalone,
    ...(supportsPush ? {
      serviceWorker: {
        ready: Promise.resolve(registration),
        async getRegistration() { return registration; },
        async register() { return registration; },
      },
    } : {}),
  };

  const windowMock = {
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, val) => storage.set(key, String(val)),
      removeItem: (key) => storage.delete(key),
    },
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    navigator: navigatorMock,
    matchMedia: () => ({ matches: standalone }),
    ...(supportsPush ? { PushManager: function PushManager() {}, Notification: NotificationMock } : {}),
  };

  const context = vm.createContext({
    Uint8Array,
    String,
    Boolean,
    Promise,
    Error,
    window: windowMock,
    navigator: navigatorMock,
    localStorage: windowMock.localStorage,
    ...(supportsPush ? { Notification: NotificationMock } : {}),
  });

  const browserMod = new vm.SourceTextModule(browserNotifSource, { context });
  await browserMod.link(() => {
    throw new Error('Unexpected import in browserNotifications');
  });
  await browserMod.evaluate();

  const apiClientMod = new vm.SyntheticModule(['apiClient'], function () {
    this.setExport('apiClient', {
      async get(path) {
        apiGets.push(path);
        if (path === '/notifications/push/config') return config;
        return null;
      },
      async post(path, body) {
        apiPosts.push({ path, body });
        return { subscribed: true };
      },
    });
  }, { context });
  await apiClientMod.link(() => {});
  await apiClientMod.evaluate();

  const pushMod = new vm.SourceTextModule(pushServiceSource, {
    context,
    initializeImportMeta(meta) {
      meta.env = {};
    },
  });
  await pushMod.link((specifier) => {
    if (specifier === './apiClient') return apiClientMod;
    if (specifier === '../utils/browserNotifications') return browserMod;
    throw new Error(`Unexpected import: ${specifier}`);
  });
  await pushMod.evaluate();

  return { service: pushMod.namespace, apiGets, apiPosts };
}

test('enabling notifications without server VAPID config activates browser fallback and marks status enabled', async () => {
  const { service, apiPosts } = await loadPushService({
    permission: 'default',
    requestResult: 'granted',
    config: { enabled: false, publicKey: null },
  });

  const before = await service.getPushSubscriptionStatus('user-1');
  assert.equal(before.subscribed, false);
  assert.equal(before.browserEnabled, false);

  const result = await service.enablePushNotifications('user-1');
  assert.deepStrictEqual({ ...result }, { enabled: true, permission: 'granted', mode: 'browser', endpoint: null });
  assert.equal(apiPosts.length, 0);

  const after = await service.getPushSubscriptionStatus('user-1');
  assert.equal(after.permission, 'granted');
  assert.equal(after.browserEnabled, true);
  assert.equal(after.subscribed, false);
});

test('enabling notifications with server VAPID config subscribes Web Push and marks status subscribed', async () => {
  const publicKey = Buffer.alloc(65, 1).toString('base64url');
  const { service, apiPosts } = await loadPushService({
    permission: 'granted',
    config: { enabled: true, publicKey },
  });

  const result = await service.enablePushNotifications('user-2');
  assert.equal(result.enabled, true);
  assert.equal(result.mode, 'push');
  assert.equal(result.endpoint, 'https://push.example.com/device-1');
  assert.equal(apiPosts.length, 1);
  assert.equal(apiPosts[0].path, '/notifications/push/subscribe');

  const after = await service.getPushSubscriptionStatus('user-2');
  assert.equal(after.subscribed, true);
});

test('denied browser permission does not enable notifications', async () => {
  const { service } = await loadPushService({
    permission: 'default',
    requestResult: 'denied',
  });

  const result = await service.enablePushNotifications('user-3');
  assert.deepStrictEqual({ ...result }, { enabled: false, permission: 'denied' });

  const after = await service.getPushSubscriptionStatus('user-3');
  assert.equal(after.subscribed, false);
  assert.equal(after.browserEnabled, false);
});

test('NotificationBell hides the enable-notification bar once notifications are enabled', () => {
  assert.match(bellSource, /const isNotificationsEnabled = pushStatus\.subscribed \|\| pushStatus\.browserEnabled;/);
  assert.match(bellSource, /\{pushStatus\.checked && !isNotificationsEnabled \?/);
  assert.match(bellSource, /Add to Home Screen/);
});

test('iOS browser tabs prompt Add to Home Screen while standalone PWA preloads VAPID config', async () => {
  const iosTab = await loadPushService({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15',
    standalone: false,
    supportsPush: false,
  });
  const tabStatus = await iosTab.service.getPushSubscriptionStatus('ios-user');
  assert.equal(tabStatus.supported, false);
  assert.equal(tabStatus.needsHomeScreenInstall, true);
  await assert.rejects(
    iosTab.service.enablePushNotifications('ios-user'),
    /Add to Home Screen/,
  );

  const publicKey = Buffer.alloc(65, 2).toString('base64url');
  const iosStandalone = await loadPushService({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15',
    standalone: true,
    supportsPush: true,
    permission: 'default',
    requestResult: 'granted',
    config: { enabled: true, publicKey },
  });
  const status = await iosStandalone.service.getPushSubscriptionStatus('ios-user');
  assert.equal(status.supported, true);
  assert.equal(status.needsHomeScreenInstall, false);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const getsBeforeTap = iosStandalone.apiGets.length;
  const enabled = await iosStandalone.service.enablePushNotifications('ios-user');
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.mode, 'push');
  assert.equal(iosStandalone.apiGets.length, getsBeforeTap);
});
