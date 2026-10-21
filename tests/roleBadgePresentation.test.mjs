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
  const sidebarCss = await readFile(new URL('../src/components/layout/SidebarUserCard.css', import.meta.url), 'utf8');
  assert.match(sidebar, /className="account-role-badge" data-role=\{user.role\} title=\{subtitle\} data-verified=\{isVerifiedFarmer \? 'true' : undefined\}/);
  assert.match(sidebar, /sidebar-user-role sidebar-admin-role-collapsed/);
  assert.match(sidebar, /\{subtitle\}/);
  assert.match(sidebarCss, /\.sidebar-user-card \.sidebar-user-name \{[\s\S]*?font-family: var\(--font-ui\);[\s\S]*?font-size: 15px;[\s\S]*?font-weight: 650/);
  assert.match(sidebarCss, /\.sidebar-user-card \.account-role-badge \{[\s\S]*?font-family: var\(--font-ui\);[\s\S]*?font-size: 13px/);
  assert.match(sidebarCss, /\.sidebar-user-card \.account-role-badge\[data-verified='true'\] \{[\s\S]*?font-weight: 700/);
  const css = await readFile(new URL('../src/components/common/RoleBadge.css', import.meta.url), 'utf8');
  assert.match(css, /\.account-role-badge\[data-role='farmer'\]\[data-verified='true'\].*--role-badge-surface: #dcfce7;.*--role-badge-border: #4ade80;.*--role-badge-text: #14532d/);
  assert.match(css, /\[data-theme='dark'\] \.account-role-badge\[data-role='farmer'\]\[data-verified='true'\].*--role-badge-surface: #173d29;.*--role-badge-border: #3e9b5f;.*--role-badge-text: #bbf7d0/);
  for (const file of ['../src/features/profile/Profile.jsx', '../src/features/admin/AdminProfile.jsx']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /className="account-role-badge" data-role=/);
  }
});
