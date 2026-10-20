export function notificationTitle(notification) {
  if (notification.type === 'payment' && /payment verification failed/i.test(notification.title || '')) {
    return 'Payment not approved';
  }
  return (notification.title || '').replace(/^❌\s*/, '');
}

export function notificationMessage(notification) {
  if (notification.type !== 'payment') return notification.message;
  const rejection = notification.message?.match(/^(.+?) could not verify your GCash payment for (.+?): (.+)$/i);
  if (!rejection) return notification.message;
  const [, farmer, product, reason] = rejection;
  return `${farmer} rejected the GCash payment for ${product}. Reason: ${reason}`;
}
