import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { generateForecastInsights } from '../src/lib/geminiService.js';

const forecast = {
  cropName: 'Tomato', municipality: 'Cebu City', periodLabel: 'Next 7 Days',
  currentPrice: 50, predictedPrice: 55, changePercent: 10, unit: 'kg',
};
const insights = { summary: 'Tomato prices may rise.', recommendation: 'Monitor buyer orders.' };
const success = () => Response.json({
  candidates: [{ content: { parts: [{ text: JSON.stringify(insights) }] } }],
});

beforeEach((t) => {
  const envNames = ['GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_FALLBACK_MODELS'];
  const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  process.env.GEMINI_API_KEY = 'test-key';
  delete process.env.GEMINI_MODEL;
  delete process.env.GEMINI_FALLBACK_MODELS;
  t.after(() => {
    for (const name of envNames) {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    }
  });
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
});

// Advance a virtual clock for backoff without waiting or contacting Google.
function mockClock(t) {
  let now = 0;
  const delays = [];
  const timeouts = [];
  t.mock.method(Date, 'now', () => now);
  t.mock.method(Math, 'random', () => 0);
  t.mock.method(globalThis, 'setTimeout', (callback, ms) => {
    delays.push(ms);
    now += ms;
    queueMicrotask(callback);
  });
  t.mock.method(AbortSignal, 'timeout', (ms) => {
    timeouts.push(ms);
    return new AbortController().signal;
  });
  return { delays, timeouts, advance: (ms) => { now += ms; } };
}

test('switches Gemini models after 503 responses using increasing backoff', async (t) => {
  const { delays } = mockClock(t);
  let calls = 0;
  const models = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.includes('test-key'), false);
    assert.equal(options.headers['x-goog-api-key'], 'test-key');
    models.push(url.split('/').at(-1).split(':')[0]);
    calls += 1;
    return calls < 3 ? new Response('', { status: 503 }) : success();
  });
  assert.deepEqual(await generateForecastInsights(forecast), insights);
  assert.equal(calls, 3);
  assert.deepEqual(models, ['gemini-flash-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']);
  assert.deepEqual(delays, [1000, 2000]);
  assert.equal(console.warn.mock.callCount(), 0);
});

test('switches from a missing configured model to a working fallback', async (t) => {
  mockClock(t);
  process.env.GEMINI_MODEL = 'models/retired-model';
  process.env.GEMINI_FALLBACK_MODELS = ' retired-model, models/available-model, available-model ';
  const models = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    models.push(url.split('/').at(-1).split(':')[0]);
    return models.length === 1 ? new Response('', { status: 404 }) : success();
  });
  assert.deepEqual(await generateForecastInsights(forecast), insights);
  assert.deepEqual(models, ['retired-model', 'available-model']);
});

test('an empty fallback setting retries only the configured model', async (t) => {
  mockClock(t);
  process.env.GEMINI_MODEL = 'selected-model';
  process.env.GEMINI_FALLBACK_MODELS = '';
  const models = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    models.push(url.split('/').at(-1).split(':')[0]);
    return models.length < 3 ? new Response('', { status: 503 }) : success();
  });
  assert.deepEqual(await generateForecastInsights(forecast), insights);
  assert.deepEqual(models, ['selected-model', 'selected-model', 'selected-model']);
});

test('persistent overload returns fallback after bounded retries and can recover on a later request', async (t) => {
  mockClock(t);
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
  assert.equal(await generateForecastInsights(forecast), null);
  assert.equal(fetchMock.mock.callCount(), 3);
  assert.equal(console.warn.mock.callCount(), 1);
  assert.equal(console.error.mock.callCount(), 0);
  fetchMock.mock.mockImplementation(async () => success());
  assert.deepEqual(await generateForecastInsights(forecast), insights);
});

test('does not retry invalid API credentials', async (t) => {
  const { delays } = mockClock(t);
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 403 }));
  assert.equal(await generateForecastInsights(forecast), null);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.deepEqual(delays, []);
  assert.equal(console.error.mock.callCount(), 1);
});

test('honors Retry-After seconds and HTTP dates', async (t) => {
  const { delays } = mockClock(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    if (calls === 1) return new Response('', { status: 429, headers: { 'retry-after': '3' } });
    if (calls === 2) return new Response('', {
      status: 503, headers: { 'retry-after': new Date(8000).toUTCString() },
    });
    return success();
  });
  assert.deepEqual(await generateForecastInsights(forecast), insights);
  assert.deepEqual(delays, [3000, 5000]);
});

test('uses fallback immediately when Retry-After exceeds the request budget', async (t) => {
  const { delays } = mockClock(t);
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('', {
    status: 503, headers: { 'retry-after': '60' },
  }));
  assert.equal(await generateForecastInsights(forecast), null);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.deepEqual(delays, []);
});

test('retries a network failure', async (t) => {
  mockClock(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    if (++calls === 1) throw new TypeError('fetch failed');
    return success();
  });
  assert.deepEqual(await generateForecastInsights(forecast), insights);
  assert.equal(calls, 2);
});

test('timeouts share one total budget', async (t) => {
  const clock = mockClock(t);
  t.mock.method(globalThis, 'fetch', async () => {
    clock.advance(clock.timeouts.at(-1));
    throw new DOMException('Timed out', 'TimeoutError');
  });
  assert.equal(await generateForecastInsights(forecast), null);
  assert.deepEqual(clock.timeouts, [8000, 3000]);
  assert.deepEqual(clock.delays, [1000]);
});

test('concurrent identical reports share one request', async (t) => {
  let resolveFetch;
  const fetchMock = t.mock.method(globalThis, 'fetch', () => new Promise((resolve) => { resolveFetch = resolve; }));
  const first = generateForecastInsights(forecast);
  const second = generateForecastInsights({ ...forecast });
  assert.equal(fetchMock.mock.callCount(), 1);
  resolveFetch(success());
  assert.deepEqual(await Promise.all([first, second]), [insights, insights]);
});

test('missing API key uses fallback without a network request', async (t) => {
  delete process.env.GEMINI_API_KEY;
  const fetchMock = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected request'); });
  assert.equal(await generateForecastInsights(forecast), null);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('malformed or incomplete AI output uses fallback', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({
    candidates: [{ content: { parts: [{ text: 'invalid JSON' }] } }],
  }));
  assert.equal(await generateForecastInsights(forecast), null);
  fetchMock.mock.mockImplementation(async () => Response.json({
    candidates: [{ content: { parts: [{ text: '{"summary":{},"recommendation":""}' }] } }],
  }));
  assert.equal(await generateForecastInsights(forecast), null);
});
