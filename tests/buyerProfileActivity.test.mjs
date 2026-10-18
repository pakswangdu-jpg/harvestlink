import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { summarizeBuyerActivity } from '../src/features/profile/buyerProfileActivity.js';

test('Buyer profile totals use existing paid-order calculations and only the buyer own order reviews', () => {
  const orders = [
    { id: '1', status: 'completed', paymentStatus: 'paid', totalAmount: 100 },
    { id: '2', status: 'pending', paymentStatus: 'pending', totalAmount: 500 },
    { id: '3', status: 'confirmed', paymentStatus: 'paid', totalAmount: 125 },
  ];
  const reviews = [
    { id: 'mine', raterId: 'buyer', orderId: '1', rating: 5, createdAt: '2026-10-15T10:00:00Z' },
    { id: 'other', raterId: 'someone-else', orderId: '3', rating: 1, createdAt: '2026-10-16T10:00:00Z' },
    { id: 'unrelated', raterId: 'buyer', orderId: 'unknown', rating: 4 },
  ];
  const summary = summarizeBuyerActivity(orders, reviews, 'buyer');
  assert.equal(summary.totalOrders, 3);
  assert.equal(summary.completedOrders, 1);
  assert.equal(summary.totalSpent, 225);
  assert.equal(summary.reviewsGiven, 1);
  assert.equal(summary.latestReview.id, 'mine');
  assert.equal(summary.latestReview.order, orders[0]);
  assert.equal(orders.length, 3);
});

test('Empty purchase histories show real zero values and no invented review', () => {
  assert.deepEqual(summarizeBuyerActivity([], [], 'buyer'), {
    totalOrders: 0, completedOrders: 0, totalSpent: 0, reviewsGiven: 0, latestReview: null,
  });
});

test('Buyer additions reuse existing edit/password flows and do not expose unsupported controls', async () => {
  const profile = await readFile(new URL('../src/features/profile/Profile.jsx', import.meta.url), 'utf8');
  const sections = await readFile(new URL('../src/features/profile/BuyerProfileSections.jsx', import.meta.url), 'utf8');
  assert.match(profile, /isBuyer \? <BuyerProfileSections/);
  assert.match(profile, /onEditDelivery=\{\(\) => \{\s*startEditing\(\)/);
  assert.match(profile, /onSubmit=\{handleProfileSubmit\}/);
  assert.match(profile, /onSubmit=\{handlePasswordSubmit\}/);
  assert.doesNotMatch(profile, /Contact verified|Delivery address verified/);
  assert.match(sections, /new Set\(orders.map\(\(order\) => order.farmerId\)/);
  assert.match(sections, /Promise.allSettled/);
  assert.match(sections, /reviewsUnavailable \? 'Unavailable'/);
  assert.doesNotMatch(sections, /latitude|longitude|deleteAccount|deactivateAccount|MFA enabled/);
});

test('Buyer profile uses compact responsive activity and truthful trust rows without styling other roles', async () => {
  const css = await readFile(new URL('../src/features/profile/BuyerProfile.css', import.meta.url), 'utf8');
  const shell = await readFile(new URL('../src/components/layout/AppShell.jsx', import.meta.url), 'utf8');
  assert.match(shell, /className=\{`app-shell role-/);
  assert.match(shell, /className=\{`main-content \$\{pageClassName\}/);
  assert.doesNotMatch(css, /\.app-shell\.profile-page/);
  assert.match(css, /\.app-shell \.profile-page\.buyer-profile-page/);
  for (const match of css.matchAll(/([^{}]+)\{/g)) {
    if (!match[1].trim().startsWith('@')) assert.ok(match[1].includes('.buyer-profile-page'));
  }
  assert.match(css, /\.buyer-profile-activity \{[^}]*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.buyer-profile-activity \{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.btn \{ min-height: 44px/);
  assert.doesNotMatch(css, /gradient|backdrop-filter|box-shadow/);
});
