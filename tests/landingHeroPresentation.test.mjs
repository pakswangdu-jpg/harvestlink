import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Public hero uses farmer-friendly copy and existing account and marketplace routes', async () => {
  const source = await readFile(new URL('../src/features/landing/LandingPage.jsx', import.meta.url), 'utf8');
  const hero = source.slice(source.indexOf('<section id="home"'), source.indexOf('<section className="farmer-start-section"'));
  assert.match(hero, /Built for Cebu farmers and buyers/);
  assert.match(hero, /Sell your harvest/);
  assert.match(hero, /directly to more buyers/);
  assert.match(hero, /Start selling/);
  assert.match(hero, /<Link className="btn btn-primary btn-lg" to="\/farmer-products">/);
  assert.match(hero, /to="\/marketplace"/);
  assert.match(hero, /Browse marketplace/);
  assert.match(hero, /farmPhoto\} 1085w/);
  assert.match(hero, /farmPhotoEnhanced\} 1539w/);
  assert.match(hero, /Farmers harvesting a rice field/);
  assert.match(hero, /sizes="100vw"/);
  assert.doesNotMatch(hero, /AI-|HERO_STATS|lp-float-stat|dashboard preview/);
  assert.doesNotMatch(source, /500\+|2,000\+|98%|Kathryn Bernardo/);
  assert.match(source, /Example listing/);
  assert.match(source, /How HarvestLink helps farmers/);
  assert.match(source, /List your produce/);
  assert.match(source, /Receive orders/);
  assert.match(source, /Deliver and get paid/);
});

