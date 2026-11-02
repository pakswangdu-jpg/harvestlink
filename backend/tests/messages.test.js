import assert from 'node:assert/strict';
import { test } from 'node:test';

const farmerId = '10000000-0000-0000-0000-000000000001';
const buyerId = '20000000-0000-0000-0000-000000000001';
const stakeholderId = '20000000-0000-0000-0000-000000000002';
const productId = '30000000-0000-0000-0000-000000000001';
const donationId = '40000000-0000-0000-0000-000000000001';
const conversationId = '50000000-0000-0000-0000-000000000001';

test('direct message context is authorized, snapshot from listings, and uses one participant conversation', async (t) => {
  const state = {};
  const notifications = [];
  const calls = [];

  class QueryBuilder {
    constructor(table) {
      this.table = table;
      this.filters = {};
      this.inserted = null;
      this.updated = null;
    }

    select() { return this; }
    eq(field, value) { this.filters[field] = value; return this; }
    limit() { return this; }
    order() { return this; }
    insert(value) { this.inserted = value; calls.push(['insert', this.table, value]); return this; }
    update(value) { this.updated = value; return this; }

    result() {
      if (this.inserted) {
        return {
          data: {
            id: '60000000-0000-0000-0000-000000000001',
            created_at: '2026-10-31T00:00:00.000Z',
            read: false,
            ...this.inserted,
          },
          error: null,
        };
      }
      if (this.table === 'profiles') {
        return { data: state.profiles?.[this.filters.id] || null, error: null };
      }
      if (this.table === 'products') return { data: state.product || null, error: null };
      if (this.table === 'donations') return { data: state.donation || null, error: null };
      if (this.table === 'messages' && this.filters.id) {
        return { data: state.messageToFetch || null, error: null };
      }
      if (this.table === 'messages') return { data: state.existingInquiry || null, error: null };
      return { data: null, error: null };
    }

    single() { return Promise.resolve(this.result()); }
    maybeSingle() { return Promise.resolve(this.result()); }
  }

  const supabaseAdmin = {
    from(table) { calls.push(['from', table]); return new QueryBuilder(table); },
    async rpc(name, values) {
      calls.push(['rpc', name, values]);
      if (state.rpcError) return { data: null, error: state.rpcError };
      return { data: conversationId, error: null };
    },
  };
  t.mock.module('../src/lib/supabaseClient.js', { namedExports: { supabaseAdmin } });
  t.mock.module('../src/lib/notify.js', {
    namedExports: {
      async createNotification(notification) { notifications.push(notification); },
    },
  });
  const api = await import('../src/controllers/messages.controller.js');

  const recipientProfiles = {
    [farmerId]: { id: farmerId, role: 'farmer' },
    [stakeholderId]: { id: stakeholderId, role: 'stakeholder' },
    [buyerId]: { id: buyerId, role: 'buyer' },
  };
  const makeRequest = (profile, recipientId, body = {}) => ({ profile, body: { recipientId, text: 'Question about this listing', ...body } });
  const response = () => ({
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  });
  const reset = () => {
    calls.length = 0;
    notifications.length = 0;
    state.profiles = recipientProfiles;
    state.product = null;
    state.donation = null;
    state.existingInquiry = null;
    state.messageToFetch = null;
    state.rpcError = null;
  };

  reset();
  state.donation = {
    id: donationId,
    product_name: 'Cabbage',
    description: 'Freshly harvested cabbage',
    image_url: 'https://example.test/cabbage.jpg',
    available_quantity: '4.5',
    quantity: '8',
    unit: 'kg',
    location: 'Mandaue City',
    expiration_at: '2026-11-02T09:00:00.000Z',
    expiration_date: '2026-11-02',
    farmer_id: farmerId,
    farmer_name: 'North Farm',
    status: 'available',
  };
  const donationResponse = response();
  await api.sendMessage(makeRequest(
    { id: stakeholderId, name: 'Food Bank', role: 'stakeholder', verification_status: 'verified' },
    farmerId,
    { donationContext: { donationId, donationName: 'Forged name', availableQuantity: 999 } },
  ), donationResponse);
  const savedDonationMessage = calls.find(([kind, table]) => kind === 'insert' && table === 'messages')[2];
  assert.equal(donationResponse.statusCode, 201);
  assert.equal(savedDonationMessage.conversation_id, conversationId);
  assert.equal(savedDonationMessage.sender_id, stakeholderId);
  assert.equal(savedDonationMessage.context_donation_name, 'Cabbage');
  assert.equal(savedDonationMessage.context_donation_quantity, 4.5);
  assert.equal(savedDonationMessage.context_donation_description, 'Freshly harvested cabbage');
  assert.equal(donationResponse.body.donationContext.donationId, donationId);
  assert.equal(notifications[0].userId, farmerId);

  reset();
  state.product = {
    id: productId,
    farmer_id: farmerId,
    name: 'Tomatoes',
    category: 'Vegetables',
    image_url: null,
    unit: 'kg',
    price: '42.50',
    quantity: '7',
    status: 'active',
    expiration_date: null,
  };
  state.profiles[farmerId] = { id: farmerId, role: 'farmer', name: 'Farmer', farm_name: 'North Farm' };
  const productResponse = response();
  await api.sendMessage(makeRequest(
    { id: buyerId, name: 'Buyer', role: 'buyer' },
    farmerId,
    { productContext: { productId, productName: 'Forged name', price: 0, availableQuantity: 100 } },
  ), productResponse);
  const savedProductMessage = calls.find(([kind, table]) => kind === 'insert' && table === 'messages')[2];
  assert.equal(savedProductMessage.context_product_name, 'Tomatoes');
  assert.equal(savedProductMessage.context_product_price, '42.50');
  assert.equal(savedProductMessage.context_product_quantity, 7);
  assert.equal(productResponse.body.conversationId, conversationId);

  reset();
  state.donation = { id: donationId, farmer_id: farmerId, status: 'available', available_quantity: 4, quantity: 4 };
  await assert.rejects(api.sendMessage(makeRequest(
    { id: buyerId, name: 'Buyer', role: 'buyer' },
    farmerId,
    { donationContext: { donationId } },
  ), response()), { status: 403 });
  await assert.rejects(api.sendMessage(makeRequest(
    { id: stakeholderId, name: 'Food Bank', role: 'stakeholder', verification_status: 'pending' },
    farmerId,
    { donationContext: { donationId } },
  ), response()), { status: 403 });
  assert.equal(calls.some(([kind]) => kind === 'rpc'), false);

  reset();
  state.donation = { id: donationId, farmer_id: farmerId, status: 'available', available_quantity: 4, quantity: 4 };
  await assert.rejects(api.sendMessage(makeRequest(
    { id: farmerId, name: 'Farmer', role: 'farmer' },
    stakeholderId,
    { donationContext: { donationId } },
  ), response()), { status: 403 });

  reset();
  state.rpcError = { code: 'PGRST202', message: 'function ensure_direct_conversation was not found' };
  await assert.rejects(api.sendMessage(makeRequest(
    { id: buyerId, name: 'Buyer', role: 'buyer' },
    farmerId,
  ), response()), {
    status: 503,
    code: 'MESSAGING_MIGRATION_REQUIRED',
    message: /Apply the messaging migrations/,
  });

  reset();
  state.messageToFetch = {
    id: '70000000-0000-0000-0000-000000000001',
    sender_id: farmerId,
    sender_role: 'system',
    message_type: 'system',
    deleted: false,
  };
  await assert.rejects(api.deleteMessage({
    profile: { id: farmerId, role: 'farmer' },
    params: { messageId: state.messageToFetch.id },
  }, response()), { status: 403 });
});
