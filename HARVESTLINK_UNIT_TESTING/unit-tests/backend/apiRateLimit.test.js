import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRateLimit } from '../../../backend/src/middleware/apiRateLimit.js';
import { requireAuth } from '../../../backend/src/middleware/requireAuth.js';

vi.mock('../../../backend/src/middleware/requireAuth.js', () => ({ requireAuth: vi.fn() }));

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe('API rate-limit middleware', () => {
  it.each(['/auth/login', '/auth/admin-login'])('leaves POST %s to login-specific middleware', (path) => {
    const response = { setHeader: vi.fn() };
    const next = vi.fn();
    apiRateLimit({ method: 'POST', path, headers: {} }, response, next);
    expect(next).toHaveBeenCalledExactlyOnceWith();
    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it('limits anonymous requests and resets the allowance after the window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T00:00:00Z'));
    const request = { method: 'GET', path: '/products', ip: '192.0.2.10', headers: {} };
    const response = { setHeader: vi.fn() };
    const next = vi.fn();
    for (let count = 0; count < 30; count += 1) apiRateLimit(request, response, next);
    expect(next.mock.calls).toEqual(Array.from({ length: 30 }, () => []));
    next.mockClear();

    apiRateLimit(request, response, next);
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', 60);
    expect(next).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 429, code: 'RATE_LIMITED' }));
    next.mockClear();

    vi.advanceTimersByTime(60_000);
    apiRateLimit(request, response, next);
    expect(next).toHaveBeenCalledExactlyOnceWith();
    expect(response.setHeader).toHaveBeenLastCalledWith('RateLimit-Reset', Math.ceil((Date.now() + 60_000) / 1000));
    expect(response.setHeader).toHaveBeenCalledWith('RateLimit-Remaining', 29);
  });

  it.each([
    [undefined, false],
    [{ status: 401 }, true],
    [{ status: 403, code: 'ADMIN_NETWORK_NOT_ALLOWED' }, false],
  ])('handles authentication outcome %j', (error, usesAnonymousLimit) => {
    const request = {
      method: 'GET', path: '/orders', ip: '192.0.2.20', headers: { authorization: 'Bearer test-session' },
    };
    const response = { setHeader: vi.fn() };
    const next = vi.fn();
    requireAuth.mockImplementation((_request, _response, callback) => callback(error));
    apiRateLimit(request, response, next);
    expect(requireAuth).toHaveBeenCalledWith(request, response, expect.any(Function));
    expect(next).toHaveBeenCalledExactlyOnceWith(...(error ? [error] : []));
    expect(response.setHeader.mock.calls.length > 0).toBe(usesAnonymousLimit);
  });
});
