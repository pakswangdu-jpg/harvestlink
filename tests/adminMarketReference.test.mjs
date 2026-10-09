import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';

const element = (type, props, ...children) => ({ type, props: { ...props, children } });
const nodes = (tree) => !tree || typeof tree !== 'object' ? [] : [tree, ...(tree.props?.children || []).flat(Infinity).flatMap(nodes)];
async function compile(file, name, scope) {
  const original = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
  const source = original.replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replace(/import\s+['"][^'"]+['"];?/g, '').replace('export default ', '').replaceAll('export function ', 'function ');
  const { code } = await transformWithOxc(source, file, { jsx: { runtime: 'classic' } });
  return new Function('scope', `with(scope){${code};return ${name};}`)({ React: { createElement: element }, ...scope });
}

test('Admin reference notice uses saved price, reason and timestamp without claiming a selling-price change', async () => {
  const Notice = await compile('components/market/AdminReferenceNotice.jsx','AdminReferenceNotice',{ShieldCheck:'icon',formatCurrency:(value)=>`PHP ${value}`,formatDate:(value)=>value.slice(0,10)});
  assert.equal(Notice({reference:null}),null);
  assert.equal(Notice({reference:{referencePrice:null}}),null);
  const all = nodes(Notice({reference:{referencePrice:42,referenceYear:2025,updatedAt:'2026-10-10T08:00:00Z',reason:'Updated local market reference'}}));
  const text = all.flatMap(node=>node.props.children).filter(value=>typeof value==='string').join(' ');
  assert.match(text,/Admin reference:\s+PHP 42\s*\/kg/);
  assert.match(text,/Updated 2026-10-10/);
  assert.match(text,/Updated local market reference/);
  assert.match(text,/Farmer selling price is unchanged/);
});

test('admin references refresh on focus, replace changed values, and report failed reads', async () => {
  const values=[];let index=0;const effects=[];let focus;let tick;let fail=false;let price=40;
  const scope={
    useState(initial){const slot=index++;if(!(slot in values))values[slot]=initial;return [values[slot],next=>{values[slot]=next;}];},
    useEffect(callback){effects.push(callback);},
    getAllPriceOverrides:async(options)=>{assert.equal(options.force,true);if(fail)throw Error('Unavailable');return [{commodityId:'28',referencePrice:price}];},
    setInterval(callback,delay){tick=callback;assert.equal(delay,15000);return 1;},clearInterval(){},
    window:{addEventListener(event,callback){assert.equal(event,'focus');focus=callback;},removeEventListener(){}},
  };
  const hook=await compile('hooks/useAdminMarketReferences.js','useAdminMarketReferences',scope);
  hook();const cleanup=effects[0]();
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  await flush();assert.equal(values[0][0].referencePrice,40);
  price=42;await focus();assert.equal(values[0][0].referencePrice,42);
  fail=true;await tick();assert.deepEqual(values[0],[]);assert.match(values[1],/temporarily unavailable/);
  cleanup();
});
