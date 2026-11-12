import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('map account names wrap inside popup rows on desktop and mobile', async () => {
  const css = await readFile(new URL('../src/styles/globals.css', import.meta.url), 'utf8');
  const buttonRule = css.match(/\.gm-style \.map-popup-overlap button\s*\{([^}]*)\}/)?.[1];
  const nameRule = css.match(/\.gm-style \.map-popup-overlap button strong\s*\{([^}]*)\}/)?.[1];
  const mobileStylesStart = css.indexOf('@media (max-width: 480px)', css.indexOf('.gm-style .map-popup-overlap button strong'));
  const mobileStyles = mobileStylesStart < 0 ? '' : css.slice(mobileStylesStart);
  const mobileButtonRule = mobileStyles.match(/\.gm-style \.map-popup-overlap button\s*\{([^}]*)\}/)?.[1];

  assert.ok(buttonRule);
  assert.match(buttonRule, /box-sizing:\s*border-box/);
  assert.ok(nameRule);
  assert.match(nameRule, /overflow-wrap:\s*anywhere/);
  assert.match(nameRule, /white-space:\s*normal/);
  assert.ok(mobileButtonRule);
  assert.match(mobileButtonRule, /flex-direction:\s*column/);
});
