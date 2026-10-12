import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';

test('collapsed badges expose the existing count without changing expanded badges', async () => {
  const source = await readFile(new URL('../src/components/common/NotificationBadge.jsx', import.meta.url), 'utf8');
  const { code } = await transformWithOxc(source.replace('export default ', ''), 'NotificationBadge.jsx', { jsx: { runtime: 'classic' } });
  const Badge = new Function('React', `${code};return NotificationBadge;`)({ createElement: (type, props, ...children) => ({ type, props, children }) });
  assert.equal(Badge({ count: 0, collapsed: true }), null);
  assert.equal(Badge({ count: 4, collapsed: true }).props['data-count'], 4);
  assert.equal(Badge({ count: 12, collapsed: true }).props['data-count'], '9+');
  assert.equal(Badge({ count: 4 }).children[0], 4);
  assert.equal(Badge({ count: 12 }).children[0], '9+');
  assert.equal(Badge({ count: 4, collapsed: true }).props['aria-hidden'], 'true');
});

test('sidebar polish is Admin-scoped with consistent icons and responsive density', async () => {
  const css = await readFile(new URL('../src/components/layout/AdminSidebar.css', import.meta.url), 'utf8');
  for (const [, selector] of css.matchAll(/([^{}]+)\{/g)) {
    if (selector.trim().startsWith('@media')) continue;
    assert.ok(selector.includes('.app-shell.role-admin'), `Unscoped selector: ${selector}`);
  }
  assert.match(css, /--sidebar-width: 252px/);
  assert.match(css, /\.sidebar-brand-row \{[\s\S]*?align-items: center;[\s\S]*?border-bottom: 1px solid color-mix/);
  assert.match(css, /\.sidebar \.brand \{ gap: 11px; \}/);
  assert.match(css, /\.sidebar \.brand-mark \{ width: 30px; height: 30px; flex: 0 0 30px; \}/);
  assert.match(css, /\.sidebar \.brand strong \{ display: block; color: #34423a; font-family: var\(--font-ui\); font-size: 18px; font-weight: 600; line-height: 1\.2; letter-spacing: -0\.01em; white-space: nowrap;/);
  assert.match(css, /\.sidebar-collapse-toggle \{ width: 34px; height: 34px; border: 1px solid color-mix[\s\S]*?border-radius: 8px; color: var\(--muted\); \}/);
  assert.match(css, /\.sidebar-nav-icon \{ width: 18px; height: 18px; flex: 0 0 18px;/);
  assert.match(css, /sidebar-nav-link\[aria-current='page'\]::before[\s\S]*?height: 22px;[\s\S]*?border-radius: 0/);
  assert.ok(!css.includes('gradient'));
  assert.match(css, /content: attr\(data-count\)/);
  assert.match(css, /height: 43px/);
  assert.match(css, /stroke-width: 2;/);
  assert.match(css, /\.sidebar-account \.sidebar-user-card \{ box-sizing: border-box; width: 100%; justify-content: center; padding: 8px 12px; gap: 0;/);
  assert.match(css, /\.sidebar-user-details \{ box-sizing: border-box; width: 100%; max-width: 100%; min-width: 0; flex: 1 1 auto; align-items: center; gap: 2px; text-align: center;/);
  assert.match(css, /\.sidebar-user-name \{ display: block; width: 100%; max-width: 100%; white-space: normal; overflow-wrap: anywhere; text-align: center;/);
  assert.match(css, /\.sidebar-user-role \{[^}]*color: #926700;[^}]*font-weight: 600;/);
  assert.match(css, /\.sidebar-admin-role-icon \{ display: block; flex: 0 0 12px; align-self: center; transform: translateY\(1px\);/);
  assert.match(css, /\[data-theme='dark'\] \.app-shell\.role-admin \.sidebar-user-role \{ color: #f0cf69;/);
  assert.match(css, /\[data-theme='dark'\]/);
  assert.match(css, /@media \(max-height: 620px\)/);
});

test('Admin sidebar uses operational nav groups and retains routes and account labels', async () => {
  const shell = await readFile(new URL('../src/components/layout/AppShell.jsx', import.meta.url), 'utf8');
  const nav = await readFile(new URL('../src/features/admin/adminNav.js', import.meta.url), 'utf8');
  assert.match(shell, /label: 'Overview'/);
  assert.match(shell, /label: 'Management'/);
  assert.match(shell, /user\.role === 'admin' \? 'Account' : 'General'/);
  assert.match(shell, /user\.role === 'admin' \? 'Admin Portal' : <BrandWordmark \/>/);
  assert.match(shell, /user\.role !== 'admin' \? <small>\{`\$\{user\.role\} workspace`\}<\/small> : null/);
  for (const label of ['Dashboard', 'Users', 'Price Monitoring', 'Orders', 'Donations', 'Reports', 'Profile']) {
    assert.ok(nav.includes(`label: '${label}'`), `Missing Admin route label: ${label}`);
  }
  assert.match(shell, /aria-label="Logout"/);
});

test('expanded Admin account omits avatar, centers identity, and keeps collapsed role tooltip', async () => {
  const original = await readFile(new URL('../src/components/layout/SidebarUserCard.jsx', import.meta.url), 'utf8');
  const source = original.replace(/import[^;]+;/g, '').replace('export default ', '');
  const { code } = await transformWithOxc(source, 'SidebarUserCard.jsx', { jsx: { runtime: 'classic' } });
  const createElement = (type, props, ...children) => ({ type, props, children });
  const Card = new Function('React', 'Shield', 'CircleCheck', 'Clock3', 'getInitials', `${code};return SidebarUserCard;`)({ createElement }, 'Shield', 'CircleCheck', 'Clock3', () => 'HA');
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...tree.children.flat(Infinity).flatMap(nodes)];
  const admin = { name: 'HarvestLink Admin', role: 'admin' };
  const expanded = nodes(Card({ user: admin }));
  assert.ok(!expanded.some(node => node.props?.className?.includes('sidebar-user-avatar')));
  assert.ok(!expanded.some(node => node.children.includes('HA')));
  assert.ok(expanded.some(node => node.props?.className === 'sidebar-user-details'));
  assert.ok(expanded.some(node => node.type === 'span' && node.children.includes('Administrator')));
  const collapsed = nodes(Card({ user: admin, isCollapsed: true }));
  assert.ok(collapsed.some(node => node.props?.['aria-label'] === 'Administrator'));
  assert.ok(!collapsed.some(node => node.props?.className?.includes('sidebar-user-avatar')));
  const buyer = nodes(Card({ user: { ...admin, role: 'buyer' } }));
  assert.ok(buyer.some(node => node.props?.className === 'sidebar-user-avatar-slot'));
});
