import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';

const source = (await readFile(new URL('../src/components/cards/DonationCard.jsx', import.meta.url), 'utf8'))
  .replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '')
  .replace(/import\s+['"][^'"]+['"];?/g, '').replace('export default ', '');
const { code } = await transformWithOxc(source, 'DonationCard.jsx', { jsx: { runtime: 'classic' } });
const scope = {
  React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
  MapPin: 'location-icon', Package: 'package-icon', CalendarDays: 'calendar-icon', UserRound: 'recipient-icon',
  StatusBadge: 'status', formatDate: (date) => date,
  getExpiryStatus: (date) => date === 'soon' ? 'expiring_soon' : date === 'past' ? 'expired' : null,
};
const DonationCard = new Function('scope', `with(scope){${code};return DonationCard;}`)(scope);
const donation = { productName: 'Cabbage', image: '/cabbage.jpg', farmerName: 'John', status: 'available', location: 'Mandaue City', quantity: 5, unit: 'kg', expirationDate: 'soon' };
const nodes = (node) => !node || typeof node !== 'object' ? [] : [node, ...(node.props?.children || []).flat(Infinity).flatMap(nodes)];
const text = (node) => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.props?.children || []).flat(Infinity).map(text).join('');

test('donation image, badges and product heading have separate layout containers', () => {
  const tree = DonationCard({ donation });
  assert.equal(tree.props.className, 'donation-card');
  const [image, body] = tree.props.children;
  assert.equal(image.props.className, 'donation-card-image');
  assert.equal(body.props.className, 'donation-card-body');
  assert.equal(image.props.children[0].props.alt, 'Cabbage');
  assert.ok(nodes(body).some((node) => node.type === 'h3' && text(node) === 'Cabbage'));
  assert.ok(!nodes(image).some((node) => node.type === 'h3' || node.type === 'status'));
});

test('donation data, expiry badge and the supplied action remain unchanged', () => {
  const action = { type: 'button', props: { onClick() {}, children: ['Request donation'] } };
  const tree = DonationCard({ donation: { ...donation, pickupDate: '2026-10-09', requestedByName: 'Food Bank' }, actions: action });
  const content = text(tree);
  for (const value of ['From John', 'Mandaue City', '5 kg available', 'Expires: soon', 'Pickup: 2026-10-09', 'Requested by: Food Bank', 'Expiring soon']) assert.ok(content.includes(value));
  assert.equal(nodes(tree).find((node) => node.type === 'status').props.value, 'available');
  assert.equal(tree.props.children.at(-1).props.children[0], action);
});

test('missing photo and actions retain the existing placeholder without an empty footer', () => {
  const tree = DonationCard({ donation: { ...donation, image: '', expirationDate: null } });
  assert.equal(tree.props.children[0].props.children[0].type, 'package-icon');
  assert.ok(!nodes(tree).some((node) => node.props.className === 'donation-card-footer'));
  assert.ok(!text(tree).includes('Expires:'));
});

test('expired donations retain the expired badge', () => {
  const tree = DonationCard({ donation: { ...donation, expirationDate: 'past' } });
  assert.ok(nodes(tree).some((node) => node.props.className === 'badge badge-expired' && text(node) === 'Expired'));
  assert.ok(!text(tree).includes('Expiring soon'));
});
