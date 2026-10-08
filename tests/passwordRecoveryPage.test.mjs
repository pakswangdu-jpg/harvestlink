import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';

const source = (await readFile(new URL('../src/features/auth/ResetPasswordPage.jsx', import.meta.url), 'utf8'))
  .replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replace('export default ', '');
const { code } = await transformWithOxc(source, 'ResetPasswordPage.jsx', { jsx: { runtime: 'classic' } });
const flush = () => new Promise((resolve) => setImmediate(resolve));

function harness(url, verify = async () => ({ data: { session: { user: { id: 'account-1' } } }, error: null })) {
  const values = [];
  const effects = [];
  const calls = [];
  let stateIndex = 0;
  let listener;
  let address = new URL(url);
  const scope = {
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    useState(initial) {
      const index = stateIndex++;
      values[index] = typeof initial === 'function' ? initial() : initial;
      return [values[index], (next) => { values[index] = typeof next === 'function' ? next(values[index]) : next; }];
    },
    useRef: (initial) => ({ current: initial }),
    useEffect: (callback) => effects.push(callback),
    useNavigate: () => () => {},
    useAuth: () => ({ refreshUser: async () => {} }),
    URL, URLSearchParams, console,
    window: {
      get location() { return address; },
      history: { state: {}, replaceState(state, unused, nextUrl) { address = new URL(nextUrl); } },
    },
    supabase: { auth: {
      verifyOtp(options) { calls.push(options); return verify(options); },
      onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
      async getSession() { return { data: { session: null } }; },
    } },
    BrandWordmark: 'brand', Button: 'button', FormField: 'label', Link: 'a', logo: 'logo.png',
  };
  const component = new Function('scope', `with(scope){${code};return ResetPasswordPage;}`)(scope);
  component();
  return {
    effect: effects[0], calls, values,
    address: () => address,
    emit: (...args) => listener(...args),
  };
}

test('new-domain reset page verifies the recovery token and removes it from the visible URL', async () => {
  const page = harness('https://harvestlink.dev/reset-password?token_hash=secret-hash&type=recovery');
  page.effect();
  await flush();
  assert.deepEqual(page.calls, [{ token_hash: 'secret-hash', type: 'recovery' }]);
  assert.equal(page.address().toString(), 'https://harvestlink.dev/reset-password');
  assert.equal(page.values[0], 'ready');
});

test('StrictMode effect replay consumes a single-use token only once', async () => {
  let resolve;
  const page = harness('https://harvestlink.dev/reset-password?token_hash=secret-hash&type=recovery',
    () => new Promise((done) => { resolve = done; }));
  const cleanup = page.effect();
  cleanup();
  page.effect();
  resolve({ data: { session: { user: { id: 'account-1' } } }, error: null });
  await flush();
  assert.equal(page.calls.length, 1);
  assert.equal(page.values[0], 'ready');
});

test('expired, rejected, or sessionless tokens cannot unlock the password form', async () => {
  for (const result of [
    { data: null, error: { code: 'otp_expired' } },
    { data: { session: null }, error: null },
    { data: { session: { user: { id: 'account-1' } } }, error: { message: 'Rejected' } },
  ]) {
    const page = harness('https://harvestlink.dev/reset-password?token_hash=expired&type=recovery', async () => result);
    page.effect();
    await flush();
    assert.equal(page.values[0], 'invalid');
    assert.match(page.values[3], /invalid or has expired/);
  }
});

test('unmount cannot update the form after recovery verification completes', async () => {
  let resolve;
  const page = harness('https://harvestlink.dev/reset-password?token_hash=secret&type=recovery',
    () => new Promise((done) => { resolve = done; }));
  page.effect()();
  resolve({ data: { session: { user: { id: 'account-1' } } }, error: null });
  await flush();
  assert.equal(page.values[0], 'checking');
});

test('existing Supabase recovery links still unlock the page through the recovery event', async () => {
  const page = harness('https://harvestlink.dev/reset-password#type=recovery');
  page.effect();
  page.emit('PASSWORD_RECOVERY', { user: { id: 'account-1' } });
  await flush();
  assert.equal(page.values[0], 'ready');
  assert.equal(page.calls.length, 0);
});
