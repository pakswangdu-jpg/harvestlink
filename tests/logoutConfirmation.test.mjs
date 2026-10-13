import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../src/hooks/useLogout.js', import.meta.url), 'utf8');

async function setup(logout = async () => {}) {
  const slots = [];
  let index = 0;
  let logoutCalls = 0;
  const redirects = [];
  const toasts = [];
  const context = vm.createContext({ window: { location: { assign: (url) => redirects.push(url) } } });
  const imports = {
    react: {
      useRef(value) { const slot = index++; return slots[slot] ??= { current: value }; },
      useState(value) {
        const slot = index++;
        if (!(slot in slots)) slots[slot] = value;
        return [slots[slot], (next) => { slots[slot] = next; }];
      },
    },
    '../features/auth/AuthContext': { useAuth: () => ({ logout: async () => { logoutCalls++; await logout(); } }) },
    '../contexts/ToastContext': { useToast: () => ({ showToast: (toast) => toasts.push(toast) }) },
  };
  const module = new vm.SourceTextModule(source, { context });
  await module.link((specifier) => {
    const exports = imports[specifier];
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  });
  await module.evaluate();
  return {
    render() { index = 0; return module.namespace.useLogout(); },
    calls: () => logoutCalls,
    redirects,
    toasts,
  };
}

test('Requesting logout opens confirmation; cancellation keeps the session', async () => {
  const app = await setup();
  await app.render().confirmLogout();
  app.render().handleLogout();
  assert.equal(app.render().isConfirmOpen, true);
  assert.equal(app.calls(), 0);
  app.render().cancelLogout();
  assert.equal(app.render().isConfirmOpen, false);
  assert.equal(app.calls(), 0);
  assert.deepEqual(app.redirects, []);
});

test('Only confirmation logs out and repeated clicks cannot duplicate the request', async () => {
  let resolve;
  const app = await setup(() => new Promise((done) => { resolve = done; }));
  app.render().handleLogout();
  const pending = app.render().confirmLogout();
  await app.render().confirmLogout();
  app.render().cancelLogout();
  assert.equal(app.render().isLoggingOut, true);
  assert.equal(app.render().isConfirmOpen, true);
  assert.equal(app.calls(), 1);
  resolve();
  await pending;
  assert.deepEqual(app.redirects, ['/']);
});

test('Failed logout keeps confirmation available for retry without navigating', async () => {
  const app = await setup(async () => { throw new Error('offline'); });
  app.render().handleLogout();
  await app.render().confirmLogout();
  assert.equal(app.render().isLoggingOut, false);
  assert.equal(app.render().isConfirmOpen, true);
  assert.equal(app.toasts[0].type, 'error');
  assert.deepEqual(app.redirects, []);
  await app.render().confirmLogout();
  assert.equal(app.calls(), 2);
});

test('Desktop and standalone mobile logout controls render the same accessible dialog', async () => {
  for (const name of ['AppShell', 'MobileBottomNav']) {
    const component = await readFile(new URL(`../src/components/layout/${name}.jsx`, import.meta.url), 'utf8');
    assert.match(component, /<LogoutConfirmDialog\s+open=\{isConfirmOpen\}\s+busy=\{isLoggingOut\}\s+onConfirm=\{confirmLogout\}\s+onCancel=\{cancelLogout\}/);
  }
  const dialog = await readFile(new URL('../src/components/common/LogoutConfirmDialog.jsx', import.meta.url), 'utf8');
  assert.match(dialog, /dialog.showModal\(\)/);
  assert.match(dialog, /aria-labelledby=\{titleId\}/);
  assert.match(dialog, /previousFocus.focus\(\)/);
  assert.match(dialog, /disabled=\{busy\} autoFocus>Stay signed in/);
  assert.match(dialog, /You'll need to sign in again to access your account\./);
  assert.match(dialog, /if \(!busy\) onCancel\(\)/);
});
