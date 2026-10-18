import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Buyer full name and saved email are read-only, while other profile fields retain editing', async () => {
  const source = await readFile(new URL('../src/features/profile/Profile.jsx', import.meta.url), 'utf8');
  assert.match(source, /id="name" value=\{isBuyer \? currentUser.name : profileDraft.name\} readOnly=\{isBuyer\}/);
  assert.match(source, /onChange=\{isBuyer \? undefined : \(event\) => updateProfileField\('name'/);
  assert.match(source, /id="profileEmail" type="email" value=\{currentUser.email \|\| ''\} readOnly/);
  assert.match(source, /\.filter\(\(field\) => !isBuyer \|\| field !== 'name'\)/);
  assert.match(source, /id="contactNumber" value=\{profileDraft.contactNumber\} onChange=/);
  const fields = source.slice(source.indexOf('const editableFields = ['), source.indexOf('const payload = Object.fromEntries'));
  assert.doesNotMatch(fields, /'email'/);
});
