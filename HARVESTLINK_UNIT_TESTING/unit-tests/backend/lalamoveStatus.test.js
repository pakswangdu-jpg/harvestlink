import { describe, expect, it } from 'vitest';
import { LALAMOVE_STATUS_MAP, isForwardProgress } from '../../../backend/src/lib/lalamoveStatusMap.js';

describe('Lalamove status mapping', () => {
  it('maps completed and cancelled statuses', () => {
    expect(LALAMOVE_STATUS_MAP.COMPLETED.deliveryStatus).toBe('delivered');
    expect(LALAMOVE_STATUS_MAP.CANCELED.deliveryStatus).toBe('cancelled');
  });
  it('allows only forward delivery progress', () => {
    expect(isForwardProgress('driver_assigned', 'picked_up')).toBe(true);
    expect(isForwardProgress('picked_up', 'driver_assigned')).toBe(false);
  });
  it('allows cancellation before delivery and rejects after delivery', () => {
    expect(isForwardProgress('picked_up', 'cancelled')).toBe(true);
    expect(isForwardProgress('delivered', 'cancelled')).toBe(false);
  });
});
