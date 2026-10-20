import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Admin login identity is conditional and does not replace the shared authentication form', async () => {
  const source = await readFile(new URL('../src/features/auth/AuthPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /adminPortal \? 'auth-page-admin' : ''/);
  assert.match(source, /!adminPortal \? <section className="auth-hero">/);
  assert.match(source, /adminPortal && authStage === 'form' \? 'HarvestLink Admin Portal'/);
  assert.match(source, /Authorized administrators only\./);
  assert.match(source, /!adminPortal \? <Link className="auth-forgot-link" to="\/forgot-password">Forgot password\?<\/Link> : null/);
  assert.match(source, /onSubmit=\{authStage === 'otp' \? handleVerifyOtp : handleSubmit\}/);
});

test('Admin form uses the dedicated sign-in action and never starts marketplace email verification', async () => {
  const source = await readFile(new URL('../src/features/auth/AuthPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /adminPortal \? await loginAdmin\(form\.email, form\.password\)\s*: await login\(form\.email, form\.password\)/);
  assert.match(source, /!isRegister && !adminPortal && error\.code === 'email_not_confirmed'/);
  const auth = await readFile(new URL('../src/features/auth/AuthContext.jsx', import.meta.url), 'utf8');
  assert.match(auth, /async loginAdmin\(email, password\)\s*\{\s*const user = await loginAdminUser\(email, password\);\s*setCurrentUserState\(user\);/);
});

test('Admin login portal uses a fixed light appearance', async () => {
  const css = await readFile(new URL('../src/features/auth/AdminPortal.css', import.meta.url), 'utf8');
  for (const match of css.matchAll(/([^{}]+)\{/g)) {
    const selector = match[1].trim();
    if (selector.startsWith('@')) continue;
    assert.ok(selector.includes('.auth-page-admin'), selector);
  }
  assert.doesNotMatch(css, /\[data-theme="dark"\]/);
  assert.match(css, /background: #f3f5f4/);
  assert.match(css, /background: #fff/);
  assert.match(css, /box-sizing: border-box/);
  assert.match(css, /input:-webkit-autofill/);
  assert.match(css, /-webkit-text-fill-color: var\(--admin-portal-text\)/);
  assert.match(css, /-webkit-box-shadow: 0 0 0 1000px #fff inset/);
  assert.match(css, /max-width: 420px/);
  assert.match(css, /overflow-y: auto/);
  assert.match(css, /brightness\(0\.78\) saturate\(0\.78\)/);
  assert.match(css, /admin-portal-restriction \{ color: #557262/);
  assert.match(css, /auth-checkbox input \{[\s\S]*?color-scheme: light;[\s\S]*?accent-color: #438f68/);
  assert.match(css, /Segoe UI/);
  assert.doesNotMatch(css, /gradient\(/);
  assert.match(css, /auth-page-admin::before/);
  assert.match(css, /url\('\.\.\/\.\.\/assets\/admin-login-background\.jpg'\)/);
  assert.match(css, /filter: blur\(8px\)/);
  assert.match(css, /pointer-events: none/);
  const image = await readFile(new URL('../src/assets/admin-login-background.jpg', import.meta.url));
  assert.ok(image.length > 0);
});

test('Admin sign-in has no theme toggle and keeps shared theme controls available elsewhere', async () => {
  const source = await readFile(new URL('../src/features/auth/AuthPage.jsx', import.meta.url), 'utf8');
  const toggle = await readFile(new URL('../src/components/common/ThemeToggle.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /ThemeToggle/);
  assert.match(toggle, /setTheme\(isDark \? 'light' : 'dark'\)/);
});
