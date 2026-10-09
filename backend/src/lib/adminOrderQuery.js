import { supabaseAdmin } from './supabaseClient.js';
import { ApiError } from './ApiError.js';

const OPTIONS = {
  status: ['pending', 'confirmed', 'completed', 'cancelled', 'rejected'],
  deliveryStatus: ['pending', 'preparing', 'packed', 'out_for_delivery', 'ready_for_pickup', 'delivered', 'picked_up', 'cancelled'],
  paymentMethod: ['cod', 'gcash'], paymentStatus: ['pending', 'paid', 'failed', 'refunded'],
  deliveryMethod: ['farmer_delivery', 'buyer_pickup', 'courier'],
};
const COLUMNS = { status: 'status', deliveryStatus: 'delivery_status', paymentMethod: 'payment_method', paymentStatus: 'payment_status', deliveryMethod: 'delivery_method' };
const fail = (error) => { if (error) throw new ApiError('Unable to load orders. Try again.', 500); };
const uuid = (hex) => `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;

export async function queryAdminOrders(profile, values) {
  if (profile.role !== 'admin') throw new ApiError('Only admins can use this order overview.', 403);
  const page = Number(values.page);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new ApiError('Invalid order page.', 400);
  let query = supabaseAdmin.from('orders').select('*', { count: 'exact' });
  for (const [key, options] of Object.entries(OPTIONS)) {
    if (!values[key]) continue;
    if (!options.includes(values[key])) throw new ApiError('Invalid order filter.', 400);
    query = query.eq(COLUMNS[key], values[key]);
  }
  const search = String(values.search || '').trim();
  if (search.length > 120) throw new ApiError('Search must be 120 characters or fewer.', 400);
  if (search) {
    const pattern = `"%${search.replace(/[\\%_*]/g, '\\$&').replace(/"/g, '\\"')}%"`;
    const filters = ['buyer_name', 'farmer_name', 'product_name'].map((field) => `${field}.ilike.${pattern}`);
    const hex = search.replace(/^#?HL-/i, '').replace(/-/g, '');
    if (/^[a-f0-9]{6,32}$/i.test(hex)) {
      filters.push(`and(id.gte.${uuid(hex.padEnd(32, '0'))},id.lte.${uuid(hex.padEnd(32, 'f'))})`);
    }
    query = query.or(filters.join(','));
  }
  for (const key of ['from', 'to']) {
    if (!values[key]) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values[key]) || Number.isNaN(Date.parse(values[key])) || new Date(values[key]).toISOString().slice(0, 10) !== values[key]) throw new ApiError('Choose a valid date.', 400);
  }
  if (values.from && values.to && values.from > values.to) throw new ApiError('Start date must be before end date.', 400);
  if (values.from) query = query.gte('created_at', `${values.from}T00:00:00+08:00`);
  if (values.to) {
    const nextDay = new Date(`${values.to}T00:00:00+08:00`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    query = query.lt('created_at', nextDay.toISOString());
  }
  const { data, count, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).range((page - 1) * 15, page * 15 - 1);
  fail(error);
  const counts = {};
  for (const key of ['all', ...OPTIONS.status, 'preparing', 'out_for_delivery']) {
    let counter = supabaseAdmin.from('orders').select('id', { count: 'exact', head: true });
    if (['preparing', 'out_for_delivery'].includes(key)) counter = counter.eq('status', 'confirmed').eq('delivery_status', key);
    else if (key !== 'all') counter = counter.eq('status', key);
    const result = await counter;
    fail(result.error);
    counts[key] = result.count || 0;
  }
  return { rows: data, total: count || 0, page, pageSize: 15, counts };
}
