import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';

test('tracking identities stay outside the scrollable map body', async () => {
  const source = (await readFile(new URL('../src/components/orders/DeliveryTrackingOverlay.jsx', import.meta.url), 'utf8'))
    .replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '')
    .replace(/import ['"][^'"]+['"];?/g, '')
    .replace('export default ', '');
  const { code } = await transformWithOxc(source, 'overlay.jsx', { jsx: { runtime: 'classic' } });
  const scope = {
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    useEffect() {}, X: 'icon',
  };
  const component = new Function('scope', `with(scope){${code};return DeliveryTrackingOverlay;}`)(scope);
  const summary = { type: 'summary' };
  const content = { type: 'map' };
  const tree = component({ open: true, title: 'Delivery tracking', summary, children: content, onClose() {} });
  const panel = tree.props.children[0];
  const pinned = panel.props.children.find(node => node?.props.className === 'tracking-overlay-summary');
  const body = panel.props.children.find(node => node?.props.className === 'tracking-overlay-body');
  assert.equal(pinned.props.children[0], summary);
  assert.equal(body.props.children[0], content);
  assert.equal(body.props.children.includes(summary), false);
});
