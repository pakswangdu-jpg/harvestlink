import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Sidebar control sits beside Home and the brand no longer reserves space for it', async () => {
  const css = await readFile(new URL('../src/styles/globals.css', import.meta.url), 'utf8');
  const shell = await readFile(new URL('../src/components/layout/AppShell.jsx', import.meta.url), 'utf8');
  assert.match(css, /\.app-shell:not\(\.sidebar-collapsed\) \.sidebar-brand-row \{[^}]*justify-content: center/);
  assert.match(css, /\.app-shell:not\(\.sidebar-collapsed\) \.sidebar \.brand \{[^}]*max-width: 100%/);
  assert.doesNotMatch(css, /\.app-shell:not\(\.sidebar-collapsed\) \.sidebar \.brand > span:last-child \{[^}]*transform:/);
  assert.doesNotMatch(css, /\.app-shell:not\(\.sidebar-collapsed\) \.sidebar-collapse-toggle/);
  assert.match(shell, /<nav className="app-breadcrumb" aria-label="Breadcrumb">\s*\{sidebarToggle\}\s*<Link to=\{ROLE_DASHBOARDS\[user\.role\]\} className="app-breadcrumb-home">Home<\/Link>\s*<ChevronRight size=\{13\}/);
  assert.match(shell, /import sidebarHamburger from '\.\.\/\.\.\/assets\/icons\/sidebar-hamburger\.png'/);
  assert.match(shell, /<img src=\{sidebarHamburger\} alt="" aria-hidden="true" \/>/);
  assert.match(shell, /className="app-shell-fullbleed-sidebar-toggle"/);
  assert.match(css, /\.app-breadcrumb \.sidebar-collapse-toggle \{\s*width: 36px;\s*height: 36px;[\s\S]*?border: 1px solid var\(--line\);[\s\S]*?background: var\(--panel\);/);
  assert.match(css, /\.app-breadcrumb \.sidebar-collapse-toggle img \{\s*width: 26px;/);
  assert.doesNotMatch(await readFile(new URL('../src/components/layout/SidebarUserCard.css', import.meta.url), 'utf8'), /sidebar-collapse-toggle/);
  assert.match(css, /\[data-theme="dark"\] \.sidebar-collapse-toggle img \{\s*filter: invert\(1\);/);
  assert.match(css, /\.app-shell:not\(\.sidebar-collapsed\) \.sidebar \.brand strong \{[^}]*font-size: clamp\(14px, 5vw, 18px\)/);
  assert.match(css, /\.app-shell\.sidebar-collapsed \.sidebar-brand-row/);
});

test('All dashboard sidebar roles display the logo mark', async () => {
  const source = await readFile(new URL('../src/components/layout/AppShell.jsx', import.meta.url), 'utf8');
  const sidebarBrand = source.slice(source.indexOf('<div className="sidebar-brand-row">'), source.indexOf('<div className="sidebar-scroll">'));
  assert.match(sidebarBrand, /<span className="brand-mark">\s*<img src=\{logo\} alt="" \/>/);
  assert.match(sidebarBrand, /<strong>\{user\.role === 'admin' \? 'Admin Portal' : <BrandWordmark \/>\}<\/strong>/);
  assert.match(sidebarBrand, /\{user\.role !== 'admin' \? <small>\{`\$\{user\.role\} workspace`\}<\/small> : null\}/);
  const mobileBrandStart = source.indexOf('<Link className="brand mobile-topbar"');
  const mobileBrand = source.slice(mobileBrandStart, source.indexOf('</Link>', mobileBrandStart));
  assert.match(mobileBrand, /src=\{logo\}/);
});

test('Logo-free buyer, farmer and stakeholder sidebar brand text is centered and fits', async () => {
  const css = await readFile(new URL('../src/styles/globals.css', import.meta.url), 'utf8');
  assert.match(css, /\.app-shell:is\(\.role-buyer, \.role-farmer, \.role-stakeholder\):not\(\.sidebar-collapsed\) \.sidebar \.brand\s*\{[^}]*justify-content: center;[^}]*width: 100%;[^}]*max-width: 100%;[^}]*text-align: center;/);
  assert.match(css, /\.app-shell:is\(\.role-buyer, \.role-farmer, \.role-stakeholder\):not\(\.sidebar-collapsed\) \.sidebar \.brand > span:last-child \{[^}]*width: 100%;[^}]*text-align: center/);
  assert.match(css, /\.app-shell:is\(\.role-buyer, \.role-farmer, \.role-stakeholder\):not\(\.sidebar-collapsed\) \.sidebar \.brand strong,[\s\S]*?\.brand small \{[^}]*text-align: center/);
  assert.match(css, /\.app-shell:is\(\.role-buyer, \.role-farmer, \.role-stakeholder\):not\(\.sidebar-collapsed\) \.sidebar \.brand-mark \{[^}]*left: 6px;[^}]*width: 34px;[^}]*height: 34px/);
  assert.match(css, /\.app-shell:is\(\.role-buyer, \.role-farmer, \.role-stakeholder\):not\(\.sidebar-collapsed\) \.sidebar \.brand > span:last-child \{[^}]*left: 50%;[^}]*transform: translate\(-50%, -50%\)/);
});

test('Dark sidebar brand uses a subtle green-gray divider and balanced text colors', async () => {
  const css = await readFile(new URL('../src/styles/globals.css', import.meta.url), 'utf8');
  assert.match(css, /\[data-theme="dark"\] \.app-shell \.sidebar-brand-row \{\s*border-bottom-color: rgba\(120, 150, 130, 0\.2\);/);
  assert.match(css, /\[data-theme="dark"\] \.app-shell \.sidebar \.brand-wordmark-harvest,[\s\S]*?\.brand-wordmark-link \{\s*color: #e8eee9;/);
  assert.match(css, /\[data-theme="dark"\] \.app-shell \.sidebar \.brand small \{\s*color: #b4c0b8;/);
});
