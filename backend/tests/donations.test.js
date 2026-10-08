import assert from 'node:assert/strict';
import { test } from 'node:test';

const actor = '20000000-0000-0000-0000-000000000001';
const id = '30000000-0000-0000-0000-000000000001';

test('donation API uses shared storage and authenticated identity', async (t) => {
  let calls = [];
  let result;
  const donation = { id, farmer_id: id, quantity: '10.50', status: 'requested', requested_by_id: actor };
  t.mock.module('../src/lib/supabaseClient.js', { namedExports: { supabaseAdmin: {
    from(table) {
      calls.push(['from', table]);
      return {
        select() { return this; },
        order() { return this; },
        eq(...args) { calls.push(['eq', ...args]); return this; },
        or(value) { calls.push(['or', value]); return this; },
        then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
        async maybeSingle() { return result; },
      };
    },
    async rpc(name, values) { calls.push(['rpc', name, values]); return result; },
  } } });
  const api = await import('../src/controllers/donations.controller.js');
  let response;
  let status;
  const res = { json(value) { response = value; }, status(value) { status = value; return this; } };
  const req = (action = 'request', body = {}) => ({ profile: { id: actor, role: 'stakeholder' }, params: { id, action }, query: {}, body });
  t.beforeEach(() => { calls = []; result = { data: donation, error: null }; response = undefined; status = undefined; });

  await t.test('requests and receipt confirmation ignore forged recipient identity', async () => {
    for (const action of ['request', 'receive']) {
      await api.updateDonation(req(action, { actorId: id, requestedById: id }), res);
      assert.deepEqual(calls.at(-1), ['rpc', 'transition_surplus_donation', {
        actor_id: actor, donation_id: id, action_name: action, scheduled_date: null,
      }]);
    }
    assert.equal(response.quantity, 10.5);
    assert.equal(response.requestedById, actor);
  });

  await t.test('creation accepts only a product ID, not caller-supplied stock or farmer', async () => {
    await api.createDonation(req('create', { productId: id, quantity: 999, farmerId: id }), res);
    assert.deepEqual(calls.at(-1), ['rpc', 'create_surplus_donation', { actor_id: actor, source_product_id: id }]);
    assert.equal(status, 201);
  });

  await t.test('stakeholders can list only available donations and their own requests', async () => {
    result.data = [donation];
    await api.listDonations(req(), res);
    assert.ok(calls.some((call) => call[0] === 'or' && call[1] === `status.eq.available,requested_by_id.eq.${actor}`));
    assert.equal(response.length, 1);
  });

  await t.test('farmer listings are scoped to the signed-in farmer', async () => {
    result.data = [donation];
    const request = req();
    request.profile.role = 'farmer';
    await api.listDonations(request, res);
    assert.ok(calls.some((call) => call[0] === 'eq' && call[1] === 'farmer_id' && call[2] === actor));
  });

  await t.test('invalid IDs and calendar dates never reach a transaction', async () => {
    const invalid = req();
    invalid.params.id = 'bad-id';
    await assert.rejects(api.updateDonation(invalid, res), { status: 400 });
    for (const date of ['', '2026-02-30', 'tomorrow']) {
      await assert.rejects(api.updateDonation(req('schedule', { pickupDate: date }), res), { status: 400 });
    }
    assert.equal(calls.length, 0);
  });

  await t.test('permission, conflict and missing migration errors are not successful responses', async () => {
    for (const [code, expected] of [['42501', 403], ['23514', 409], ['P0002', 404], ['PGRST202', 503], ['PGRST205', 503]]) {
      result = { data: null, error: { code, message: 'Rejected' } };
      await assert.rejects(api.updateDonation(req(), res), { status: expected });
      assert.equal(response, undefined);
    }
  });
});
