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

test('Portal surfaces are scoped, neutral, and support dark mode', async () => {
  const css = await readFile(new URL('../src/features/auth/AdminPortal.css', import.meta.url), 'utf8');
  for (const match of css.matchAll(/([^{}]+)\{/g)) {
    const selector = match[1].trim();
    if (selector.startsWith('@')) continue;
    assert.ok(selector.includes('.auth-page-admin'), selector);
  }
  assert.match(css, /\[data-theme="dark"\]/);
  assert.match(css, /Segoe UI/);
  assert.doesNotMatch(css, /gradient\(/);
  assert.match(css, /auth-page-admin::before/);
  assert.match(css, /url\('\.\.\/\.\.\/assets\/admin-login-background\.jpg'\)/);
  assert.match(css, /filter: blur\(8px\)/);
  assert.match(css, /pointer-events: none/);
  const image = await readFile(new URL('../src/assets/admin-login-background.jpg', import.meta.url));
  assert.ok(image.length > 0);
});
