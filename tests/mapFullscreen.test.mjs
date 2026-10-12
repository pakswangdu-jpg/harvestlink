import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('both shared maps override inline page dimensions only in fullscreen', async () => {
  const css = await readFile(new URL('../src/styles/globals.css', import.meta.url), 'utf8');
  const wrapper = css.match(/\.delivery-map-wrapper\.fullscreen,[\s\S]*?\{([^}]+)\}/)[1];
  const canvas = css.match(/\.delivery-map-wrapper\.fullscreen \.delivery-map,[\s\S]*?\{([^}]+)\}/)[1];
  assert.match(wrapper, /height: 100dvh !important/);
  assert.match(wrapper, /width: 100vw !important/);
  assert.match(wrapper, /padding: 0 !important/);
  assert.match(canvas, /height: 100% !important/);
  assert.match(canvas, /width: 100% !important/);
  assert.match(canvas, /max-height: none !important/);
  assert.match(canvas, /margin: 0 !important/);
  assert.match(css, /\.farmer-map-wrapper:fullscreen \.farmer-map/);
  assert.match(css, /\.delivery-map-wrapper:fullscreen \.delivery-map/);
});
