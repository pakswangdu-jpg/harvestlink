import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import { test } from 'node:test';

async function findStyles(directory) {
  const styles = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) styles.push(...await findStyles(filename));
    else if (entry.name.endsWith('.css')) styles.push(filename);
  }
  return styles;
}

test('All project styles parse and prefixed line clamps have matching standard declarations', async () => {
  const styles = await findStyles(fileURLToPath(new URL('../src', import.meta.url)));
  let checked = 0;
  for (const filename of styles) {
    const root = postcss.parse(await readFile(filename, 'utf8'), { from: filename });
    root.walkDecls('-webkit-line-clamp', (declaration) => {
      checked += 1;
      assert.ok(declaration.parent.nodes.some((node) => node.type === 'decl'
        && node.prop === 'line-clamp' && node.value === declaration.value),
      `${filename}:${declaration.source.start.line} needs line-clamp: ${declaration.value}`);
    });
  }
  assert.ok(styles.length > 0);
  assert.ok(checked > 0);
});
