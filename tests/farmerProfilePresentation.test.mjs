import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Farmer profile fills its workspace without recentering and keeps readable field groups', async () => {
  const css = await readFile(new URL('../src/features/profile/FarmerProfile.css', import.meta.url), 'utf8');
  assert.match(css, /width: 100%;\s*max-width: none;\s*margin-inline: 0/);
  assert.doesNotMatch(css, /margin-inline: auto|max-width: 1280px/);
  assert.match(css, /\.content-grid.two \{ align-items: start/);
  assert.match(css, /\.info-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /\.btn \{ min-height: 44px/);
  for (const match of css.matchAll(/([^{}]+)\{/g)) {
    if (!match[1].trim().startsWith('@')) assert.ok(match[1].includes('.farmer-profile-page'));
  }
});

test('Farm details remain a single unframed section before the account-completion panel', async () => {
  const source = await readFile(new URL('../src/features/profile/Profile.jsx', import.meta.url), 'utf8');
  assert.equal((source.match(/className="farmer-profile-details"/g) || []).length, 1);
  assert.ok(source.indexOf('className="farmer-profile-details"') < source.indexOf('<ProfileCompletion user={currentUser}'));
  assert.match(source, /file=\{currentUser.govIdFile\}/);
  assert.match(source, /getSignedDocumentUrl\(currentUser.govIdFile\)/);
  assert.match(source, /onSubmit=\{handleGcashSubmit\}/);
});
