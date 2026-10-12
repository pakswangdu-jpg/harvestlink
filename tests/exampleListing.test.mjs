import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Example listing uses the supplied basket photo and keeps its information and destination', async () => {
  const source = await readFile(new URL('../src/features/landing/LandingPage.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('<article className="farmer-listing-example"');
  const card = source.slice(start, source.indexOf('</article>', start));
  for (const value of ['src={cabbagePhoto}', 'Example listing', 'John Dela Cruz', 'Fresh cabbage', 'Carcar City, Cebu', '&#8369;55/kg', '120 kg available', '&#8369;52/kg', 'Browse fresh produce']) {
    assert.ok(card.includes(value), value);
  }
  assert.match(card, /to="\/marketplace"/);
  assert.match(source, /import cabbagePhoto from '\.\.\/\.\.\/assets\/landing-cabbage-basket\.jpg'/);
  assert.match(card, /Whole and halved fresh green cabbages in a woven basket/);
  assert.match(card, /Market reference/);
  assert.doesNotMatch(card, /Suggested market reference:/);
  assert.doesNotMatch(card, /Order progress|Order confirmed|Out for delivery|farmer-example-progress/);
});

test('Example listing style is restrained, scoped and stacks on mobile', async () => {
  const css = await readFile(new URL('../src/features/landing/ExampleListing.css', import.meta.url), 'utf8');
  for (const match of css.matchAll(/([^{}]+)\{/g)) {
    const selector = match[1].trim();
    if (selector.startsWith('@')) continue;
    assert.ok(selector.includes('.landing-farmer-friendly .farmer-listing-example'), selector);
  }
  assert.match(css, /44fr.*56fr/);
  assert.match(css, /object-fit: cover/);
  assert.match(css, /object-position: 55% center/);
  assert.match(css, /font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif/);
  assert.match(css, /border-top: 1px solid var\(--line\)/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /max-width: 900px/);
  assert.match(css, /aspect-ratio: 16 \/ 10/);
  assert.doesNotMatch(css, /gradient\(|blur\(|scale\(|animation:/);
});

test('Listing typography gives prominence only to the product and selling price', async () => {
  const css = await readFile(new URL('../src/features/landing/ExampleListing.css', import.meta.url), 'utf8');
  for (const [selector, size, weight] of [
    ['farmer-example-label', 13, 400],
    ['farmer-example-identity', 14, 500],
    ['farmer-example-product h3', 24, 600],
    ['farmer-example-product p', 15, 400],
    ['farmer-example-price strong', 30, 600],
    ['farmer-example-price span', 15, 400],
    ['farmer-example-reference span:first-child', 13, 400],
    ['farmer-example-reference span:last-child', 14, 500],
    ['farmer-example-link', 14, 600],
  ]) {
    const block = css.slice(css.indexOf(`.${selector} {`)).split('}')[0];
    assert.ok(block.includes(`font-size: ${size}px`), selector);
    assert.ok(block.includes(`font-weight: ${weight}`), selector);
  }
  assert.doesNotMatch(css, /font-weight: [789]00|letter-spacing:\s*-|text-transform: uppercase/);
});