test('Hero styling is scoped and uses separate farm and cabbage listing assets', async () => {
  const css = await readFile(new URL('../src/features/landing/LandingHero.css', import.meta.url), 'utf8');
  assert.match(css, /\.farmer-start-section h2,[\s\S]*?font-size: 28px;[\s\S]*?font-weight: 600/);
  assert.match(css, /\.farmer-start-description \{[^}]*font-size: 16px;[^}]*font-weight: 400/);
  assert.match(css, /\.farmer-start-steps h3,[\s\S]*?font-size: 16px;[\s\S]*?font-weight: 600/);
  assert.match(css, /\.farmer-start-steps p,[\s\S]*?font-size: 15px;[\s\S]*?font-weight: 400/);
  for (const match of css.matchAll(/([^{}]+)\{/g)) {
    const selector = match[1].trim();
    if (selector.startsWith('@')) continue;
    assert.ok(selector.includes('.landing-farmer-friendly'), selector);
  }
  assert.doesNotMatch(css, /gradient\(|blur\(|animation:|font-size:.*vw|letter-spacing:\s*-/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /font-weight: 600/);
  assert.match(css, /max-width: 360px/);
  const image = await readFile(new URL('../src/assets/landing-cabbage-basket.jpg', import.meta.url));
  assert.ok(image.length > 0);
  const farmImage = await readFile(new URL('../src/assets/landing-farm-enhanced.png', import.meta.url));
  assert.equal(farmImage.readUInt32BE(16), 1539);
  assert.equal(farmImage.readUInt32BE(20), 1022);
});

test('Dark mode lifts photo visibility while keeping hero copy bright', async () => {
  const css = await readFile(new URL('../src/features/landing/LandingHero.css', import.meta.url), 'utf8');
  assert.match(css, /\[data-theme="dark"\] \.landing-farmer-friendly \.landing-hero::before\s*\{\s*background: (?:radial-gradient\([\s\S]*?rgb\(12 22 16 \/ 72%\)|rgb\(12 22 16 \/ 56%\))/);
  assert.match(css, /\.landing-hero \.lp-trust-list li\s*\{\s*color: #fff/);
});

test('Mobile hero stacks actions and trust items with readable spacing and image contrast', async () => {
  const css = await readFile(new URL('../src/features/landing/LandingHero.css', import.meta.url), 'utf8');
  assert.match(css, /\.landing-farmer-friendly \.landing-hero \{[\s\S]*?min-height: (?:660px|min\(640px, calc\(100svh - 100px\)\))/);
  const mobile = css.slice(css.indexOf('@media (max-width: 640px)'), css.indexOf('@media (max-width: 360px)'));
  assert.match(mobile, /\.landing-hero::before \{ background: (?:radial-gradient\([^}]*rgb\(12 22 16 \/ 70%\)[^}]*\)|rgb\(12 22 16 \/ 70%\)); \}/);
  assert.match(mobile, /\.farmer-hero-photo \{ object-position: (?:12%|34%) center; \}/);
  assert.match(mobile, /\.hero-copy-block \{[^}]*flex-direction: column/);
  assert.match(mobile, /\.landing-hero h1 \{[^}]*font-size: 32px; line-height: 1\.2/);
  assert.match(mobile, /\.landing-hero h1 br \{ display: none; \}/);
  assert.match(mobile, /\.hero-actions \{[^}]*flex-direction: column/);
  assert.match(mobile, /\.hero-actions \.btn \{[^}]*min-height: 48px/);
  assert.match(mobile, /\.lp-trust-list \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(mobile, /\.farmer-start-section,[\s\S]*padding: 36px 0 28px/);
});

test('Small mobile header keeps the logo and menu comfortably spaced', async () => {
  const css = await readFile(new URL('../src/features/landing/LandingHeader.css', import.meta.url), 'utf8');
  const mobile = css.slice(css.indexOf('@media (max-width: 640px)'), css.indexOf('@media (max-width: 360px)'));
  assert.match(mobile, /\.landing-nav \{ min-height: 68px; gap: 12px; \}/);
  assert.match(mobile, /\.landing-nav \.brand strong \{ font-size: 18px; \}/);
  assert.match(mobile, /\.landing-mobile-menu-toggle \{ width: 44px; min-width: 44px; \}/);
});

test('Landing feature cards use compact readable typography and restrained surfaces', async () => {
  const css = await readFile(new URL('../src/features/landing/LandingHero.css', import.meta.url), 'utf8');
  assert.match(css, /\.landing-feature-grid \{\s*gap: 22px;\s*align-items: stretch;/);
  assert.match(css, /\.landing-feature-grid \.lp-feature-card \{[^}]*padding: 23px;[^}]*grid-template-rows: 56px auto 1fr/);
  assert.match(css, /\.landing-feature-grid \.lp-feature-card \{[^}]*border-radius: 11px;[^}]*background: #fffdfa/);
  assert.match(css, /\.landing-feature-grid \.lp-feature-card:hover \{[^}]*transform: none;[^}]*border-color: #bdcfc1/);
  assert.match(css, /\.landing-feature-grid \.lp-feature-card h3 \{[^}]*margin: 18px 0 12px;[^}]*font-size: 17px;[^}]*font-weight: 600;[^}]*line-height: 1\.3/);
  assert.match(css, /\.landing-feature-grid \.lp-feature-card p \{[^}]*font-size: 15px;[^}]*font-weight: 400;[^}]*line-height: 1\.55/);
  assert.match(css, /font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif/);
  assert.match(css, /\.landing-feature-grid \.lp-feature-card \{[^}]*transition: border-color 150ms ease, box-shadow 150ms ease/);
});

test('Dark landing feature cards use soft surfaces while retaining their grid and content', async () => {
  const css = await readFile(new URL('../src/features/landing/LandingHero.css', import.meta.url), 'utf8');
  const darkCards = css.slice(css.indexOf('[data-theme="dark"] .landing-farmer-friendly .landing-feature-grid'));
  assert.match(darkCards, /\.landing-feature-grid \{\s*row-gap: 26px;\s*padding-block: 20px;\s*background: #101915;/);
  assert.match(darkCards, /\.lp-feature-card \{\s*padding: 28px;\s*border-color: rgb\(160 200 170 \/ 14%\);\s*border-radius: 16px;\s*background: #16211b;\s*box-shadow: none;/);
  assert.match(darkCards, /\.lp-feature-card:hover \{\s*transform: translateY\(-2px\);[\s\S]*?background: #1a2820;/);
  assert.match(darkCards, /\.lp-feature-icon \{[\s\S]*?background: #1d2b23;[\s\S]*?color: #a5d7b2/);
  assert.match(darkCards, /\.lp-feature-card h3 \{[\s\S]*?font-size: 19px;[\s\S]*?font-weight: 600/);
  assert.match(darkCards, /\.lp-feature-card p \{[\s\S]*?color: #b4c1b8;[\s\S]*?font-size: 15px;[\s\S]*?line-height: 1\.6/);
  assert.match(css, /grid-template-rows: repeat\(2, minmax\(0, 1fr\)\)|repeat\(3, minmax\(0, 1fr\)\)/);
});
