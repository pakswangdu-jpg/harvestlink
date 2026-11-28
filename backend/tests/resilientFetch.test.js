import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createResilientFetch, isTransientNetworkError } from '../src/lib/resilientFetch.js';

function makeResetError(code = 'ECONNRESET') {
  const cause = Object.assign(new Error(`read ${code}`), { code });
  return new TypeError('fetch failed', { cause });
}

test('resilientFetch retries GET requests after transient ECONNRESET and succeeds', async () => {
  let calls = 0;
  const fetchWithRetry = createResilientFetch({
    retryDelayMs: 0,
    retries: 2,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw makeResetError('ECONNRESET');
      return new Response('ok', { status: 200 });
    },
  });

  const response = await fetchWithRetry('https://example.supabase.co/rest/v1/profiles');
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});

test('resilientFetch retries allowlisted idempotent RPC POSTs but not mutating POSTs', async () => {
  let rpcCalls = 0;
  const fetchWithRetry = createResilientFetch({
    retryDelayMs: 0,
    retries: 2,
    retryPostPathPatterns: ['/rest/v1/rpc/expire_donations'],
    fetchImpl: async () => {
      rpcCalls += 1;
      if (rpcCalls === 1) throw makeResetError('ECONNRESET');
      return new Response('0', { status: 200 });
    },
  });

  const rpcResponse = await fetchWithRetry('https://example.supabase.co/rest/v1/rpc/expire_donations', { method: 'POST' });
  assert.equal(rpcResponse.status, 200);
  assert.equal(rpcCalls, 2);

  let orderCalls = 0;
  const orderFetch = createResilientFetch({
    retryDelayMs: 0,
    retries: 2,
    retryPostPathPatterns: ['/rest/v1/rpc/expire_donations'],
    fetchImpl: async () => {
      orderCalls += 1;
      throw makeResetError('ECONNRESET');
    },
  });

  await assert.rejects(
    orderFetch('https://example.supabase.co/rest/v1/orders', { method: 'POST' }),
    (err) => isTransientNetworkError(err),
  );
  assert.equal(orderCalls, 1);
});

test('resilientFetch does not retry aborted requests or non-transient errors', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const fetchWithRetry = createResilientFetch({
    retryDelayMs: 0,
    retries: 2,
    fetchImpl: async () => {
      calls += 1;
      throw makeResetError('ECONNRESET');
    },
  });

  await assert.rejects(fetchWithRetry('https://example.supabase.co/rest/v1/profiles', { signal: controller.signal }));
  assert.equal(calls, 1);
});
