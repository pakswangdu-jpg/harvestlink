import assert from 'node:assert/strict';
import { test } from 'node:test';

test('only Admins can notify eligible accounts with incomplete locations', async (t) => {
  t.mock.method(console, 'error', () => {});
  const calls = [];
  let profile = { id: 'buyer-1', role: 'buyer', latitude: null, longitude: null };
  let insertError = null;
  t.mock.module('../src/lib/supabaseClient.js', {
    namedExports: {
      supabaseAdmin: {
        from(table) {
          calls.push(['from', table]);
          if (table === 'profiles') {
            const query = {
              select(columns) { calls.push(['select-profile', columns]); return this; },
              eq(column, value) { calls.push(['eq', column, value]); return this; },
              maybeSingle() { return Promise.resolve({ data: profile, error: null }); },
            };
            return query;
          }
          return {
            insert(values) {
              calls.push(['insert-notification', values]);
              return Promise.resolve({ error: insertError });
            },
          };
        },
      },
    },
  });

  const { sendAdminLocationReminder } = await import('../src/controllers/profiles.controller.js');
  const call = (role = 'admin') => {
    const response = {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; },
    };
    return sendAdminLocationReminder(
      { profile: { role }, params: { id: 'buyer-1' } },
      response,
    ).then(() => response);
  };

  await assert.rejects(call('buyer'), { status: 403 });
  assert.deepEqual(calls, []);

  const response = await call();
  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.body, { message: 'Profile reminder sent.' });
  const notification = calls.find(([name]) => name === 'insert-notification')?.[1];
  assert.equal(notification.user_id, 'buyer-1');
  assert.equal(notification.type, 'profile');
  assert.equal(notification.link, '/profile');
  assert.equal(
    notification.message,
    'Please add or update your registered address and saved location in your profile so your registered location can be included on the HarvestLink user map.',
  );

  calls.length = 0;
  profile = { id: 'farmer-1', role: 'farmer', latitude: null, longitude: null };
  await call();
  const farmerNotification = calls.find(([name]) => name === 'insert-notification')?.[1];
  assert.equal(
    farmerNotification.message,
    'Please add or update your registered address and saved location in your profile to support the Admin review of your account verification.',
  );

  calls.length = 0;
  profile = { ...profile, latitude: 10.3, longitude: 123.9 };
  await assert.rejects(call(), { status: 409 });
  assert.equal(calls.some(([name]) => name === 'insert-notification'), false);

  calls.length = 0;
  profile = { id: 'admin-1', role: 'admin', latitude: null, longitude: null };
  await assert.rejects(call(), { status: 404 });
  assert.equal(calls.some(([name]) => name === 'insert-notification'), false);

  calls.length = 0;
  profile = { id: 'buyer-1', role: 'buyer', latitude: null, longitude: null };
  insertError = { message: 'Database unavailable' };
  await assert.rejects(call(), { status: 500, message: 'Unable to send the profile reminder. Please try again.' });

  insertError = {
    code: '23514',
    message: 'new row for relation "notifications" violates check constraint "notifications_type_check"',
  };
  await assert.rejects(call(), {
    status: 503,
    message: /Profile reminders are not enabled in the database.*20261103_profile_location_reminders\.sql/,
  });
});
