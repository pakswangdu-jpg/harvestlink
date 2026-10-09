import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';

const element = (type, props, ...children) => ({ type, props: { ...props, children } });
const nodes = (tree) => !tree || typeof tree !== 'object' ? [] : [tree, ...(tree.props?.children || []).flat(Infinity).flatMap(nodes)];
async function compile(scope = {}) {
  const original = await readFile(new URL('../src/features/admin/AdminUsers.jsx', import.meta.url), 'utf8');
  const source = original.replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replace(/import\s+['"][^'"]+['"];?/g, '').replace('export default ', '');
  const { code } = await transformWithOxc(source, 'AdminUsers.jsx', { jsx: { runtime: 'classic' } });
  return new Function('scope', `with(scope){${code};return {AdminUsers, UserDetails, verificationLabel, accountLabel, actionNotice};}`)({ React: { createElement: element }, ...scope });
}
test('verification remains independent from account status and buyers do not need verification', async () => {
  const { verificationLabel, accountLabel } = await compile();
  const user = { role: 'farmer', verificationStatus: 'verified', accountStatus: 'suspended' };
  assert.equal(verificationLabel(user), 'Verified');
  assert.equal(accountLabel(user), 'Deactivated');
  assert.equal(verificationLabel({ ...user, accountStatus: 'active' }), 'Verified');
  assert.equal(verificationLabel({ role: 'buyer', verificationStatus: 'verified' }), 'Not required');
  assert.equal(verificationLabel({ role: 'stakeholder', verificationStatus: 'pending' }), 'Pending verification');
});

test('action notices describe the outcome instead of repeating the command label', async () => {
  const { actionNotice } = await compile();
  assert.equal(actionNotice('rejected', 'Kent Asigua'), 'Verification rejected for Kent Asigua.');
  assert.equal(actionNotice('verified', 'Farmer'), 'Verification approved for Farmer.');
  assert.equal(actionNotice('suspended', 'Buyer'), 'Account deactivated for Buyer.');
  assert.equal(actionNotice('active', 'Partner'), 'Account reactivated for Partner.');
});

test('success notice is announced and dismissing it leaves filters, data and refresh unchanged', async () => {
  const slots = [{ page: 1, search: 'Kent' }, { users: [], total: 0 }, false, '', null, 'Verification rejected for Kent Asigua.', 2];
  const before = structuredClone(slots);
  let index = 0;
  const scope = { useState: () => { const i = index++; return [slots[i], (value) => { slots[i] = value; }]; }, useEffect() {}, useAuth: () => ({ currentUser: { id: 'admin', role: 'admin' } }), adminNavItems: [] };
  for (const name of ['AppShell','PageHeader','Table','Pagination','ArrowRight','Search','CircleCheck','X']) scope[name] = name;
  const { AdminUsers } = await compile(scope);
  const all = nodes(AdminUsers());
  const notice = all.find(node => node.props.className === 'admin-user-action-notice');
  const status = nodes(notice).find(node => node.props.role === 'status');
  assert.equal(status.props['aria-live'], 'polite');
  assert.ok(nodes(status).some(node => node.type === 'span' && node.props.children[0] === before[5]));
  nodes(notice).find(node => node.props['aria-label'] === 'Dismiss notification').props.onClick();
  assert.deepEqual(slots, before.map((value, i) => i === 5 ? '' : value));
});

test('missing audit history does not blank profile details or enable unaudited changes', async () => {
  const user = { id:'u1',name:'Farmer',role:'farmer',email:'farmer@example.com',accountStatus:'active',verificationStatus:'pending' };
  const data = { user,history:[],historyTotal:0,historyAvailable:false,accountManagementAvailable:false,activity:{'Active products':3} };
  const slots = [data,'',0,1,null,'Incomplete information','',false,''];
  let index = 0;
  const scope = { useState: () => { const i=index++; return [slots[i],(value)=>{slots[i]=value;}]; },useEffect() {},useRef:()=>({current:null}),formatDate:String,formatTime:String };
  for (const name of ['Modal','Button','DocumentCard','Pagination','Check','X','Ban','RotateCcw']) scope[name]=name;
  const {UserDetails}=await compile(scope);
  const all=nodes(UserDetails({id:user.id,adminId:'admin',onClose(){},onChanged(){}}));
  assert.ok(all.some(node=>node.type==='section'));
  assert.ok(all.some(node=>node.props.role==='status'));
  assert.ok(!all.some(node=>node.type==='Pagination'));
  const buttons=all.filter(node=>node.type==='Button' && node.props.type!=='submit' && node.props.children.some(child=>typeof child==='string' && /Verify account|Reject|Deactivate account/.test(child)));
  assert.equal(buttons.length,3);
  assert.ok(buttons.every(node=>node.props.disabled));
  buttons[0].props.onClick();
  assert.equal(slots[4],null);
});
test('users page retains dynamic role counts, data, details actions and ten-row pagination', async () => {
  const user = { id: 'u1', name: 'Buyer', email: 'buyer@example.com', role: 'buyer', accountStatus: 'active' };
  const slots = [{ page: 2, role: '', verificationStatus: '', accountStatus: '', search: '', from: '', to: '' }, { users: [user], total: 28, counts: { all: 28, farmer: 15, buyer: 8, stakeholder: 4, pending: 4 } }, false, '', null, '', 0];
  let index = 0;
  const scope = { useState: () => { const i = index++; return [slots[i], (value) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; }, useEffect() {}, useAuth: () => ({ currentUser: { id: 'admin', role: 'admin' } }), adminNavItems: [], formatDate: (value) => value };
  for (const name of ['AppShell','PageHeader','Table','Pagination','ArrowRight','Search']) scope[name] = name;
  const { AdminUsers } = await compile(scope);
  const all = nodes(AdminUsers());
  const table = all.find((node) => node.type === 'Table');
  assert.deepEqual(table.props.rows, [user]);
  assert.equal(table.props.columns.find((column) => column.key === 'verificationStatus').render(user).props.children[0], 'Not required');
  table.props.columns.at(-1).render(user).props.onClick();
  assert.equal(slots[4], 'u1');
  assert.equal(all.find((node) => node.type === 'Pagination').props.pageSize, 10);
  const nav = all.find((node) => node.type === 'nav');
  assert.deepEqual(nodes(nav).filter((node) => node.type === 'span').map((node) => node.props.children[0]), [28,15,8,4,4]);
  nodes(nav).filter((node) => node.type === 'button').at(-1).props.onClick();
  assert.equal(slots[0].verificationStatus, 'pending');
  assert.equal(slots[0].page, 1);
});
