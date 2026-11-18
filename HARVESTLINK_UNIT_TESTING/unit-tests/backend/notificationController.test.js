import { describe, expect, it, vi } from 'vitest';

const notificationRows = [
  { id: 'n1', user_id: 'u1', read: false, title: 'Update', created_at: '2026-11-19T00:00:00Z' },
];

vi.mock('../../../backend/src/lib/supabaseClient.js', () => ({
  supabaseAdmin: {
    from: vi.fn((table) => {
      const filters = [];
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((key, value) => { filters.push([key, value]); return query; }),
        order: vi.fn(() => query),
        update: vi.fn((row) => {
          notificationRows[0].read = row.read;
          return query;
        }),
        delete: vi.fn(() => query),
        single: vi.fn(async () => ({ data: notificationRows.find((row) => filters.some(([key, value]) => row[key] === value)) || null, error: null })),
        then: undefined,
      };
      Object.defineProperty(query, 'then', {
        value: (resolve) => Promise.resolve({
          data: table === 'notifications' ? notificationRows : [],
          error: null,
        }).then(resolve),
      });
      return query;
    }),
  },
}));

import { listMyNotifications, markAllRead } from '../../../backend/src/controllers/notifications.controller.js';

describe('Notification controller', () => {
  it('lists notifications for the authenticated profile', async () => {
    const res = { json: vi.fn() };
    await listMyNotifications({ profile: { id: 'u1' } }, res);
    expect(res.json).toHaveBeenCalled();
  });
  it('marks all notifications as read', async () => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, end: vi.fn() };
    await markAllRead({ profile: { id: 'u1' } }, res);
    expect(res.statusCode).toBe(204);
  });
});
