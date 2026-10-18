import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import { transformWithOxc } from 'vite';

const context = vm.createContext({});
const modules = new Map();
async function load(specifier) {
  const url = new URL(specifier, import.meta.url);
  if (!url.pathname.endsWith('.js')) url.pathname += '.js';
  if (modules.has(url.href)) return modules.get(url.href);
  const pending = readFile(url, 'utf8').then((source) => new vm.SourceTextModule(source, { context, identifier: url.href }));
  modules.set(url.href, pending);
  return pending;
}
const module = await load('../src/features/profile/profileCompletionRules.js');
await module.link((dependency, parent) => load(new URL(dependency, parent.identifier).href));
await module.evaluate();
const { getProfileCompletion } = module.namespace;
const complete = {
  role: 'buyer',
  name: 'Jan Raymund Flores Bugtai', email: 'janb@gmail.com', contactNumber: '09123456789',
  municipality: 'Mandaue City', address: 'Looc, Mandaue, Cebu, Philippines', zipCode: '6014',
  latitude: 10.33, longitude: 123.94, accountStatus: 'active',
};

test('Completion derives 100, 83 and 67 percent from actual valid saved fields', () => {
  assert.equal(getProfileCompletion(complete).percent, 100);
  assert.equal(getProfileCompletion({ ...complete, contactNumber: '' }).percent, 83);
  assert.equal(getProfileCompletion({ ...complete, contactNumber: '', zipCode: '' }).percent, 67);
  assert.equal(getProfileCompletion({ role: 'buyer' }).percent, 0);
});

test('Invalid email, phone, ZIP and unsupported city do not count as completed', () => {
  for (const [field, invalid] of [['name', ' '], ['email', 'bad-email'], ['contactNumber', '12345'], ['zipCode', '601'], ['municipality', 'Unknown City']]) {
    assert.equal(getProfileCompletion({ ...complete, [field]: invalid }).fields[field], false, field);
  }
});

test('Text addresses without valid saved Places coordinates remain incomplete', () => {
  for (const coords of [{ latitude: null, longitude: null }, { latitude: 91, longitude: 123 }, { latitude: 10.33, longitude: '' }]) {
    const result = getProfileCompletion({ ...complete, ...coords });
    assert.equal(result.fields.municipality, false);
    assert.equal(result.fields.address, false);
    assert.equal(result.percent, 67);
  }
});

test('Completion is independent of account active status and real verification', () => {
  const saved = Object.freeze({ ...complete, accountStatus: 'suspended', verificationStatus: 'pending' });
  assert.equal(getProfileCompletion(saved).percent, 100);
  assert.equal(getProfileCompletion({ ...complete, email: '' }).percent, 83);
});

test('Indicator uses saved currentUser only and never labels completion as verification', async () => {
  const profile = await readFile(new URL('../src/features/profile/Profile.jsx', import.meta.url), 'utf8');
  const indicator = await readFile(new URL('../src/features/profile/ProfileCompletion.jsx', import.meta.url), 'utf8');
  assert.match(profile, /<ProfileCompletion user=\{currentUser\}/);
  assert.match(indicator, /role="progressbar"[^>]*aria-valuenow=\{percent\}/);
  assert.doesNotMatch(indicator, /Verified Buyer|profileDraft/);
  assert.match(profile, /await refreshUser\(\)/);
});

const farmer = { ...complete, role: 'farmer', farmName: 'DOMS FARM', birthday: '1990-01-01', verificationStatus: 'pending' };
const stakeholder = {
  ...complete, role: 'stakeholder', organizationName: 'Cebu Food Partners', organizationType: 'NGO',
  contactPerson: 'Coordinator', organizationDescription: 'Community food assistance', barangay: 'Looc',
  partnershipDescription: 'Distribute donated produce', accreditationFile: 'documents/organization-proof.pdf', verificationStatus: 'pending',
};

test('Farmer requires actual birthday and farm fields, but optional government ID and payments never lower completion', () => {
  assert.equal(getProfileCompletion(farmer).total, 8);
  assert.equal(getProfileCompletion(farmer).percent, 100);
  assert.equal(getProfileCompletion({ ...farmer, govIdFile: 'documents/id.pdf', gcashNumber: '', avatarUrl: '' }).percent, 100);
  assert.equal(getProfileCompletion({ ...farmer, birthday: '' }).percent, 88);
  assert.equal(getProfileCompletion({ ...farmer, birthday: 'invalid' }).fields.birthday, false);
  assert.equal(getProfileCompletion({ ...farmer, farmName: ' ' }).fields.farmName, false);
});

test('Stakeholder counts required registration details and a saved accreditation document, independently from approval', () => {
  const result = getProfileCompletion(stakeholder);
  assert.equal(result.total, 13);
  assert.equal(result.percent, 100);
  assert.equal(getProfileCompletion({ ...stakeholder, verificationStatus: 'rejected' }).percent, 100);
  assert.equal(getProfileCompletion({ ...stakeholder, accreditationFile: '' }).remaining, 1);
  assert.equal(getProfileCompletion({ ...stakeholder, accreditationFile: {} }).fields.accreditationFile, false);
  for (const field of ['organizationName', 'organizationType', 'contactPerson', 'organizationDescription', 'barangay', 'partnershipDescription']) {
    assert.equal(getProfileCompletion({ ...stakeholder, [field]: ' ' }).fields[field], false, field);
  }
  assert.equal(getProfileCompletion({ ...stakeholder, organizationType: 'Other', organizationTypeOther: '' }).fields.organizationType, false);
  assert.equal(getProfileCompletion({ ...stakeholder, organizationType: 'Community kitchen' }).fields.organizationType, true);
});

test('One shared indicator renders role-specific rows and separate real verification, without fabricated Admin completion', async () => {
  const source = await readFile(new URL('../src/features/profile/ProfileCompletion.jsx', import.meta.url), 'utf8');
  const component = source.slice(source.indexOf('const CIRCUMFERENCE')).replace('export default function', 'function');
  const { code } = await transformWithOxc(component, 'ProfileCompletion.jsx', { jsx: { runtime: 'classic' } });
  const React = { createElement: (type, props, ...children) => typeof type === 'function' ? type({ ...props, children }) : ({ type, props: { ...props, children } }) };
  const render = new Function('React', 'Check', 'CheckCircle2', 'Circle', 'getProfileCompletion', `${code}; return ProfileCompletion;`)(React, 'check', 'complete-icon', 'empty-icon', getProfileCompletion);
  const text = (node) => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.props?.children || []).flat(Infinity).map(text).join('');
  const farmerText = text(render({ user: farmer }));
  assert.match(farmerText, /100%Profile complete/);
  assert.match(farmerText, /Verification document not provided \(optional\)/);
  assert.match(farmerText, /Farmer verification: Pending/);
  const organizationText = text(render({ user: { ...stakeholder, verificationStatus: 'verified' } }));
  assert.match(organizationText, /Organization verification: Verified/);
  assert.match(organizationText, /Required document provided/);
  assert.equal(getProfileCompletion({ role: 'admin' }), null);
  assert.equal(render({ user: { role: 'admin' } }), null);
});
