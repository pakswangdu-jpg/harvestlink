import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ROLE_DASHBOARDS } from '../src/utils/constants.js';

const source = await readFile(new URL('../src/utils/authDestination.js',import.meta.url),'utf8');
const {getAuthDestination}=new Function('ROLE_DASHBOARDS',`${source.replace(/import[^;]+;/g,'').replaceAll('export ','')};return {getAuthDestination};`)(ROLE_DASHBOARDS);

test('Admin sessions and normal Admin login never automatically select the Admin dashboard',()=>{
  assert.equal(getAuthDestination('admin'),null);
  assert.equal(getAuthDestination('admin',{from:'/admin-dashboard'}),null);
  assert.equal(getAuthDestination('admin',{from:'/harvestlinkadmin'}),null);
});

test('dedicated entry is host-independent and does not send non-admin portal logins to their dashboards',()=>{
  for(const role of ['admin','farmer','buyer','stakeholder']) assert.equal(getAuthDestination(role,{adminPortal:true,from:'/admin-users'}),'/harvestlinkadmin');
});

test('normal marketplace login retains existing role destinations and return links',()=>{
  for(const role of ['farmer','buyer','stakeholder']) {
    assert.equal(getAuthDestination(role),ROLE_DASHBOARDS[role]);
    assert.equal(getAuthDestination(role,{from:'/marketplace'}),'/marketplace');
  }
});
