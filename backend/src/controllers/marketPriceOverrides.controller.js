import { supabaseAdmin } from '../lib/supabaseClient.js';
import { ApiError } from '../lib/ApiError.js';

function serialize(row) {
  return {
    commodityId: row.commodity_id,
    commodityLabel: row.commodity_label,
    referencePrice: Number(row.reference_price),
    referenceYear: row.reference_year,
    baselinePrice: row.baseline_price == null ? null : Number(row.baseline_price),
    reason: row.reason || null,
    updatedBy: row.updated_by,
    updatedByName: row.updated_by_name,
    updatedAt: row.updated_at,
  };
}

function serializeHistory(row) {
  return {
    id: row.id,
    commodityId: row.commodity_id,
    commodityLabel: row.commodity_label,
    previousPrice: row.previous_price == null ? null : Number(row.previous_price),
    newPrice: row.new_price == null ? null : Number(row.new_price),
    reason: row.reason || null,
    updatedBy: row.updated_by,
    updatedByName: row.updated_by_name,
    createdAt: row.created_at,
  };
}

// GET /api/market-price-overrides — any signed-in role reads this (every role's own PSA
// price lookup, via src/services/marketPriceService.js's applyOverride, needs to see it —
// this isn't an admin-only surface, only writing to it is).
export async function listOverrides(req, res) {
  const { data, error } = await supabaseAdmin.from('market_price_overrides').select('*');
  if (error) throw new ApiError(error.message, 400);
  res.json(data.map(serialize));
}

// PATCH /api/market-price-overrides/:commodityId — admin-only. Upserts on commodity_id so
// re-setting an override for the same commodity replaces it rather than erroring, matching
// the previous localStorage behavior (overrides[commodityId] = ...). Also writes a
// market_price_override_history row capturing what the value was before this change, so the
// Price Monitoring redesign's "Price History" panel has something real to show — the reason
// is required here (not just at the DB level, which stays nullable for older rows) because
// this is the one write path a human explicitly initiates through the confirmation modal.
export async function setOverride(req, res) {
  const commodityId = req.params.commodityId;
  const commodityLabel = String(req.body.commodityLabel || '').trim();
  const referencePrice = Number(req.body.referencePrice);
  const referenceYear = Number(req.body.referenceYear);
  const reason = String(req.body.reason || '').trim();
  if (!commodityLabel) throw new ApiError('Commodity label is required.', 400);
  if (!Number.isFinite(referencePrice) || referencePrice <= 0) throw new ApiError('Override price must be greater than 0.', 400);
  if (referencePrice > 999999) throw new ApiError('Override price cannot exceed ₱999,999.', 400);
  if (!Number.isFinite(referenceYear)) throw new ApiError('Reference year is required.', 400);
  if (!reason) throw new ApiError('A reason is required to update this reference price.', 400);
  const baselinePrice = req.body.baselinePrice == null || req.body.baselinePrice === '' ? null : Number(req.body.baselinePrice);

  const { data: previous } = await supabaseAdmin
    .from('market_price_overrides')
    .select('reference_price')
    .eq('commodity_id', commodityId)
    .maybeSingle();

  const { data, error } = await supabaseAdmin
    .from('market_price_overrides')
    .upsert({
      commodity_id: commodityId,
      commodity_label: commodityLabel,
      reference_price: referencePrice,
      reference_year: referenceYear,
      baseline_price: baselinePrice,
      reason,
      updated_by: req.profile.id,
      updated_by_name: req.profile.name || req.profile.email,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'commodity_id' })
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);

  await supabaseAdmin.from('market_price_override_history').insert({
    commodity_id: commodityId,
    commodity_label: commodityLabel,
    previous_price: previous ? Number(previous.reference_price) : (baselinePrice ?? null),
    new_price: referencePrice,
    reason,
    updated_by: req.profile.id,
    updated_by_name: req.profile.name || req.profile.email,
  });

  res.json(serialize(data));
}

// DELETE /api/market-price-overrides/:commodityId — admin-only. No-op (204) if no override
// existed for this commodity, same as clearing something already clear. Still logs a history
// row (new_price null) so "reset to PSA" shows up in the audit trail same as a set does.
export async function clearOverride(req, res) {
  const commodityId = req.params.commodityId;
  const { data: existing } = await supabaseAdmin
    .from('market_price_overrides')
    .select('commodity_label, reference_price')
    .eq('commodity_id', commodityId)
    .maybeSingle();

  const { error } = await supabaseAdmin.from('market_price_overrides').delete().eq('commodity_id', commodityId);
  if (error) throw new ApiError(error.message, 400);

  if (existing) {
    await supabaseAdmin.from('market_price_override_history').insert({
      commodity_id: commodityId,
      commodity_label: existing.commodity_label,
      previous_price: Number(existing.reference_price),
      new_price: null,
      reason: 'Reset to PSA reference price.',
      updated_by: req.profile.id,
      updated_by_name: req.profile.name || req.profile.email,
    });
  }

  res.status(204).end();
}

// GET /api/market-price-overrides/:commodityId/history — any signed-in role can read (same
// visibility rule as the current-value list above), newest first.
export async function getOverrideHistory(req, res) {
  const { data, error } = await supabaseAdmin
    .from('market_price_override_history')
    .select('*')
    .eq('commodity_id', req.params.commodityId)
    .order('created_at', { ascending: false });
  if (error) throw new ApiError(error.message, 400);
  res.json(data.map(serializeHistory));
}
