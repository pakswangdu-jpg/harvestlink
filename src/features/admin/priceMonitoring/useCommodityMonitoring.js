import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MARKET_COMMODITIES, clearPriceOverride, fetchAnnualPriceTrend, fetchRawAnnualPriceTrend, getPriceOverride, invalidatePriceOverridesCache, isPriceOverrideEffective, matchCommodity, setPriceOverride,
} from '../../../services/marketPriceService';
import { getFixedKgPerUnit } from '../../../utils/unitConversion';
import { getProducts, getPendingPriceReviews } from '../../../services/productService';
import { getCatalog } from '../../../services/catalogService';
import { supabase } from '../../../lib/supabaseClient';
import { getCommodityCategory } from './commodityCategories';
import { resolveCommodityStatus } from './statusMeta';





const PSA_REQUEST_PACING_MS = 350;

function toPricePerKg(product) {
  const fixedKg = getFixedKgPerUnit(product.unit);
  const kgPerUnit = fixedKg ?? (product.kgPerUnit && product.kgPerUnit > 0 ? product.kgPerUnit : 1);
  return product.price / kgPerUnit;
}

function getAvgFarmerPrice(pricesPerKg) {
  if (!pricesPerKg.length) return null;
  return pricesPerKg.reduce((sum, price) => sum + price, 0) / pricesPerKg.length;
}

function getHighestFarmerPrice(pricesPerKg) {
  return pricesPerKg.length ? Math.max(...pricesPerKg) : null;
}

function getLowestFarmerPrice(pricesPerKg) {
  return pricesPerKg.length ? Math.min(...pricesPerKg) : null;
}

