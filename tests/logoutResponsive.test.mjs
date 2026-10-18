import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Logout dialog uses content-sized rows and explicit viewport centering', async () => {
  const css = await readFile(new URL('../src/components/common/LogoutConfirmDialog.css', import.meta.url), 'utf8');
  assert.match(css, /position: fixed;\s*inset: auto;\s*top: 50%;\s*left: 50%;\s*transform: translate\(-50%, -50%\)/);
  assert.match(css, /height: fit-content;\s*min-height: 0/);
  assert.match(css, /max-height: calc\(100vh - 32px\);\s*max-height: calc\(100dvh - 32px\)/);
  assert.match(css, /grid-template-rows: repeat\(3, max-content\); align-content: start/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*min-height: 44px/);
});

test('Responsive styling leaves logout confirmation actions and focus behavior unchanged', async () => {
  const source = await readFile(new URL('../src/components/common/LogoutConfirmDialog.jsx', import.meta.url), 'utf8');
  assert.match(source, /dialog.showModal\(\)/);
  assert.match(source, /onClick=\{onCancel\} disabled=\{busy\} autoFocus/);
  assert.match(source, /onClick=\{onConfirm\} disabled=\{busy\}/);
  assert.match(source, /if \(!busy\) onCancel\(\)/);
});
