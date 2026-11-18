import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../backend/src/lib/ApiError.js';

describe('Password reset', () => {
  it('creates a 429 rate-limit error', () => {
    const error = new ApiError('Too many requests', 429);
    error.code = 'RATE_LIMITED';
    expect(error.status).toBe(429);
    expect(error.code).toBe('RATE_LIMITED');
  });
});
