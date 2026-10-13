import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Landing organization styles remain page-scoped and keep layout and typography intentional', async () => {
  const css = await readFile(new URL('../src/features/landing/LandingLayout.css', import.meta.url), 'utf8');
  for (const match of css.matchAll(/([^{}]+)\{/g)) {
    const selector = match[1].trim();
    if (selector.startsWith('@')) continue;
    assert.ok(selector.includes('.landing-farmer-friendly'), selector);
  }
  assert.match(css, /max-width: 1180px/);
  assert.match(css, /--farmer-page-inset: 16px/);
  assert.match(css, /\.lp-timeline \{[^}]*max-width: (?:760|920)px/);
  assert.match(css, /\.farmer-directory-action \{[^}]*grid-row: 6/);
  assert.match(css, /\.lp-contact-form \{[^}]*max-width: (?:840|960)px/);
  assert.match(css, /\.lp-donation-copy h2 \{[\s\S]*?font-size: 24px;[\s\S]*?font-weight: 600/);
  assert.match(css, /\.lp-donation-copy p \{[\s\S]*?font-size: 16px;[\s\S]*?font-weight: 400/);
  assert.match(css, /\.lp-donation-actions \.btn \{[^}]*font-size: 15px;[^}]*font-weight: 600/);
  assert.match(css, /\.lp-contact > \.landing-section-heading h2 \{[\s\S]*?font-size: 34px;[\s\S]*?font-weight: 600/);
  assert.match(css, /\.lp-contact-card strong \{[^}]*font-size: 1[34]px;[^}]*font-weight: 600/);
  assert.match(css, /\.lp-contact-card span \{[^}]*font-size: 1[45]px;[^}]*font-weight: 400/);
  assert.match(css, /\.lp-contact-form label \{[^}]*font-size: 14px;[^}]*font-weight: 500/);
});

test('Farmer layout hooks preserve carousel controls, real data and profile destinations', async () => {
  const carousel = await readFile(new URL('../src/components/landing/TopRatedFarmersCarousel.jsx', import.meta.url), 'utf8');
  const card = await readFile(new URL('../src/components/landing/FarmerDirectoryCard.jsx', import.meta.url), 'utf8');
  assert.match(carousel, /landing-farmers-section/);
  assert.match(carousel, /getTopRatedFarmers\(\)/);
  assert.match(carousel, /useEmblaCarousel/);
  assert.match(carousel, /onKeyDown=\{handleKeyDown\}/);
  assert.match(carousel, /onWheel=\{handleWheel\}/);
  assert.match(card, /to=\{`\/farmers\/\$\{farmer.id\}`\}/);
  assert.match(card, /farmer\.avgRating\.toFixed\(1\)/);
  assert.match(card, /farmer\.ratingBreakdown\?\.\[star\]/);
  assert.match(card, /farmer\.completedOrders/);
  assert.doesNotMatch(card, /via-white\/70|bg-gradient-to-r from-transparent/);
});

test('About section keeps its image/content layout balanced and responsive', async () => {
  const css = await readFile(new URL('../src/features/landing/LandingAbout.css', import.meta.url), 'utf8');
  assert.match(css, /\.lp-about \{\s*grid-template-columns: minmax\(0, 0\.44fr\) minmax\(0, 0\.56fr\);\s*gap: 32px;\s*align-items: center;/);
  assert.match(css, /\.lp-about-image \{[\s\S]*?aspect-ratio: 4 \/ 3;[\s\S]*?border-radius: var\(--lp-radius-lg\)/);
  assert.match(css, /object-position: center 58%/);
  assert.match(css, /\.lp-about-block p \{[\s\S]*?font-size: 1rem;[\s\S]*?line-height: 1\.65/);
  assert.match(css, /\.lp-about-highlights \{[\s\S]*?gap: 9px/);
  assert.match(css, /\.lp-pill-badge \{[\s\S]*?min-height: 30px;[\s\S]*?padding: 5px 10px;[\s\S]*?border-radius: 6px/);
  assert.match(css, /@media \(max-width: 900px\) \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?aspect-ratio: 16 \/ 10/);
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*?\.lp-about \{[\s\S]*?gap: 20px/);
});

test('Top-rated farmer section stays compact, readable and responsive', async () => {
  const css = await readFile(new URL('../src/components/landing/TopRatedFarmers.css', import.meta.url), 'utf8');
  const card = await readFile(new URL('../src/components/landing/FarmerDirectoryCard.jsx', import.meta.url), 'utf8');
  assert.match(css, /\.landing-farmers-section \{\s*padding-block: 56px 64px;\s*background: transparent;/);
  assert.match(css, /\.landing-farmers-container \{\s*max-width: 1180px;/);
  assert.match(css, /\.landing-farmers-heading \{\s*max-width: 660px;\s*margin-bottom: 30px;/);
  assert.match(css, /\.landing-farmers-heading h2 \{[\s\S]*?font-size: 32px;[\s\S]*?font-weight: 650;[\s\S]*?line-height: 1\.2/);
  assert.match(css, /\.landing-farmers-heading > p:last-child \{[\s\S]*?font-size: 16px;[\s\S]*?font-weight: 400/);
  assert.match(css, /\.farmer-directory-card \{\s*grid-template-rows: 62px 28px 26px minmax\(90px, auto\) minmax\(24px, 1fr\) 42px;/);
  assert.match(css, /\.farmer-directory-avatar \{\s*width: 50px;\s*height: 50px;/);
  assert.match(css, /\.farmer-directory-identity h3 \{[\s\S]*?font-size: 15px;[\s\S]*?font-weight: 600/);
  assert.match(css, /\.farmer-directory-breakdown \{[\s\S]*?display: grid;[\s\S]*?gap: 5px/);
  assert.match(css, /\.farmer-directory-breakdown > div \{[\s\S]*?margin-top: 0;[\s\S]*?line-height: 14px/);
  assert.doesNotMatch(card, /farmer-directory-breakdown mt-3 space-y-/);
  assert.match(css, /\.farmer-directory-action \{[\s\S]*?width: 100%;[\s\S]*?min-height: 42px;[\s\S]*?border-radius: 8px/);
  assert.match(css, /@media \(max-width: 900px\) \{[\s\S]*?flex-basis: 50%/);
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*?flex-basis: 100%/);
  assert.doesNotMatch(card, /whileHover=/);
});
