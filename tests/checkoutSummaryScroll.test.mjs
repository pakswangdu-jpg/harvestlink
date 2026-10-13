import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Order review stays in normal page flow across checkout breakpoints', async () => {
  const css = await readFile(new URL('../src/styles/globals.css', import.meta.url), 'utf8');
  const rules = [...css.matchAll(/(?:\.checkout-page\s+)?\.checkout-summary\s*\{([^}]*)\}/g)];
  assert.ok(rules.some(([, body]) => /position: static/.test(body)));
  for (const [, body] of rules) {
    assert.doesNotMatch(body, /position:\s*(sticky|fixed)/);
    if (/top:/.test(body)) assert.match(body, /top: auto/);
  }
});
