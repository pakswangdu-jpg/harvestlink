import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';

test('Pin and timestamp share a reserved row and pinning does not navigate', async () => {
  const source = await readFile(new URL('../src/components/messages/ConversationList.jsx', import.meta.url), 'utf8');
  const row = source.slice(source.indexOf('function lastMessagePreview'), source.indexOf('export default function ConversationList'));
  const { code } = await transformWithOxc(row, 'ConversationRow.jsx', { jsx: { runtime: 'classic' } });
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
  const render = new Function('React', 'Link', 'Pin', 'formatRelativeTime', 'getInitials', 'isRecentlyActive', 'shortOrderId', `${code}; return ConversationRow;`)(React, 'link', 'pin', () => '2d ago', () => 'DF', () => false, (id) => id);
  const selected = [];
  const thread = { key: 'farm-1', to: '/messages/farm-1', name: 'DOMS FARM', subtitle: 'Verified Farmer', lastMessage: { text: 'meron pa' } };
  const tree = render({ thread, isActive: true, isPinned: true, onTogglePin: (key) => selected.push(key) });
  const nodes = (node) => !node || typeof node !== 'object' ? [] : [node, ...(node.props.children || []).flat(Infinity).flatMap(nodes)];
  const all = nodes(tree);
  const button = all.find((node) => node.type === 'button');
  assert.equal(button.props['aria-pressed'], true);
  assert.equal(button.props['aria-label'], 'Unpin DOMS FARM');
  assert.doesNotMatch(button.props.className, /absolute|opacity-0/);
  const parent = all.find((node) => node.props.children.includes(button));
  assert.match(parent.props.className, /shrink-0.*items-center.*gap-1/);
  assert.ok(parent.props.children.some((node) => node.props?.children.includes('2d ago')));
  let prevented = false;
  button.props.onClick({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(selected, ['farm-1']);
  assert.equal(tree.props.to, thread.to);
});
