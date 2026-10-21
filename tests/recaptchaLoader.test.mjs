import assert from 'node:assert/strict';
import { test } from 'node:test';

class FakeScript {
  constructor() {
    this.dataset = {};
    this.listeners = new Map();
    this.isConnected = false;
  }

  addEventListener(type, callback) {
    this.listeners.set(type, callback);
  }

  removeEventListener(type, callback) {
    if (this.listeners.get(type) === callback) this.listeners.delete(type);
  }

  remove() {
    this.isConnected = false;
    this.removed = true;
  }

  dispatch(type) {
    this.listeners.get(type)?.();
  }
}

function setupBrowser() {
  const scripts = [];
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  globalThis.window = {
    clearTimeout,
    setTimeout,
  };
  globalThis.document = {
    querySelector: (selector) => selector.includes('script[')
      ? scripts.find((script) => script.isConnected && script.dataset.harvestlinkRecaptcha === 'true') || null
      : scripts.find((script) => script.isConnected && script.src === 'https://www.google.com/recaptcha/api.js?render=explicit') || null,
    createElement: () => new FakeScript(),
    head: {
      appendChild: (script) => {
        script.isConnected = true;
        scripts.push(script);
      },
    },
  };
  return {
    scripts,
    restore() {
      globalThis.window = originalWindow;
      globalThis.document = originalDocument;
    },
  };
}

test('reCAPTCHA script is shared and resolves only after the legacy API is ready', async () => {
  const browser = setupBrowser();
  try {
    const { loadRecaptchaApi } = await import(`../src/components/auth/recaptchaLoader.js?shared=${Date.now()}`);
    const firstLoad = loadRecaptchaApi();
    const secondLoad = loadRecaptchaApi();
    assert.equal(browser.scripts.length, 1);

    const api = {
      render() {},
      ready(callback) { callback(); },
    };
    window.grecaptcha = api;
    browser.scripts[0].dispatch('load');

    assert.equal(await firstLoad, api);
    assert.equal(await secondLoad, api);
    assert.equal(await loadRecaptchaApi(), api);
    assert.equal(browser.scripts.length, 1);
  } finally {
    browser.restore();
  }
});

test('failed script load clears the shared loader so retry can append one fresh script', async () => {
  const browser = setupBrowser();
  try {
    const { loadRecaptchaApi } = await import(`../src/components/auth/recaptchaLoader.js?retry=${Date.now()}`);
    const firstLoad = loadRecaptchaApi();
    browser.scripts[0].dispatch('error');
    await assert.rejects(firstLoad, /script failed to load/);

    const secondLoad = loadRecaptchaApi();
    assert.equal(browser.scripts.length, 2);
    const api = {
      render() {},
      ready(callback) { callback(); },
    };
    window.grecaptcha = api;
    browser.scripts[1].dispatch('load');
    assert.equal(await secondLoad, api);
  } finally {
    browser.restore();
  }
});
