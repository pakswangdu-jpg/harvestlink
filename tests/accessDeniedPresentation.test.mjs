import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';
import { ROLE_DASHBOARDS } from '../src/utils/constants.js';

const element = (type, props, ...children) => ({ type, props: { ...props, children } });

test('403 Access Denied CSS adheres to typography, humanized spacing, and restrained styling', async () => {
  const css = await readFile(new URL('../src/features/auth/AdminProtectedRoute.css', import.meta.url), 'utf8');

  // Typography
  assert.match(css, /font-family:\s*-apple-system,\s*BlinkMacSystemFont,\s*"Segoe UI",\s*Roboto/);
  assert.match(css, /\.admin-access-screen h1\s*\{[^}]*font-size:\s*28px;[^}]*font-weight:\s*600;[^}]*line-height:\s*1\.25;/);
  assert.match(css, /\.admin-access-copy p\s*\{[^}]*font-size:\s*15px;[^}]*font-weight:\s*400;[^}]*line-height:\s*1\.6;/);
  assert.match(css, /\.admin-access-error-code\s*\{[^}]*font-size:\s*13px[^}]*font-weight:\s*500;/);

  // Spacing rhythm
  assert.match(css, /\.admin-access-icon-wrap\s*\{[^}]*width:\s*56px;[^}]*height:\s*56px;[^}]*margin-bottom:\s*18px;/);
  assert.match(css, /\.admin-access-screen h1\s*\{[^}]*margin:\s*0 0 11px;/);
  assert.match(css, /\.admin-access-copy p\s*\{[^}]*margin:\s*0 0 16px;/);
  assert.match(css, /\.admin-access-error-code\s*\{[^}]*margin:\s*0 0 22px/);
  assert.match(css, /\.admin-access-screen > div\s*\{[^}]*max-width:\s*420px;/);

  // Button specifications
  assert.match(css, /\.admin-access-actions :is\(a, button\)\s*\{[^}]*min-height:\s*42px;[^}]*padding:\s*0 18px;[^}]*border-radius:\s*8px;[^}]*font-weight:\s*500;/);

  // Anti-AI-slop rules: no gradients, glassmorphism, or fake card-in-card boxes
  assert.doesNotMatch(css, /linear-gradient|radial-gradient/);
  assert.doesNotMatch(css, /backdrop-filter/);
  assert.doesNotMatch(css, /\.admin-account-denied > div\s*\{[^}]*border:\s*1px solid #e8caca/);

  // Dark mode readability
  assert.match(css, /\[data-theme="dark"\] \.admin-access-screen\s*\{[^}]*background:\s*#131915;/);
  assert.match(css, /\[data-theme="dark"\] \.admin-access-screen h1\s*\{[^}]*color:\s*#edf2ef;/);
  assert.match(css, /\[data-theme="dark"\] \.admin-access-copy p\s*\{[^}]*color:\s*#a4b3a8;/);

  // Mobile responsive behavior
  assert.match(css, /@media \(max-width:\s*640px\)\s*\{[\s\S]*?\.admin-access-screen\s*\{[^}]*padding:\s*24px 20px;/);
  assert.match(css, /@media \(max-width:\s*640px\)\s*\{[\s\S]*?\.admin-access-screen h1\s*\{[^}]*font-size:\s*25px;/);
  assert.match(css, /@media \(max-width:\s*640px\)\s*\{[\s\S]*?\.admin-access-actions :is\(a, button\)\s*\{[^}]*min-height:\s*44px;/);
});

test('AccessDeniedPage component renders restrained CircleX icon, human copy, 403 code, and role-aware return link', async () => {
  const original = await readFile(new URL('../src/features/auth/AccessDeniedPage.jsx', import.meta.url), 'utf8');
  const source = original.replace(/import[^;]+;/g, '').replace('export default ', '');
  const { code } = await transformWithOxc(source, 'AccessDeniedPage.jsx', { jsx: { runtime: 'classic' } });

  for (const role of ['buyer', 'farmer', 'stakeholder', null]) {
    const authState = { currentUser: role ? { id: role, role } : null };
    const AccessDeniedPage = new Function('React', 'Link', 'CircleX', 'useAuth', 'ROLE_DASHBOARDS', `${code};return AccessDeniedPage;`)(
      { createElement: element },
      'Link',
      'CircleX',
      () => authState,
      ROLE_DASHBOARDS,
    );

    const rendered = AccessDeniedPage({});
    assert.equal(rendered.type, 'main');
    assert.ok(rendered.props.className.includes('admin-access-screen'));
    assert.ok(rendered.props.className.includes('admin-account-denied'));

    const container = rendered.props.children[0];
    const [iconWrap, heading, copyWrap, actionsWrap] = container.props.children;

    // Icon wrap
    assert.equal(iconWrap.props.className, 'admin-access-icon-wrap');
    assert.equal(iconWrap.props.children[0].type, 'CircleX');

    // Heading
    assert.equal(heading.type, 'h1');
    assert.equal(heading.props.children[0], 'Access Denied');

    // Copy & Error code
    assert.equal(copyWrap.props.className, 'admin-access-copy');
    assert.equal(copyWrap.props.children[0].props.role, 'alert');
    assert.equal(copyWrap.props.children[0].props.children[0], "You don't have permission to access this page. Check your account access or return to your dashboard.");
    assert.equal(copyWrap.props.children[1].props.className, 'admin-access-error-code');
    assert.equal(copyWrap.props.children[1].props.children[1], 403);

    // Action button / link
    assert.equal(actionsWrap.props.className, 'admin-access-actions');
    const returnLink = actionsWrap.props.children[0];
    assert.equal(returnLink.type, 'Link');
    assert.equal(returnLink.props.to, role ? ROLE_DASHBOARDS[role] : '/');
    assert.equal(returnLink.props.children[0], role ? 'Return to dashboard' : 'Go back');
  }
});
