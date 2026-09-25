import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../src/services/apiClient.js', import.meta.url), 'utf8');

async function loadClient(t, fetch, getSession = async () => ({ data: { session: null }, error: null })) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const context = vm.createContext({
    AbortController, DOMException, SyntaxError, fetch,
    window: { setTimeout, clearTimeout },
  });
  const client = new vm.SourceTextModule(source, {
    context,
    initializeImportMeta(meta) {
      meta.env = { VITE_API_URL: 'https://harvestlink.example/api' };
    },
  });
  await client.link(() => new vm.SyntheticModule(['supabase'], function () {
    this.setExport('supabase', { auth: { getSession } });
  }, { context }));
  await client.evaluate();
  return client.namespace.apiClient;
}

test('a backend taking a minute to start can complete without being aborted', async (t) => {
  const client = await loadClient(t, (url, { signal }) => new Promise((resolve, reject) => {
    assert.equal(url, 'https://harvestlink.example/api/profiles/me');
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    setTimeout(() => resolve(Response.json({ id: 'farmer' })), 60000);
  }));
  const result = client.get('/profiles/me');
  const completed = assert.doesNotReject(async () => {
    assert.deepEqual(await result, { id: 'farmer' });
  });
  await setImmediate();
  t.mock.timers.tick(60000);
  await completed;
});

test('a stalled request reports a timeout and the next request gets a fresh signal', async (t) => {
  const signals = [];
  const client = await loadClient(t, (url, { signal }) => {
    signals.push(signal);
    if (signals.length === 2) return Promise.resolve(Response.json({ id: 'farmer' }));
    return new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  });
  const timedOut = assert.rejects(client.get('/profiles/me'), {
    name: 'TimeoutError', message: /90 seconds/,
  });
  await setImmediate();
  t.mock.timers.tick(89999);
  assert.equal(signals[0].aborted, false);
  t.mock.timers.tick(1);
  await timedOut;
  assert.deepEqual(await client.get('/profiles/me'), { id: 'farmer' });
  assert.notEqual(signals[0], signals[1]);
  assert.equal(signals[1].aborted, false);
  t.mock.timers.tick(90000);
  assert.equal(signals[1].aborted, false);
});

test('an older request timing out cannot cancel a newer request', async (t) => {
  const requests = [];
  const client = await loadClient(t, (url, { signal }) => new Promise((resolve, reject) => {
    requests.push({ signal, resolve });
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  const first = assert.rejects(client.get('/products'), { name: 'TimeoutError' });
  await setImmediate();
  t.mock.timers.tick(30000);
  const second = client.get('/products');
  await setImmediate();
  t.mock.timers.tick(60000);
  await first;
  assert.equal(requests[1].signal.aborted, false);
  requests[1].resolve(Response.json([]));
  assert.deepEqual(await second, []);
});

test('the deadline also covers reading the body and identifies its abort as a timeout', { timeout: 1000 }, async (t) => {
  let bodyStarted = false;
  const client = await loadClient(t, async (url, { signal }) => ({
    status: 200,
    ok: true,
    json() {
      bodyStarted = true;
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')), { once: true });
      });
    },
  }));
  const result = assert.rejects(client.get('/products'), { name: 'TimeoutError' });
  await setImmediate();
  assert.equal(bodyStarted, true);
  t.mock.timers.tick(90000);
  await result;
});

test('network failures and unrelated aborts are preserved and their timers are cleared', async (t) => {
  const failures = [new TypeError('Failed to fetch'), new DOMException('Request cancelled', 'AbortError')];
  const signals = [];
  let failure;
  const client = await loadClient(t, async (url, { signal }) => {
    signals.push(signal);
    throw failure;
  });
  for (failure of failures) {
    await assert.rejects(client.get('/products'), (error) => error === failure);
  }
  t.mock.timers.tick(90000);
  assert.ok(signals.every((signal) => !signal.aborted));
});

test('API errors retain their status and message, including non-JSON proxy errors', async (t) => {
  let response;
  const client = await loadClient(t, async () => response);
  for (const status of [401, 403, 429, 500]) {
    response = Response.json({ error: `API error ${status}` }, { status });
    await assert.rejects(client.get('/profiles/me'), { status, message: `API error ${status}` });
  }
  response = new Response('<html>Bad Gateway</html>', { status: 502 });
  await assert.rejects(client.get('/products'), { status: 502, message: 'Request failed with status 502' });
});

test('malformed successful JSON and failed response streams cannot become successful null results', async (t) => {
  let response = new Response('invalid JSON');
  const client = await loadClient(t, async () => response);
  await assert.rejects(client.get('/products'), { name: 'SyntaxError' });
  const failure = new TypeError('Connection terminated');
  response = { status: 200, ok: true, json: async () => { throw failure; } };
  await assert.rejects(client.get('/products'), (error) => error === failure);
});

test('a Supabase session error is propagated before making a backend request', async (t) => {
  const failure = new Error('Session refresh failed');
  let fetches = 0;
  const client = await loadClient(t, async () => {
    fetches += 1;
    return Response.json({});
  }, async () => ({ data: { session: null }, error: failure }));
  await assert.rejects(client.get('/profiles/me'), (error) => error === failure);
  assert.equal(fetches, 0);
});

test('authenticated writes keep their method, token, payload and 204 response behavior', async (t) => {
  const client = await loadClient(t, async (url, options) => {
    assert.equal(url, 'https://harvestlink.example/api/orders');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.equal(options.body, '{"quantity":2}');
    return new Response(null, { status: 204 });
  }, async () => ({ data: { session: { access_token: 'test-token' } }, error: null }));
  assert.equal(await client.post('/orders', { quantity: 2 }), null);
});
