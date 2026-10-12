import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Public header styling is confined to the navbar and uses compact proportions', async () => {
  const css = await readFile(new URL('../src/features/landing/LandingHeader.css', import.meta.url), 'utf8');
  for (const match of css.matchAll(/([^{}]+)\{/g)) {
    const selector = match[1].trim();
    if (selector.startsWith('@')) continue;
    assert.ok(selector.includes('.landing-farmer-friendly .landing-nav'), selector);
  }
  assert.match(css, /min-height: 90px/);
  assert.match(css, /min-height: 68px/);
  assert.match(css, /width: 38px; height: 38px/);
  assert.match(css, /width: 16px;\s*height: 2px/);
  assert.match(css, /border-bottom: 1px solid var\(--line\)/);
  assert.match(css, /\.landing-nav \{[\s\S]*?max-width: 1280px;[\s\S]*?min-height: 90px;[\s\S]*?padding: 10px clamp\(24px, 3vw, 32px\)/);
  assert.match(css, /\.landing-nav \.brand-mark \{ width: 38px; height: 38px; padding: 0; background: transparent; \}/);
  assert.match(css, /\.landing-nav \.brand strong \{[\s\S]*?font-size: 29px;[\s\S]*?font-weight: 700;[\s\S]*?letter-spacing: -0\.025em/);
  assert.match(css, /\.landing-nav \.brand strong \{ font-size: 25px; \}/);
  assert.match(css, /\.landing-nav \.brand-wordmark-harvest \{ color: #315c3c; \}/);
  assert.match(css, /\.landing-nav \.brand-wordmark-link \{ color: #80652e; \}/);
  assert.match(css, /\.landing-nav \.brand small \{[\s\S]*?margin-top: 5px;[\s\S]*?font-size: 14px;[\s\S]*?font-weight: 500;[\s\S]*?line-height: 1\.25/);
  assert.match(css, /\.landing-nav \.landing-links \{ justify-self: center; align-items: center; gap: 30px; \}/);
  assert.match(css, /\.landing-nav \.landing-actions \{ justify-self: end; align-items: center; gap: 22px; \}/);
  assert.match(css, /@media \(max-width: 1100px\) \{[\s\S]*?grid-template-columns: minmax\(220px, 1fr\) auto minmax\(180px, 1fr\);[\s\S]*?\.landing-nav \.landing-links \{ gap: 16px; \}/);
  assert.match(css, /@media \(max-width: 900px\) \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto;[\s\S]*?padding-inline: 0;/);
  assert.match(css, /\[data-theme="dark"\] \.landing-farmer-friendly \.landing-nav \.brand-wordmark-harvest \{ color: #eef3ef; \}/);
  assert.match(css, /\[data-theme="dark"\] \.landing-farmer-friendly \.landing-nav \.brand-wordmark-link \{ color: #c8d9cb; \}/);
  assert.match(css, /\[data-theme="dark"\] \.landing-farmer-friendly \.landing-nav \.brand small \{ color: #bac7be; \}/);
  assert.doesNotMatch(css, /\[data-theme="dark"\][\s\S]*?\.brand-mark\s*\{[^}]*background:\s*#f1f6ed/);
  assert.doesNotMatch(css, /gradient\(|blur\(|scale\(/);
});

test('Public header retains the existing labels, routes and mobile menu handler', async () => {
  const source = await readFile(new URL('../src/features/landing/LandingPage.jsx', import.meta.url), 'utf8');
  const nav = source.slice(source.indexOf('<nav className='), source.indexOf('</nav>'));
  assert.match(nav, /<BrandWordmark \/>/);
  assert.match(nav, /Cebu farm-to-market/);
  assert.match(nav, /to="\/login">Login/);
  assert.match(nav, /to="\/register">Create account/);
  assert.match(nav, /href=\{`#\$\{link.id\}`\}/);
  assert.match(nav, /setIsMobileMenuOpen\(\(previous\) => !previous\)/);
  assert.match(nav, /aria-expanded=\{isMobileMenuOpen\}/);
  assert.match(nav, /aria-controls="harvestlink-public-menu"/);
});
