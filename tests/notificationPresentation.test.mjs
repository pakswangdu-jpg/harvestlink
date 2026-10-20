import assert from 'node:assert/strict';
import { test } from 'node:test';
import { notificationMessage, notificationTitle } from '../src/components/notifications/notificationPresentation.js';

test('payment rejection notifications use concise, human-readable copy', () => {
  const oldNotification = {
    type: 'payment',
    title: '❌ Payment Verification Failed',
    message: 'John Dominic Ibale Zanoria could not verify your GCash payment for Dragon Fruit: Duplicate receipt',
  };

  assert.equal(notificationTitle(oldNotification), 'Payment not approved');
  assert.equal(
    notificationMessage(oldNotification),
    'John Dominic Ibale Zanoria rejected the GCash payment for Dragon Fruit. Reason: Duplicate receipt',
  );
});

test('notification presentation preserves other notification content', () => {
  const notification = { type: 'order', title: 'Order confirmed', message: 'Your order is confirmed.' };
  assert.equal(notificationTitle(notification), 'Order confirmed');
  assert.equal(notificationMessage(notification), 'Your order is confirmed.');
});
