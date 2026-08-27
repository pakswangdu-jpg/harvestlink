const enabledKey = (userId) => `harvestlink:browserNotifications:${userId}`;

export function areBrowserNotificationsEnabled(userId) {
  return Boolean(userId) && localStorage.getItem(enabledKey(userId)) === 'true';
}

export function setBrowserNotificationsEnabled(userId, enabled) {
  if (!userId) return;
  localStorage.setItem(enabledKey(userId), String(enabled));
}

export function canUseBrowserNotifications() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestBrowserNotificationPermission() {
  if (!canUseBrowserNotifications()) return 'unsupported';
  return Notification.requestPermission();
}

export function showBrowserNotification(notification) {
  if (!canUseBrowserNotifications() || Notification.permission !== 'granted') return;
  const browserNotification = new Notification(notification.title, {
    body: notification.message,
    tag: `harvestlink-notification-${notification.id}`,
  });
  browserNotification.onclick = () => {
    window.focus();
    if (notification.link) window.location.assign(notification.link);
    browserNotification.close();
  };
}
