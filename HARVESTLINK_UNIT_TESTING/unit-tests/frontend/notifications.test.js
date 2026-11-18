import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from '../../../src/utils/formatters.js';

describe('Notifications', () => {
  it('formats a timestamp safely', () => {
    expect(formatRelativeTime(new Date().toISOString())).toBeTruthy();
  });
  it('handles missing timestamps', () => {
    expect(formatRelativeTime(null)).toBe('');
  });
});
