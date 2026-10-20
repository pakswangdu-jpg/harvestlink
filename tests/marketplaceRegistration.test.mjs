import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('registration uses a scoped fixed-hero and scrollable-form split without decorative effects', async () => {
  const css = await readFile(new URL('../src/features/auth/MarketplaceRegistration.css', import.meta.url), 'utf8');
  const source = await readFile(new URL('../src/features/auth/AuthPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /auth-page-register auth-page-marketplace-register/);
  assert.match(css, /\.auth-page\.auth-page-marketplace-register \{[\s\S]*?height: 100dvh;[\s\S]*?overflow: hidden/);
  assert.match(css, /\.auth-page\.auth-page-marketplace-register \.auth-card\.auth-card-register \{[\s\S]*?height: 100dvh;[\s\S]*?overflow-y: auto/);
  assert.match(css, /\.auth-page-marketplace-register \.auth-hero \{[\s\S]*?position: fixed;[\s\S]*?width: 50%;[\s\S]*?height: 100dvh/);
  assert.match(css, /\.auth-page\.auth-page-marketplace-register \.auth-card\.auth-card-register \{[\s\S]*?position: fixed;[\s\S]*?width: 50%/);
  assert.match(css, /@media \(max-width: 899px\)[\s\S]*?height: auto;[\s\S]*?overflow: visible/);
  assert.match(css, /photo-1499529112087-3cb3b73cec95/);
  assert.doesNotMatch(css, /(?:linear|radial)-gradient\(|filter:\s*(?:blur|brightness)|box-shadow:\s*0\s+\d+px\s+\d+px/);
  const backdropValues = [...css.matchAll(/(?:-webkit-)?backdrop-filter:\s*([^;]+);/g)]
    .map((match) => match[1].trim());
  assert.ok(backdropValues.every((value) => value === 'none'));
  assert.match(source, /className=\{`register-fields-scroll/);
  assert.match(source, /writeRegisterDraft/);
  assert.match(source, /isRegister \? await register\(submitForm\)/);
});
