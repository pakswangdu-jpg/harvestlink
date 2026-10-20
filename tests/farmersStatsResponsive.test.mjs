import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('public farmer statistics remain inside narrow mobile viewports', async () => {
  const source = await readFile(new URL('../src/components/farmers/FarmersStatsRow.jsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/components/farmers/FarmersStatsRow.css', import.meta.url), 'utf8');

  assert.match(source, /className="farmers-stats-row"/);
  assert.match(source, /Verified Farmers/);
  assert.match(source, /Average Rating/);
  assert.match(source, /Products Listed/);
  assert.match(source, /Cities Covered/);
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.farmers-stats-item \{[\s\S]*min-width: 0/);
  assert.match(css, /overflow-wrap: anywhere/);
});
