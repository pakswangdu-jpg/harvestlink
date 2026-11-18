import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../backend/src/lib/deliveryFee.js', () => ({
  calculateDeliveryFee: vi.fn(),
}));

import { calculateDeliveryFee } from '../../../backend/src/lib/deliveryFee.js';
import { getDeliveryFeeEstimate } from '../../../backend/src/controllers/deliveryFee.controller.js';

describe('Delivery fee controller', () => {
  it('returns an estimate for farmer delivery', async () => {
    calculateDeliveryFee.mockResolvedValue({ fee: 50, distanceKm: 3, tierLabel: '2–5 km' });
    const res = { json: vi.fn() };
    await getDeliveryFeeEstimate({
      profile: { municipality: 'Cebu City' },
      query: { originMunicipality: 'Mandaue City', deliveryMethod: 'farmer_delivery' },
    }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ fee: 50 }));
  });
  it('rejects invalid origins and methods', async () => {
    await expect(getDeliveryFeeEstimate({
      profile: { municipality: 'Cebu City' },
      query: { originMunicipality: 'Unknown', deliveryMethod: 'invalid' },
    }, {})).rejects.toMatchObject({ status: 400 });
  });
});
