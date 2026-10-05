import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

export async function loadFrontend(entries, globals = {}, mocks = {}) {
  const context = vm.createContext({ Date, setTimeout, clearTimeout, AbortController, ...globals });
  const modules = new Map();
  const getModule = (url) => {
    if (!modules.has(url)) modules.set(url, (async () => {
      if (mocks[url]) {
        const exports = mocks[url];
        return new vm.SyntheticModule(Object.keys(exports), function () {
          Object.entries(exports).forEach(([name, value]) => this.setExport(name, value));
        }, { context, identifier: url });
      }
      return new vm.SourceTextModule(await readFile(new URL(url), 'utf8'), {
        context, identifier: url, initializeImportMeta: (meta) => { meta.env = { VITE_GOOGLE_MAPS_API_KEY: 'test-key' }; },
      });
    })());
    return modules.get(url);
  };
  const root = new vm.SourceTextModule(entries.map((url, i) => `import * as entry${i} from '${url}'; export { entry${i} };`).join('\n'), { context });
  await root.link((specifier, parent) => getModule(specifier.startsWith('file:') ? specifier
    : mocks[specifier] ? specifier : new URL(specifier.endsWith('.js') ? specifier : `${specifier}.js`, parent.identifier).href));
  await root.evaluate();
  return entries.map((_, i) => root.namespace[`entry${i}`]);
}
