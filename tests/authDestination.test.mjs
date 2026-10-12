import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ROLE_DASHBOARDS } from '../src/utils/constants.js';

const source = await readFile(new URL('../src/utils/authDestination.js',import.meta.url),'utf8');
const {getAuthDestination}=new Function('ROLE_DASHBOARDS',`${source.replace(/import[^;]+;/g,'').replaceAll('export ','')};return {getAuthDestination};`)(ROLE_DASHBOARDS);

test('Admin sessions and normal Admin login never automatically select the Admin dashboard',()=>{
  assert.equal(getAuthDestination('admin'),null);
  assert.equal(getAuthDestination('admin',{from:'/admin-dashboard'}),null);
  assert.equal(getAuthDestination('admin',{from:'/admin'}),null);
});

test('dedicated entry is host-independent and does not send non-admin portal logins to their dashboards',()=>{
  for(const role of ['admin','farmer','buyer','stakeholder']) assert.equal(getAuthDestination(role,{adminPortal:true,from:'/admin-users'}),'/admin');
});

test('normal marketplace login retains existing role destinations and return links',()=>{
  for(const role of ['farmer','buyer','stakeholder']) {
    assert.equal(getAuthDestination(role),ROLE_DASHBOARDS[role]);
    assert.equal(getAuthDestination(role,{from:'/marketplace'}),'/marketplace');
  }
});

test('protected farmer-product destinations survive login and farmer registration', async () => {
  const authPage = await readFile(new URL('../src/features/auth/AuthPage.jsx', import.meta.url), 'utf8');
  assert.match(authPage, /getAuthDestination\(currentUser\.role, \{ adminPortal, from: location\.state\?\.from \}\)/);
  assert.equal(getAuthDestination('buyer', { from: '/marketplace' }), '/marketplace');
  assert.equal(getAuthDestination('farmer', { from: '/farmer-products' }), '/farmer-products');
  assert.match(authPage, /location\.state\?\.from === '\/farmer-products'[\s\S]*?'\/register\?role=farmer'/);
  assert.match(authPage, /<Link to=\{authSwitchDestination\} state=\{location\.state\}>/);
});
