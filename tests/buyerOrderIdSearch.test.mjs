import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Buyer order search matches displayed, copied, short and full IDs without losing name search', async () => {
  const source = await readFile(new URL('../src/features/buyer/BuyerOrders.jsx', import.meta.url), 'utf8');
  const expression = source.match(/const haystack = (.+);/)[1];
  const getHaystack = new Function('order', 'shortOrderId', `return ${expression};`);
  const order = { id: 'a1b2c3d4-1234-5678-9012-abcdef123456', farmerName: 'John Cruz', productName: 'Eggplant' };
  const haystack = getHaystack(order, (id) => String(id).slice(0, 8).toUpperCase());
  for (const query of ['#HL-A1B2C3D4', 'HL-A1B2C3D4', '#a1b2c3d4', 'a1b2c3d4', order.id, ' John Cruz ', 'eggplant']) {
    assert.ok(haystack.includes(query.trim().toLowerCase()), query);
  }
  assert.equal(haystack.includes('#hl-deadbeef'), false);
});
