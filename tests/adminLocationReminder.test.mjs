import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Admin can send a location-completion notification from the missing-location list', async () => {
  const [page, service, routes, notificationBell, schema, migration] = await Promise.all([
    read('../src/features/admin/AdminUserLocations.jsx'),
    read('../src/services/authService.js'),
    read('../backend/src/routes/profiles.routes.js'),
    read('../src/components/notifications/NotificationBell.jsx'),
    read('../supabase/schema.sql'),
    read('../supabase/migrations/20261103_profile_location_reminders.sql'),
  ]);
  assert.match(page, /Notify user/);
  assert.match(page, /sendAdminLocationReminder\(user\.id\)/);
  assert.match(page, /Reminder sent\./);
  assert.match(page, /role=\{reminderState\[user\.id\]\.status === 'error' \? 'alert' : 'status'\}/);
  assert.match(service, /apiClient\.post\(`\/profiles\/\$\{encodeURIComponent\(id\)\}\/location-reminder`/);
  assert.match(routes, /router\.post\('\/:id\/location-reminder', requireAuth, requireRole\('admin'\), sendAdminLocationReminder\)/);
  assert.match(notificationBell, /profile: MapPin/);
  assert.match(schema, /notifications_type_check[\s\S]*'market_price','profile'/);
  assert.match(migration, /drop constraint if exists notifications_type_check/);
  assert.match(migration, /check \(type in \('verification','order','donation','message','payment','market_price','profile'\)\)/);
});
