import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Admin distinguishes automatic suspension from manual deactivation and retains reactivation', async () => {
  const source = await readFile(new URL('../src/features/admin/AdminUsers.jsx', import.meta.url), 'utf8');
  assert.match(source, /user\.inactivitySuspendedAt \? 'Suspended' : 'Deactivated'/);
  assert.match(source, /\['Suspension reason', 'Six months of inactivity'\]/);
  assert.match(source, /USER_AUTO_SUSPENDED: 'Automatically suspended for inactivity'/);
  assert.match(source, /entry\.action === 'USER_AUTO_SUSPENDED' \? 'System'/);
  assert.match(source, /Admin accounts are exempt/);
  assert.match(source, /'Reactivate account'/);
  assert.match(source, /await setAccountStatus\(user\.id, action, user\.accountStatus\)/);
});
