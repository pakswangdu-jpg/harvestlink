import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Farmer order tabs and filters paginate the matching orders in groups of 20', async () => {
  const source = await readFile(new URL('../src/features/farmer/FarmerOrders.jsx', import.meta.url), 'utf8');
  assert.match(source, /const ORDERS_PER_PAGE = 20/);
  assert.match(source, /usePagination\(filteredOrders, ORDERS_PER_PAGE\)/);
  assert.match(source, /pageRows\.map\(\(order\) =>/);
  assert.match(source, /<Pagination page=\{page\} pageSize=\{pageSize\} total=\{total\} onPageChange=\{setPage\} \/>/);
  assert.match(source, /useEffect\(\(\) => \{\s*setPage\(1\);\s*\}, \[activeStage, search, paymentFilter, deliveryFilter, dateFilter, exactDateTime, setPage\]\)/);
});
