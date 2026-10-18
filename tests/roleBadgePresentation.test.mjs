import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('All account roles share one compact theme-aware badge system', async () => {
  const css = await readFile(new URL('../src/components/common/RoleBadge.css', import.meta.url), 'utf8');
  for (const role of ['admin', 'buyer', 'farmer', 'stakeholder']) {
    assert.ok(css.includes(`.account-role-badge[data-role='${role}']`));
    assert.ok(css.includes(`[data-theme='dark'] .account-role-badge[data-role='${role}']`));
  }
  assert.match(css, /font-size: 12px;\s*font-weight: 600;\s*line-height: 1;\s*letter-spacing: 0/);
  assert.match(css, /width: fit-content/);
  assert.doesNotMatch(css, /box-shadow|gradient|backdrop-filter/);
});

test('Sidebar and profile identity labels share badge styling without altering collapsed avatars', async () => {
  const sidebar = await readFile(new URL('../src/components/layout/SidebarUserCard.jsx', import.meta.url), 'utf8');
  assert.match(sidebar, /className="account-role-badge" data-role=\{user.role\} title=\{subtitle\}/);
  assert.match(sidebar, /sidebar-user-role sidebar-admin-role-collapsed/);
  assert.match(sidebar, /\{subtitle\}/);
  for (const file of ['../src/features/profile/Profile.jsx', '../src/features/admin/AdminProfile.jsx']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /className="account-role-badge" data-role=/);
  }
});
