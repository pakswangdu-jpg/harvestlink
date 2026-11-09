import { supabaseAdmin } from './supabaseClient.js';
import { ApiError } from './ApiError.js';
import { fetchAnnualPriceTrend } from './psaPriceService.js';
import { MARKET_COMMODITIES, matchCommodity } from './marketCommodities.js';
import { getFixedKgPerUnit } from './unitConversion.js';

function normalize(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function findCommodityById(commodityId) {
  const builtIn = MARKET_COMMODITIES.find((commodity) => commodity.id === commodityId);
  if (builtIn) return { id: builtIn.id, label: builtIn.label, unit: 'kg', isCustom: false };

  const { data, error } = await supabaseAdmin
    .from('commodity_catalog')
    .select('id, name, variety, unit, is_active')
    .eq('id', commodityId)
    .maybeSingle();
  if (error) throw new ApiError(error.message, 400);
  if (!data) throw new ApiError('Commodity was not found.', 404);
  return {
    id: data.id,
    label: [data.name, data.variety].filter(Boolean).join(' '),
    unit: data.unit,
    isCustom: true,
    isActive: data.is_active,
  };
}

export async function resolveEffectiveReference(commodityId) {
  const commodity = await findCommodityById(commodityId);
  if (commodity.isActive === false) return { commodity, reference: null };
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const dateValues = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]));
  const today = `${dateValues.year}-${dateValues.month}-${dateValues.day}`;
  const { data: overrideRows, error } = await supabaseAdmin
    .from('market_price_overrides')
    .select('*')
    .eq('commodity_id', commodityId)
    .eq('is_active', true);
  if (error) throw new ApiError(error.message, 400);
  const override = (overrideRows || []).find((row) => !row.effective_date || row.effective_date <= today);

  if (override) {
    return {
      commodity,
      reference: {
        price: Number(override.reference_price),
        unit: override.unit || 'kg',
        source: override.source || 'admin_entered',
        effectiveDate: override.effective_date,
        year: override.reference_year,
        supportingReference: override.supporting_reference || null,
      },
    };
  }

  if (commodity.isCustom) return { commodity, reference: null };
  const points = await fetchAnnualPriceTrend(commodityId, 5);
  const latest = [...points].reverse().find((point) => point.price != null);
  return {
    commodity,
    reference: latest ? {
      price: Number(latest.price),
      unit: 'kg',
      source: 'psa',
      effectiveDate: `${latest.year}-01-01`,
      year: latest.year,
      supportingReference: 'PSA Central Visayas annual farmgate series',
    } : null,
  };
}

async function findProductCommodity(name) {
  const productName = normalize(name);
  if (!productName) return null;
  const builtIn = matchCommodity(name);
  if (builtIn) return builtIn.id;

  const { data, error } = await supabaseAdmin
    .from('commodity_catalog')
    .select('id, name, variety, is_active')
    .eq('is_active', true);
  if (error) throw new ApiError(error.message, 400);
  const custom = (data || []).find((commodity) => {
    const fullName = normalize([commodity.name, commodity.variety].filter(Boolean).join(' '));
    return productName === fullName || (!commodity.variety && productName === normalize(commodity.name));
  });
  if (custom) return custom.id;
  return null;
}

export async function getServerPriceReviewReference(name, unit, kgPerUnit) {
  const commodityId = await findProductCommodity(name);
  if (!commodityId) return null;
  const { commodity, reference } = await resolveEffectiveReference(commodityId);
  if (!reference) return null;

  let referencePrice = reference.price;
  if (normalize(reference.unit) !== 'kg') {
    const fixedKg = getFixedKgPerUnit(reference.unit);
    if (fixedKg != null) {
      referencePrice /= fixedKg;
    } else {
      if (normalize(reference.unit) !== normalize(unit)) return null;
      const conversion = Number(kgPerUnit);
      if (!Number.isFinite(conversion) || conversion <= 0) return null;
      referencePrice /= conversion;
    }
  }
  return {
    commodityId: commodity.id,
    commodityLabel: commodity.label,
    referencePrice: Math.round(referencePrice * 100) / 100,
    referenceYear: reference.year,
    isOverride: reference.source !== 'psa',
    referenceSource: reference.source,
    unit: reference.unit,
  };
}
