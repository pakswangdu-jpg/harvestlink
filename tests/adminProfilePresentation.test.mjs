import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';
const validators = await readFile(new URL('../src/utils/validators.js', import.meta.url), 'utf8');
const { hasErrors, validatePasswordForm } = new Function(`${validators.replace(/import[^;]+;/g, '').replace(/export /g, '')}; return {hasErrors, validatePasswordForm};`)();

const nodes = (tree) => !tree || typeof tree !== 'object' ? [] : [tree, ...(tree.props?.children || []).flat(Infinity).flatMap(nodes)];
const text = (tree) => typeof tree === 'string' ? tree : (tree?.props?.children || []).flat(Infinity).map(text).join('');

async function fixture(user, changePassword = async () => {}) {
  const original = await readFile(new URL('../src/features/admin/AdminProfile.jsx', import.meta.url), 'utf8');
  const source = original.replace(/import[^;]+;/g, '').replace('export default ', '');
  const { code } = await transformWithOxc(source, 'AdminProfile.jsx', { jsx: { runtime: 'classic' } });
  const state = []; let index = 0;
  const ref = { current: false };
  const scope = {
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    useAuth: () => ({ currentUser: user }),
    useState: initial => { const i = index++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
    useRef: () => ref, hasErrors, validatePasswordForm, changePassword,
    getInitials: () => 'HA', formatDate: value => value || 'Not available', adminNavItems: [],
  };
  for (const key of ['AppShell', 'PageHeader', 'Button', 'FormField', 'FormAlert', 'Lock', 'ShieldCheck']) scope[key] = key;
  const Page = new Function('scope', `with(scope){${code};return AdminProfile;}`)(scope);
  return { render: () => { index = 0; return Page(); }, state };
}

test('Admin profile presents saved account information without invented activity or security data', async () => {
  const view = await fixture({ id: 'admin', name: 'Saved Admin', email: 'saved@example.com', accountStatus: 'active', createdAt: '2026-07-13', role: 'admin' });
  const tree = view.render(); const all = nodes(tree);
  assert.equal(tree.props.pageClassName, 'admin-profile-page');
  const rows = all.filter(node => node.type === 'dl')[0].props.children.flat();
  assert.deepEqual(rows.map(text), ['Emailsaved@example.com', 'RoleAdministrator', 'Account statusActive', 'Member since2026-07-13']);
  assert.match(text(tree), /Admin network restrictionEnabled/);
  assert.doesNotMatch(text(tree), /Last sign in|Two-step verification|Recent admin activity|ADMIN_ALLOWED_IPS/);
  const unknown = await fixture({ id: 'admin', name: 'Admin', role: 'admin' });
  assert.match(text(unknown.render()), /Account statusNot available/);
});

test('Password action reuses the existing service, validates, prevents duplicate submissions, and clears secrets', async () => {
  const calls = []; let complete;
  const view = await fixture({ id: 'admin', name: 'Admin', role: 'admin' }, (...args) => { calls.push(args); return new Promise(resolve => { complete = resolve; }); });
  nodes(view.render()).find(node => node.type === 'Button' && text(node).includes('Change password')).props.onClick();
  const form = () => nodes(view.render()).find(node => node.type === 'form');
  await form().props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 0);
  assert.ok(view.state[2].currentPassword);
  const fields = nodes(view.render()).filter(node => node.type === 'input');
  ['current-secret', 'new-secret', 'new-secret'].forEach((value, i) => fields[i].props.onChange({ target: { value } }));
  const pending = form().props.onSubmit({ preventDefault() {} });
  assert.equal(form().props['aria-busy'], true);
  await form().props.onSubmit({ preventDefault() {} });
  assert.deepEqual(calls, [['admin', 'current-secret', 'new-secret']]);
  complete(); await pending;
  assert.equal(form(), undefined);
  assert.deepEqual(view.state[1], { currentPassword: '', newPassword: '', confirmPassword: '' });
  assert.equal(view.state[3], 'Password changed.');
});

test('Admin navigation labels match Profile without changing other roles', async () => {
  const shell = await readFile(new URL('../src/components/layout/AppShell.jsx', import.meta.url), 'utf8');
  assert.match(shell, /label=\{user.role === 'admin' \? 'Profile' : 'Settings'\}/);
  const css = await readFile(new URL('../src/features/admin/AdminProfile.css', import.meta.url), 'utf8');
  assert.match(css, /max-width: 1080px/);
  assert.match(css, /\[data-theme="dark"\]/);
  assert.match(css, /@media \(max-width: 600px\)/);
});
