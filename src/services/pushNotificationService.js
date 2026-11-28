import { apiClient } from './apiClient';
import {
  areBrowserNotificationsEnabled,
  setBrowserNotificationsEnabled,
} from '../utils/browserNotifications';

const PUSH_OWNER_KEY = 'harvestlink:pushSubscriptionOwner';
const SW_PATH = '/sw.js';
let vapidConfigLoaded = false;
let cachedVapidPublicKey = null;

export function isIosDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = String(navigator.userAgent || '');
  return /iphone|ipad|ipod/i.test(ua)
    || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
}

export function isStandalonePwa() {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator?.standalone === true,
  );
}

export function isWebPushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }
  return outputArray;
}

function readStoredOwner() {
  try {
    return window.localStorage.getItem(PUSH_OWNER_KEY) || '';
  } catch {
    return '';
  }
}

function writeStoredOwner(userId) {
  try {
    if (userId) window.localStorage.setItem(PUSH_OWNER_KEY, String(userId));
    else window.localStorage.removeItem(PUSH_OWNER_KEY);
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

async function getServiceWorkerRegistration() {
  if (!isWebPushSupported()) return null;
  const existing = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (existing) return existing;
  return navigator.serviceWorker.register(SW_PATH);
}

async function resolveVapidPublicKey({ useCache = false } = {}) {
  if (useCache && vapidConfigLoaded) return cachedVapidPublicKey;
  const envKey = String(import.meta.env.VITE_VAPID_PUBLIC_KEY || '').trim();
  try {
    const config = await apiClient.get('/notifications/push/config', { fresh: true });
    if (config?.enabled && config.publicKey) {
      vapidConfigLoaded = true;
      cachedVapidPublicKey = config.publicKey;
      return config.publicKey;
    }
    if (config && config.enabled === false) {
      vapidConfigLoaded = true;
      cachedVapidPublicKey = null;
      return null;
    }
  } catch {
    // Fall back to Vite env key if config check fails temporarily
  }
  const resolved = envKey || null;
  vapidConfigLoaded = true;
  cachedVapidPublicKey = resolved;
  return resolved;
}

export async function getPushSubscriptionStatus(userId) {
  const needsHomeScreenInstall = isIosDevice() && !isStandalonePwa();
  if (!isWebPushSupported()) {
    return {
      supported: false,
      needsHomeScreenInstall,
      permission: 'unsupported',
      subscribed: false,
      browserEnabled: false,
      endpoint: null,
    };
  }
  // Preload VAPID config and service worker before tap so iOS Safari keeps user activation.
  void resolveVapidPublicKey().catch(() => {});
  void getServiceWorkerRegistration().catch(() => {});

  const permission = Notification.permission;
  const browserEnabled = permission === 'granted' && areBrowserNotificationsEnabled(userId);
  if (permission !== 'granted') {
    return {
      supported: true,
      needsHomeScreenInstall: false,
      permission,
      subscribed: false,
      browserEnabled: false,
      endpoint: null,
    };
  }
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    if (!subscription) {
      return {
        supported: true,
        needsHomeScreenInstall: false,
        permission,
        subscribed: false,
        browserEnabled,
        endpoint: null,
      };
    }
    const storedOwner = readStoredOwner();
    const isBoundToCurrentUser = !userId || !storedOwner || storedOwner === String(userId);
    return {
      supported: true,
      needsHomeScreenInstall: false,
      permission,
      subscribed: isBoundToCurrentUser,
      browserEnabled,
      endpoint: subscription.endpoint,
    };
  } catch {
    return {
      supported: true,
      needsHomeScreenInstall: false,
      permission,
      subscribed: false,
      browserEnabled,
      endpoint: null,
    };
  }
}

export async function enablePushNotifications(userId) {
  if (!isWebPushSupported()) {
    if (isIosDevice() && !isStandalonePwa()) {
      throw new Error('On iPhone/iPad, tap Share → Add to Home Screen, then open HarvestLink from your Home Screen.');
    }
    throw new Error('Push notifications are not supported in this browser.');
  }

  // Only request browser permission when the user explicitly clicks Enable.
  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    return { enabled: false, permission };
  }

  const publicKey = await resolveVapidPublicKey({ useCache: true });
  if (!publicKey) {
    // Fall back to in-browser notifications when server Web Push VAPID keys are not configured.
    setBrowserNotificationsEnabled(userId, true);
    return { enabled: true, permission: 'granted', mode: 'browser', endpoint: null };
  }

  const registration = await getServiceWorkerRegistration();
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  await apiClient.post('/notifications/push/subscribe', {
    subscription: subscription.toJSON(),
  });
  writeStoredOwner(userId);

  return { enabled: true, permission: 'granted', mode: 'push', endpoint: subscription.endpoint };
}

export async function disablePushNotifications() {
  if (!isWebPushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    if (subscription) {
      const endpoint = subscription.endpoint;
      await apiClient.post('/notifications/push/unsubscribe', { endpoint }).catch(() => {});
      await subscription.unsubscribe().catch(() => {});
    }
  } finally {
    writeStoredOwner('');
  }
}

export async function syncPushSubscriptionForUser(userId) {
  if (!isWebPushSupported() || !userId) return;
  const storedOwner = readStoredOwner();
  if (!storedOwner || storedOwner === String(userId)) return;

  // Account switched on the same browser/device: unsubscribe previous owner
  // so notifications for the previous account are never delivered here.
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    if (subscription) {
      await subscription.unsubscribe().catch(() => {});
    }
  } finally {
    writeStoredOwner('');
  }
}

export async function sendTestPushNotification() {
  return apiClient.post('/notifications/push/test', {});
}
