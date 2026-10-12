import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Sign-in typography uses a clear, restrained system-font hierarchy', async () => {
  const css = await readFile(new URL('../src/styles/globals.css', import.meta.url), 'utf8');
  assert.match(css, /\.auth-page-login,[\s\S]*?font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif/);
  assert.match(css, /\.auth-page-login \.auth-hero h1 \{[\s\S]*?font-size: 46px;[\s\S]*?font-weight: 600;[\s\S]*?line-height: 1\.16/);
  assert.match(css, /\.auth-page-login \.auth-hero p \{[\s\S]*?font-size: 16px;[\s\S]*?font-weight: 400;[\s\S]*?line-height: 1\.65/);
  assert.match(css, /\.auth-page-login \.auth-card-header h2 \{[\s\S]*?font-size: 26px;[\s\S]*?font-weight: 600/);
});
