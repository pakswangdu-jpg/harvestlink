import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../backend/src/lib/ApiError.js';

describe('Admin account history', () => {
  it('creates a forbidden admin action error', () => {
    const error = new ApiError('Active admin access required.', 403);
    expect(error.status).toBe(403);
  });
});
