import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Quick-view shows the complete photo instead of cropping portrait images', async () => {
  const css = await readFile(new URL('../src/components/cards/ProductQuickView.css', import.meta.url), 'utf8');
  assert.match(css, /\.product-quick-view-overlay \.product-quick-view-image img \{[^}]*min-height: 0;[^}]*object-fit: contain;[^}]*object-position: center/);
});

test('Quick-view keeps the original order route and pending-review action in a separate footer', async () => {
  const source = await readFile(new URL('../src/components/cards/ProductCard.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('<Modal');
  const modal = source.slice(start, source.indexOf('</Modal>', start));
  assert.match(modal, /footer=\{\(/);
  assert.match(modal, /to=\{`\/products\/\$\{product\.id\}`\}/);
  assert.match(modal, /onClick=\{\(\) => setIsQuickViewOpen\(false\)\}/);
  assert.match(modal, /isPendingReview \? 'View listing details' : 'View product & order'/);
  assert.equal((modal.match(/product-quick-view-action/g) || []).length, 1);
});

test('Quick-view alone uses the dynamic viewport and a footer above mobile navigation', async () => {
  const css = await readFile(new URL('../src/components/cards/ProductQuickView.css', import.meta.url), 'utf8');
  for (const match of css.matchAll(/([^{}]+)\{/g)) {
    const selector = match[1].trim();
    if (!selector.startsWith('@')) assert.ok(selector.includes('.product-quick-view-overlay'), selector);
  }
  assert.match(css, /z-index: 200/);
  assert.match(css, /height: 100vh;\s*height: 100dvh/);
  assert.match(css, /\.admin-modal-body \{[^}]*min-height: 0;[^}]*overscroll-behavior-y: contain/);
  assert.match(css, /\.admin-modal-footer \{[^}]*flex-shrink: 0;[^}]*safe-area-inset-bottom/);
  assert.match(css, /min-height: 44px/);
});

test('Shared modal adds an optional footer without altering other callers', async () => {
  const source = await readFile(new URL('../src/components/admin/Modal.jsx', import.meta.url), 'utf8');
  assert.match(source, /dialogLabel, footer \}/);
  assert.match(source, /\{footer \? <div className="admin-modal-footer">\{footer\}<\/div> : null\}/);
  assert.match(source, /admin-modal-body flex-1 overflow-y-auto/);
  assert.match(source, /event.key === 'Escape'\) onClose\(\)/);
});
