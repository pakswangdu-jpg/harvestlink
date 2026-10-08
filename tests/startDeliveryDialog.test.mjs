import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';

async function harness(plateNumber = '', isSubmitting = false, requestLocation = async () => {}) {
  const submitted = [];
  let cancelled = 0;
  const values = [plateNumber, false, ''];
  let index = 0;
  const refs = [];
  let refIndex = 0;
  let cleanup;
  let id = 0;
  const scope = {
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    useState: () => { const i = index++; return [values[i], (next) => { values[i] = next; }]; }, useId: () => `field-${id++}`,
    useRef: (initial) => { const i = refIndex++; return refs[i] ||= { current: initial }; },
    useEffect: (callback) => { cleanup ||= callback(); }, requireDeliveryLocation: requestLocation,
    AnimatePresence: 'presence', motion: { div: 'div', form: 'form' }, Truck: 'icon', Button: 'button',
  };
  const source = (await readFile(new URL('../src/components/orders/StartDeliveryDialog.jsx', import.meta.url), 'utf8'))
    .replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replace(/import ['"][^'"]+['"];?/g, '')
    .replace('export default ', '');
  const { code } = await transformWithOxc(source, 'fixture.jsx', { jsx: { runtime: 'classic' } });
  const component = new Function('scope', `with(scope){${code};return StartDeliveryDialog;}`)(scope);
  const tree = component({ open: true, isSubmitting, onConfirm: (plate) => submitted.push(plate), onCancel: () => { cancelled++; } });
  const nodes = [];
  const visit = (node) => { if (!node?.props) return; nodes.push(node); node.props.children.flat(Infinity).forEach(visit); };
  visit(tree);
  return { nodes, submitted, value: () => values[0], error: () => values[2], cancelled: () => cancelled,
    cleanup: () => cleanup(),
    form: nodes.find((node) => node.type === 'form'), input: nodes.find((node) => node.type === 'input') };
}

test('plate validation accepts only intended characters under modern browser pattern rules', async () => {
  const { input } = await harness();
  const pattern = new RegExp(`^(?:${input.props.pattern})$`, 'v');
  for (const plate of ['ABC 1234', 'ab-123', '12345']) assert.equal(pattern.test(plate), true);
  for (const plate of ['', 'BAD!', 'ABC/123', 'ABC_123']) assert.equal(pattern.test(plate), false);
  assert.equal(input.props.required, true);
  assert.equal(input.props.maxLength, 15);
});

test('submission still trims and uppercases the plate, and cancel clears the draft', async () => {
  const h = await harness(' abc 1234 ');
  await h.form.props.onSubmit({ preventDefault() {} });
  assert.deepEqual(h.submitted, ['ABC 1234']);
  assert.equal(h.value(), '');
  const cancel = await harness('ABC 1234');
  cancel.nodes.find((node) => node.props.children.includes('Cancel')).props.onClick();
  assert.equal(cancel.value(), '');
  assert.equal(cancel.cancelled(), 1);
});

test('empty and submitting states cannot submit, and dialog fields have accessible labels', async () => {
  for (const [plate, busy] of [['   ', false], ['ABC 1234', true]]) {
    const h = await harness(plate, busy);
    await h.form.props.onSubmit({ preventDefault() {} });
    assert.equal(h.submitted.length, 0);
    assert.equal(h.nodes.find((node) => node.props.type === 'submit').props.disabled, true);
    assert.equal(h.form.props.role, 'dialog');
    assert.equal(h.form.props['aria-modal'], 'true');
    assert.equal(h.nodes.find((node) => node.type === 'label').props.htmlFor, h.input.props.id);
    assert.ok(h.nodes.some((node) => node.props.id === h.input.props['aria-describedby']));
  }
});

test('start delivery waits for location, prevents duplicate submission, and confirms only after access succeeds', async () => {
  let allow;
  let requests = 0;
  const h = await harness('ABC 1234', false, () => { requests++; return new Promise(resolve => { allow = resolve; }); });
  const pending = h.form.props.onSubmit({ preventDefault() {} });
  await h.form.props.onSubmit({ preventDefault() {} });
  assert.equal(requests, 1);
  assert.deepEqual(h.submitted, []);
  allow();
  await pending;
  assert.deepEqual(h.submitted, ['ABC 1234']);
});

test('denied location preserves plate, blocks delivery, and permits retry', async () => {
  let denied = true;
  const h = await harness('ABC 1234', false, async () => {
    if (denied) throw new Error('Allow location in browser settings.');
  });
  await h.form.props.onSubmit({ preventDefault() {} });
  assert.deepEqual(h.submitted, []);
  assert.equal(h.value(), 'ABC 1234');
  assert.match(h.error(), /Allow location/);
  denied = false;
  await h.form.props.onSubmit({ preventDefault() {} });
  assert.deepEqual(h.submitted, ['ABC 1234']);
  assert.equal(h.error(), '');
});

test('unmount while location prompt is pending cannot start delivery later', async () => {
  let allow;
  const h = await harness('ABC 1234', false, () => new Promise(resolve => { allow = resolve; }));
  const pending = h.form.props.onSubmit({ preventDefault() {} });
  h.cleanup();
  allow();
  await pending;
  assert.deepEqual(h.submitted, []);
});
