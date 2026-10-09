import { supabaseAdmin } from './supabaseClient.js';
import { serializeProfile } from './serialize.js';
import { ApiError } from './ApiError.js';

export function checkAccountError(error) {
  if (!error) return;
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(error.code)) throw new ApiError('Account management history is not configured. Apply the admin account migration.', 503);
  throw new ApiError(error.message || 'Unable to load users. Try again.', ({ '42501': 403, P0002: 404, '23514': 409, '22023': 400 })[error.code] || 500);
}
export async function getAdminUserPage(req, res) {
  if (req.profile.role !== 'admin') throw new ApiError('Admin access required.', 403);
  const { page: rawPage, role, verificationStatus, accountStatus, from, to } = req.query;
  const page = Number(rawPage);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new ApiError('Invalid users page.', 400);
  let query = supabaseAdmin.from('profiles').select('id,role,name,email,farm_name,organization_name,verification_status,account_status,created_at', { count: 'exact' });
  for (const [value, field, allowed] of [[role, 'role', ['farmer','buyer','stakeholder','admin']], [verificationStatus, 'verification_status', ['pending','verified','rejected','not_required']], [accountStatus, 'account_status', ['active','suspended']]]) {
    if (!value) continue;
    if (!allowed.includes(value)) throw new ApiError('Invalid user filter.', 400);
    query = value === 'not_required' ? query.in('role', ['buyer','admin']) : query.eq(field, value);
    if (field === 'verification_status' && value !== 'not_required') query = query.in('role', ['farmer','stakeholder']);
  }
  const search = String(req.query.search || '').trim();
  if (search.length > 120) throw new ApiError('Search is too long.', 400);
  if (search) {
    const pattern = `"%${search.replace(/[\\%_*]/g, '\\$&').replace(/"/g, '\\"')}%"`;
    query = query.or(['name','email','farm_name','organization_name'].map((field) => `${field}.ilike.${pattern}`).join(','));
  }
  for (const date of [from, to]) if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new ApiError('Choose a valid date.', 400);
  if (from && to && from > to) throw new ApiError('Start date must be before end date.', 400);
  if (from) query = query.gte('created_at', `${from}T00:00:00+08:00`);
  if (to) { const next = new Date(`${to}T00:00:00+08:00`); next.setUTCDate(next.getUTCDate() + 1); query = query.lt('created_at', next.toISOString()); }
  const result = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).range((page - 1) * 10, page * 10 - 1);
  checkAccountError(result.error);
  const counts = {};
  for (const key of ['all','farmer','buyer','stakeholder','admin','pending']) {
    let counter = supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true });
    if (key === 'pending') counter = counter.in('role', ['farmer','stakeholder']).eq('verification_status','pending');
    else if (key !== 'all') counter = counter.eq('role', key);
    const value = await counter; checkAccountError(value.error); counts[key] = value.count || 0;
  }
  res.json({ users: result.data.map(serializeProfile), total: result.count || 0, pageSize: 10, counts });
}

export async function getAdminUserDetails(req, res) {
  if (req.profile.role !== 'admin') throw new ApiError('Admin access required.', 403);
  const profile = await supabaseAdmin.from('profiles').select('*').eq('id', req.params.id).single();
  checkAccountError(profile.error);
  if (!profile.data) throw new ApiError('Account was not found.', 404);
  const user = serializeProfile(profile.data);
  const historyPage = Number(req.query.historyPage || 1);
  if (!Number.isSafeInteger(historyPage) || historyPage < 1 || historyPage > 100000) throw new ApiError('Invalid history page.', 400);
  const history = await supabaseAdmin.from('account_admin_events').select('*', { count: 'exact' }).eq('user_id', user.id)
    .order('occurred_at', { ascending: false }).order('id', { ascending: false }).range((historyPage - 1) * 10, historyPage * 10 - 1);
  // A missing audit table must block writes, not unrelated read-only profile details.
  const historyAvailable = !['PGRST205', '42P01'].includes(history.error?.code);
  if (historyAvailable) checkAccountError(history.error);
  const activity = {};
  const counts = user.role === 'farmer' ? [['Active products','products','farmer_id','status','active'],['Completed orders','orders','farmer_id','status','completed']]
    : user.role === 'buyer' ? [['Total orders','orders','buyer_id'],['Completed purchases','orders','buyer_id','status','completed']]
      : user.role === 'stakeholder' ? [['Donations claimed','donations','requested_by_id'],['Donations received','donations','requested_by_id','status','completed']] : [];
  for (const [label, table, field, statusField, status] of counts) {
    let counter = supabaseAdmin.from(table).select('id', { count: 'exact', head: true }).eq(field, user.id);
    if (status) counter = counter.eq(statusField, status);
    const value = await counter;
    activity[label] = value.error ? null : value.count || 0;
  }
  res.json({ user, activity, history: historyAvailable ? history.data : [], historyTotal: historyAvailable ? history.count || 0 : 0, historyPage, historyAvailable, accountManagementAvailable: historyAvailable });
}

export async function manageAccount(req, kind) {
  if (req.profile.role !== 'admin') throw new ApiError('Admin access required.', 403);
  if (req.body.reason != null && typeof req.body.reason !== 'string') throw new ApiError('Invalid reason.', 400);
  const { data, error } = await supabaseAdmin.rpc('manage_admin_account', {
    p_actor: req.profile.id, p_user: req.params.id, p_kind: kind, p_status: req.body.status,
    p_reason: req.body.reason || null, p_expected: req.body.expectedStatus || null,
  });
  checkAccountError(error);
  return data;
}
