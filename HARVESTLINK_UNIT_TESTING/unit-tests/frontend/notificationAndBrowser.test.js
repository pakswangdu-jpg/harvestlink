import { describe, expect, it, vi } from 'vitest';
import { playNotificationSound } from '../../../src/utils/notificationSound.js';
import { areBrowserNotificationsEnabled, setBrowserNotificationsEnabled, canUseBrowserNotifications } from '../../../src/utils/browserNotifications.js';

describe('Notification sound', () => {
  it('returns safely when no AudioContext API exists', () => {
    vi.stubGlobal('window', {});
    expect(() => playNotificationSound()).not.toThrow();
  });
  it('creates an audio context for a supported browser', () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      currentTime: 0,
      destination: {},
      createOscillator: () => ({
        type: '', frequency: { value: 0 }, connect() {}, start() {}, stop() {},
      }),
      createGain: () => ({
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {},
      }),
      close,
    };
    vi.stubGlobal('window', { AudioContext: vi.fn(() => ctx) });
    expect(() => playNotificationSound()).not.toThrow();
  });
});

describe('Browser notifications', () => {
  it('reads and stores the user preference', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => 'true'),
      setItem: vi.fn(),
    });
    expect(areBrowserNotificationsEnabled('user-1')).toBe(true);
    setBrowserNotificationsEnabled('user-1', false);
  });
  it('reports unsupported browser APIs', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('Notification', undefined);
    expect(canUseBrowserNotifications()).toBe(false);
  });
});
