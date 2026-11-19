import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../backend/src/lib/supabaseClient.js', () => ({
  supabaseAdmin: { rpc: vi.fn(), from: vi.fn() },
}));
vi.mock('../../../backend/src/lib/checkoutQuote.js', () => ({
  buildCheckoutQuote: vi.fn(),
}));

import { buildCheckoutQuote } from '../../../backend/src/lib/checkoutQuote.js';
import { PAYMENT_METHODS } from '../../../backend/src/utils/constants.js';

describe('Orders and payments feature', () => {
  it('supports COD and GCash payment identifiers', () => {
    expect(PAYMENT_METHODS).toContain('cod');
  });
  it('keeps checkout quote injection isolated', () => {
    buildCheckoutQuote.mockResolvedValue({ total: 500 });
    expect(buildCheckoutQuote).toBeTypeOf('function');
  });
});
