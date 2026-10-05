import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({ products: [] });
const source = await readFile(new URL('../src/services/local/productServiceLocal.js', import.meta.url), 'utf8');
const productService = new vm.SourceTextModule(source, {
  context,
  identifier: 'src/services/local/productServiceLocal.js',
});

await productService.link((specifier) => {
  if (specifier.endsWith('/shared/pricing.js')) {
    return readFile(new URL('../backend/shared/pricing.js', import.meta.url), 'utf8')
      .then((code) => new vm.SourceTextModule(code, { context, identifier: specifier }));
  }
  const modules = {
    '../../utils/constants': `
      export const STORAGE_KEYS = { products: 'products' };
      export function getExpiryStatus() { return null; }
    `,
    '../storageService': `
      export function createId() { return 'product-1'; }
      export function migrateLegacyProducts() {}
      export function readStorage() { return globalThis.products; }
      export function writeStorage(key, value) {
        globalThis.products = value;
        return value;
      }
    `,
  };
  return new vm.SourceTextModule(modules[specifier], { context, identifier: specifier });
});

test('local edits preserve, update and disable the saved wholesale tier', () => {
  context.products = [];
  const service = productService.namespace;
  const product = service.createProduct({
    name: 'Cabbage', category: 'Vegetables', price: 55, unit: 'kg', quantity: 100,
    location: 'Mandaue City', description: 'Fresh cabbage',
    wholesaleEnabled: true, wholesalePrice: '48', wholesaleMinQuantity: '10',
  }, { id: 'farmer-1', name: 'Farmer' });
  assert.equal(product.wholesalePrice, 48);
  assert.equal(service.updateProduct(product.id, { ...product, description: 'Updated' }).wholesalePrice, 48);
  assert.equal(service.updateProduct(product.id, { ...product, wholesalePrice: '45' }).wholesalePrice, 45);
  assert.throws(() => service.applyDiscount(product.id, 50), /lower than the retail price/);
  const disabled = service.updateProduct(product.id, { ...product, wholesaleEnabled: false });
  assert.equal(disabled.wholesalePrice, null);
  assert.equal(disabled.wholesaleMinQuantity, null);
});
await productService.evaluate();

test('new local product listings retain the farmer-entered expiration date', () => {
  context.products = [];
  const product = productService.namespace.createProduct({
    name: 'Cabbage',
    category: 'Vegetables',
    price: 43,
    unit: 'kg',
    quantity: 4,
    location: 'Mandaue City',
    description: 'Fresh cabbage',
    expirationDate: '2026-10-20',
  }, { id: 'farmer-1', name: 'Farmer' });

  assert.equal(product.expirationDate, '2026-10-20');
  assert.equal(context.products[0].expirationDate, '2026-10-20');
});
