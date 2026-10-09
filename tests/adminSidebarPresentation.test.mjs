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

test('sidebar polish is Admin-scoped and offsets only expanded menu icons', async () => {
  const css = await readFile(new URL('../src/components/layout/AdminSidebar.css', import.meta.url), 'utf8');
  for (const [, selector] of css.matchAll(/([^{}]+)\{/g)) {
    assert.ok(selector.includes('.app-shell.role-admin'), `Unscoped selector: ${selector}`);
  }
  assert.ok(!css.includes('--sidebar-width:'));
  assert.ok(!css.includes('1.5in'));
  assert.ok(!css.includes('@media'));
  assert.match(css, /:not\(\.sidebar-collapsed\) \.sidebar-scroll \.sidebar-nav-icon \{ position: relative; left: 4px;/);
  assert.ok(!css.includes('gradient'));
  assert.match(css, /content: attr\(data-count\)/);
  assert.match(css, /height: 44px/);
  assert.match(css, /stroke-width: 2\.25/);
  assert.match(css, /\[data-theme='dark'\]/);
});

test('Admin profile removes initials while other roles retain their avatar', async () => {
  const original = await readFile(new URL('../src/components/layout/SidebarUserCard.jsx', import.meta.url), 'utf8');
  const source = original.replace(/import[^;]+;/g, '').replace('export default ', '');
  const { code } = await transformWithOxc(source, 'SidebarUserCard.jsx', { jsx: { runtime: 'classic' } });
  const createElement = (type, props, ...children) => ({ type, props, children });
  const Card = new Function('React', 'Shield', 'CircleCheck', 'Clock3', 'getInitials', `${code};return SidebarUserCard;`)({ createElement }, 'Shield', 'CircleCheck', 'Clock3', () => 'HA');
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...tree.children.flat(Infinity).flatMap(nodes)];
  const admin = { name: 'HarvestLink Admin', role: 'admin' };
  const expanded = nodes(Card({ user: admin }));
  assert.ok(!expanded.some(node => node.props?.className?.includes('sidebar-user-avatar')));
  assert.ok(expanded.some(node => node.type === 'span' && node.children.includes('Administrator')));
  const collapsed = nodes(Card({ user: admin, isCollapsed: true }));
  assert.ok(collapsed.some(node => node.props?.['aria-label'] === 'Administrator'));
  assert.ok(!collapsed.some(node => node.props?.className?.includes('sidebar-user-avatar')));
  const buyer = nodes(Card({ user: { ...admin, role: 'buyer' } }));
  assert.ok(buyer.some(node => node.props?.className === 'sidebar-user-avatar-slot'));
});