export function useCommodityMonitoring() {
  const [priceData, setPriceData] = useState({});
  const [products, setProducts] = useState(null);
  const [reviews, setReviews] = useState(null);
  const [commodities, setCommodities] = useState(MARKET_COMMODITIES);
  const [loadError, setLoadError] = useState('');
  const [pricesLoaded, setPricesLoaded] = useState(0);

  const loadCommodityPrice = useCallback(async (commodity) => {
    try {
      const points = commodity.isCustom ? [] : await fetchAnnualPriceTrend(commodity.id, 5);
      const rawPoints = commodity.isCustom ? [] : await fetchRawAnnualPriceTrend(commodity.id, 5);
      const psa = [...rawPoints].reverse().find((point) => point.price != null);
      const latest = [...points].reverse().find((point) => point.price != null);
      const override = await getPriceOverride(commodity.id);
      const hasEffectiveOverride = isPriceOverrideEffective(override);
      setPriceData((previous) => ({
        ...previous,
        [commodity.id]: {
          referencePrice: hasEffectiveOverride ? override.referencePrice : latest?.price ?? null,
          psaPrice: psa?.price ?? null,
          psaYear: psa?.year ?? null,
          referenceYear: hasEffectiveOverride ? override.referenceYear : latest?.year ?? null,
          isOverride: hasEffectiveOverride,
          source: hasEffectiveOverride ? override.source : 'psa',
          override,
          trendPoints: points,
        },
      }));
    } catch {


      const override = await getPriceOverride(commodity.id);
      const hasEffectiveOverride = isPriceOverrideEffective(override);
      setPriceData((previous) => ({
        ...previous,
        [commodity.id]: {
          referencePrice: hasEffectiveOverride ? override.referencePrice : null,
          psaPrice: null,
          psaYear: null,
          referenceYear: hasEffectiveOverride ? override.referenceYear : null,
          isOverride: hasEffectiveOverride,
          source: hasEffectiveOverride ? override.source : null,
          override,
          trendPoints: [],
        },
      }));
    } finally {
      setPricesLoaded((count) => count + 1);
    }
  }, []);

  const reloadCommodityPrice = useCallback((commodityId) => {
    const commodity = commodities.find((item) => item.id === commodityId);
    if (commodity) loadCommodityPrice(commodity);
  }, [commodities, loadCommodityPrice]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const commodity of commodities) {
        if (cancelled) return;
        await loadCommodityPrice(commodity);
        await new Promise((resolve) => setTimeout(resolve, PSA_REQUEST_PACING_MS));
      }
    })();
    return () => { cancelled = true; };
  }, [commodities, loadCommodityPrice]);

  const reloadCommodityCatalog = useCallback(async () => {
    const catalog = await getCatalog({ includeInactive: true });
    const custom = (catalog.commodities || []).map((commodity) => ({
      ...commodity,
      keywords: [commodity.name, commodity.label].filter(Boolean).map((value) => value.toLowerCase()),
      isCustom: true,
    }));
    setCommodities([...MARKET_COMMODITIES, ...custom]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getCatalog({ includeInactive: true }).then((catalog) => {
      if (cancelled) return;
      const custom = (catalog.commodities || []).map((commodity) => ({
        ...commodity,
        keywords: [commodity.name, commodity.label].filter(Boolean).map((value) => value.toLowerCase()),
        isCustom: true,
      }));
      setCommodities([...MARKET_COMMODITIES, ...custom]);
    }).catch((error) => {
      if (!cancelled) setLoadError(error.message || 'Could not load the commodity catalog.');
    });
    return () => { cancelled = true; };
  }, [reloadCommodityCatalog]);

  useEffect(() => {
    const channel = supabase
      .channel('admin-market-price-monitoring')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'market_price_overrides' }, (payload) => {
        const commodityId = payload.new?.commodity_id || payload.old?.commodity_id;
        if (commodityId) {
          invalidatePriceOverridesCache();
          reloadCommodityPrice(commodityId);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commodity_catalog' }, () => {
        reloadCommodityCatalog().catch((error) => setLoadError(error.message || 'Could not refresh the commodity catalog.'));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [reloadCommodityCatalog, reloadCommodityPrice]);

  const reloadListings = useCallback(() => {
    Promise.all([getProducts(), getPendingPriceReviews()])
      .then(([listings, pending]) => { setProducts(listings); setReviews(pending); setLoadError(''); })
      .catch((error) => setLoadError(error.message || 'Could not load Farmer listings and price reviews.'));
  }, []);

  useEffect(() => {
    reloadListings();
    window.addEventListener('focus', reloadListings);
    return () => window.removeEventListener('focus', reloadListings);
  }, [reloadListings]);

  const rows = useMemo(() => {
    const activeProducts = (products || []).filter((product) => product.status === 'active');
    const productsByCommodity = new Map();
    for (const product of activeProducts) {
      const commodity = matchCommodity(product.name, commodities);
      if (!commodity) continue;
      if (!productsByCommodity.has(commodity.id)) productsByCommodity.set(commodity.id, []);
      productsByCommodity.get(commodity.id).push(product);
    }

    const reviewCommodityIds = new Set(
      (reviews || []).map((review) => matchCommodity(review.name, commodities)?.id).filter(Boolean)
    );

    return commodities.map((commodity) => {
      const info = priceData[commodity.id];
      const matched = productsByCommodity.get(commodity.id) || [];
      const pricesPerKg = matched.map(toPricePerKg);

      const avgFarmerPrice = getAvgFarmerPrice(pricesPerKg);
      const highFarmerPrice = getHighestFarmerPrice(pricesPerKg);
      const lowFarmerPrice = getLowestFarmerPrice(pricesPerKg);

      const referencePrice = info?.referencePrice ?? null;
      const status = resolveCommodityStatus({
        referencePrice,
        avgFarmerPrice,
        hasOverride: Boolean(info?.isOverride),
        hasPendingReview: reviewCommodityIds.has(commodity.id),
      });

      return {
        id: commodity.id,
        label: commodity.label,
        isCustom: Boolean(commodity.isCustom),
        category: commodity.isCustom ? commodity.category : getCommodityCategory(commodity.id),
        referencePrice,
        psaPrice: info?.psaPrice ?? null,
        psaYear: info?.psaYear ?? null,
        relatedListings: (products || [])        .filter((product) => matchCommodity(product.name, commodities)?.id === commodity.id),
        referenceYear: info?.referenceYear ?? null,
        isOverride: Boolean(info?.isOverride),
        source: info?.source || null,
        unit: info?.override?.unit || commodity.unit || 'kg',
        override: info?.override ?? null,
        trendPoints: info?.trendPoints ?? [],
        avgFarmerPrice,
        highFarmerPrice,
        lowFarmerPrice,
        listingsCount: matched.length,
        status,
        loading: !info,
      };
    });
  }, [commodities, priceData, products, reviews]);

  const isInitialLoading = products === null || reviews === null;
  const pricesProgress = Math.min(1, pricesLoaded / Math.max(commodities.length, 1));

  const saveOverride = useCallback(async (commodityId, price, details = {}) => {
    await setPriceOverride(commodityId, price, details);
    reloadCommodityPrice(commodityId);
  }, [reloadCommodityPrice]);

  const resetOverride = useCallback(async (commodityId) => {
    await clearPriceOverride(commodityId);
    reloadCommodityPrice(commodityId);
  }, [reloadCommodityPrice]);

  return {
    rows,
    commodities,
    products,
    reviews,
    loadError,
    isInitialLoading,
    pricesProgress,
    saveOverride,
    resetOverride,
    reloadListings,
    reloadCommodityPrice,
    reloadCommodityCatalog,
  };
}
