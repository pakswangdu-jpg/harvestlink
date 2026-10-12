import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Expanded sidebar brand is centered and leaves room for its collapse control', async () => {
  const css = await readFile(new URL('../src/styles/globals.css', import.meta.url), 'utf8');
  assert.match(css, /\.app-shell:not\(\.sidebar-collapsed\) \.sidebar-brand-row \{[^}]*justify-content: center/);
  assert.match(css, /\.app-shell:not\(\.sidebar-collapsed\) \.sidebar \.brand \{[^}]*max-width: calc\(100% - 42px\)/);
  assert.doesNotMatch(css, /\.app-shell:not\(\.sidebar-collapsed\) \.sidebar \.brand > span:last-child \{[^}]*transform:/);
  assert.match(css, /\.app-shell:not\(\.sidebar-collapsed\) \.sidebar-collapse-toggle \{[^}]*right: 0/);
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
