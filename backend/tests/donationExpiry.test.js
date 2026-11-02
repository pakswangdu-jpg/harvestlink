import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

mock.module('../src/lib/supabaseClient.js', { namedExports: { supabaseAdmin: { rpc: async () => ({ data: 0, error: null }) } } });
const { startDonationExpiryJob } = await import('../src/lib/donationExpiry.js');

test('donation expiry worker runs immediately, repeats, and stops cleanly', async () => {
  let calls = 0;
  const stop = startDonationExpiryJob({ run: async () => { calls += 1; }, intervalMs: 5, logger: { warn() {}, error() {} } });
  await new Promise((resolve) => setTimeout(resolve, 18));
  stop();
  const callsWhenStopped = calls;
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.ok(callsWhenStopped >= 2);
  assert.equal(calls, callsWhenStopped);
});
