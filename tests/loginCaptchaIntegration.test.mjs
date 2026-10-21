import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('login form requires a loaded CAPTCHA and keeps its token in component state', async () => {
  const form = await readFile(new URL('../src/features/auth/AuthPage.jsx', import.meta.url), 'utf8');
  const widget = await readFile(new URL('../src/components/auth/RecaptchaChallenge.jsx', import.meta.url), 'utf8');
  assert.match(form, /captchaToken, setCaptchaToken/);
  assert.match(form, /!isRegister && !captchaToken/);
  assert.match(form, /!isRecaptchaConfigured \|\| !captchaReady \|\| !captchaToken/);
  assert.match(form, /setCaptchaResetKey\(\(value\) => value \+ 1\)/);
  assert.match(widget, /callbacksRef\.current\.onTokenChange\(token\)/);
  assert.match(widget, /'expired-callback': \(\) => callbacksRef\.current\.onTokenChange\(''\)/);
  assert.doesNotMatch(widget, /localStorage|sessionStorage/);
});

test('marketplace and Admin login use rate-limited server endpoints with CAPTCHA tokens', async () => {
  const routes = await readFile(new URL('../backend/src/routes/auth.routes.js', import.meta.url), 'utf8');
  const normalService = await readFile(new URL('../src/services/authService.js', import.meta.url), 'utf8');
  const adminService = await readFile(new URL('../src/services/adminAuthService.js', import.meta.url), 'utf8');
  const controller = await readFile(new URL('../backend/src/controllers/login.controller.js', import.meta.url), 'utf8');
  assert.match(routes, /router\.post\('\/login', loginRateLimit, login\)/);
  assert.match(routes, /router\.post\('\/admin-login', loginRateLimit, requireAdminEntryNetwork, adminLogin\)/);
  assert.match(normalService, /apiClient\.post\('\/auth\/login', \{ email, password, captchaToken \}\)/);
  assert.match(adminService, /apiClient\.post\('\/auth\/admin-login'/);
  assert.match(controller, /await verifyRecaptchaToken\(req\.body\?\.captchaToken\)/);
  assert.match(controller, /auth\.signInWithPassword\(\{ email, password \}\)/);
  assert.match(controller, /await assertAccountActive\(profile\)/);
});
