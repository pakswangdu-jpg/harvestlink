import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';

test('Take Photo opens a native dialog above the edit drawer and adds the captured image', async () => {
  const source = await readFile(new URL('../src/components/forms/ProductForm.jsx', import.meta.url), 'utf8');
  const section = source.slice(source.indexOf('const PRODUCT_IMAGE_ACCEPTED_TYPES'), source.indexOf('const FIELD_ORDER'));
  const { code } = await transformWithOxc(section, 'ProductImageDropzone.jsx', { jsx: { runtime: 'classic' } });
  const states = [];
  const refs = [];
  let stateIndex;
  let refIndex;
  let effect;
  const calls = [];
  const stream = { getTracks: () => [{ stop: () => calls.push('stop') }] };
  const scope = {
    React: { Fragment: 'fragment', createElement: (type, props, ...children) => ({ type, props, children }) },
    useState(initial) {
      const index = stateIndex++;
      states[index] ??= initial;
      return [states[index], (value) => { states[index] = value; }];
    },
    useRef: () => refs[refIndex++] ||= { current: null },
    useEffect: (callback) => { effect = callback; },
    createPortal: (node) => node,
    navigator: { mediaDevices: { getUserMedia: async () => stream } },
    document: { body: {}, createElement: () => ({
      getContext: () => ({ drawImage() {} }),
      toBlob: (callback) => callback(new Blob(['photo'])),
    }) },
  };
  const component = new Function('scope', `with (scope) { ${code}; return ProductImageDropzone; }`)(scope);
  const render = () => {
    stateIndex = 0;
    refIndex = 0;
    return component({ imageUrls: ['/existing.jpg'], onFilesSelect: (files) => calls.push(files[0]) });
  };
  const nodes = (node) => node && typeof node === 'object'
    ? [node, ...node.children.flat(Infinity).flatMap(nodes)] : [];
  const find = (type) => nodes(render()).find((node) => node.type === type);
  find('select').props.onChange({ target: { value: 'camera' } });
  find('dialog').props.ref.current = {
    showModal: () => calls.push('showModal'),
    close: () => calls.push('close'),
  };
  const video = { videoWidth: 800, videoHeight: 600, play: async () => {} };
  find('video').props.ref.current = video;
  const cleanup = effect();
  await new Promise(setImmediate);
  assert.equal(calls[0], 'showModal');
  assert.equal(video.srcObject, stream);
  find('video').props.onPlaying();
  const capture = nodes(render()).find((node) => node.type === 'button' && node.children.includes('Capture photo'));
  assert.equal(capture.props.disabled, false);
  capture.props.onClick();
  assert.equal(calls[1].type, 'image/jpeg');
  assert.deepEqual(calls.slice(2), ['close', 'stop']);
  assert.equal(find('dialog'), undefined);
  cleanup();
});

test('farmer product form accepts up to 10 individual marketplace photos', async () => {
  const source = await readFile(new URL('../src/components/forms/ProductForm.jsx', import.meta.url), 'utf8');
  assert.match(source, /const MAX_PRODUCT_IMAGES = 10/);
  assert.match(source, /multiple/);
  assert.match(source, /imageUrls\.length \+ files\.length > MAX_PRODUCT_IMAGES/);
  assert.match(source, /imageUrls=\{values\.imageUrls \|\| \[\]\}/);
  assert.match(source, /uploadProductImage\(imageFile, currentUser\.id\)/);
});

test('marketplace product detail and quick view render navigable product photo galleries', async () => {
  const [gallery, details, card] = await Promise.all([
    readFile(new URL('../src/components/products/ProductImageGallery.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/marketplace/ProductDetails.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/cards/ProductCard.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(gallery, /product\.imageUrls/);
  assert.match(gallery, /Next product photo/);
  assert.match(gallery, /product-image-gallery-thumbnails/);
  assert.match(details, /isFarmerOwner \? \([\s\S]*?<ProductImageGallery product=\{product\}/);
  assert.doesNotMatch(details, /<section className="panel product-details-gallery-panel"/);
  assert.match(card, /<ProductImageGallery product=\{product\}/);
});
