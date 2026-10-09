import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MARKET_COMMODITIES, clearPriceOverride, fetchAnnualPriceTrend, fetchRawAnnualPriceTrend, getPriceOverride, matchCommodity, setPriceOverride,
} from '../../../services/marketPriceService';
import { getFixedKgPerUnit } from '../../../utils/unitConversion';
import { getProducts, getPendingPriceReviews } from '../../../services/productService';
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
  const [loadError, setLoadError] = useState('');
  const [pricesLoaded, setPricesLoaded] = useState(0);

  const loadCommodityPrice = useCallback(async (commodity) => {
    try {
      const points = await fetchAnnualPriceTrend(commodity.id, 5);
      const rawPoints = await fetchRawAnnualPriceTrend(commodity.id, 5);
      const psa = [...rawPoints].reverse().find((point) => point.price != null);
      const latest = [...points].reverse().find((point) => point.price != null);
      const override = await getPriceOverride(commodity.id);
      setPriceData((previous) => ({
        ...previous,
        [commodity.id]: {
          referencePrice: latest?.price ?? null,
          psaPrice: psa?.price ?? null,
          psaYear: psa?.year ?? null,
          referenceYear: latest?.year ?? null,
          isOverride: Boolean(latest?.isOverride),
          override,
          trendPoints: points,
        },
      }));
    } catch {


      const override = await getPriceOverride(commodity.id);
      setPriceData((previous) => ({
        ...previous,
        [commodity.id]: {
          referencePrice: override?.referencePrice ?? null,
          psaPrice: null,
          psaYear: null,
          referenceYear: override?.referenceYear ?? null,
          isOverride: Boolean(override),
          override,
          trendPoints: [],
        },
      }));
    } finally {
      setPricesLoaded((count) => count + 1);
    }
  }, []);

  const reloadCommodityPrice = useCallback((commodityId) => {
    const commodity = MARKET_COMMODITIES.find((item) => item.id === commodityId);
    if (commodity) loadCommodityPrice(commodity);
  }, [loadCommodityPrice]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const commodity of MARKET_COMMODITIES) {
        if (cancelled) return;
        await loadCommodityPrice(commodity);
        await new Promise((resolve) => setTimeout(resolve, PSA_REQUEST_PACING_MS));
      }
    })();
    return () => { cancelled = true; };
  }, [loadCommodityPrice]);

  const reloadListings = useCallback(() => {
    Promise.all([getProducts(), getPendingPriceReviews()])
      .then(([listings, pending]) => { setProducts(listings); setReviews(pending); setLoadError(''); })
      .catch((error) => setLoadError(error.message || 'Could not load Farmer listings and price reviews.'));
  }, []);

  useEffect(() => { reloadListings(); }, [reloadListings]);

  const rows = useMemo(() => {
    const activeProducts = (products || []).filter((product) => product.status === 'active');
    const productsByCommodity = new Map();
    for (const product of activeProducts) {
      const commodity = matchCommodity(product.name);
      if (!commodity) continue;
      if (!productsByCommodity.has(commodity.id)) productsByCommodity.set(commodity.id, []);
      productsByCommodity.get(commodity.id).push(product);
    }

    const reviewCommodityIds = new Set(
      (reviews || []).map((review) => matchCommodity(review.name)?.id).filter(Boolean)
    );

    return MARKET_COMMODITIES.map((commodity) => {
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
        category: getCommodityCategory(commodity.id),
        referencePrice,
        psaPrice: info?.psaPrice ?? null,
        psaYear: info?.psaYear ?? null,
        relatedListings: (products || []).filter((product) => matchCommodity(product.name)?.id === commodity.id),
        referenceYear: info?.referenceYear ?? null,
        isOverride: Boolean(info?.isOverride),
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
  }, [priceData, products, reviews]);

  const isInitialLoading = products === null || reviews === null;
  const pricesProgress = Math.min(1, pricesLoaded / MARKET_COMMODITIES.length);

  const saveOverride = useCallback(async (commodityId, price, reason, baseline) => {
    await setPriceOverride(commodityId, price, { ...baseline, reason });
    reloadCommodityPrice(commodityId);
  }, [reloadCommodityPrice]);

  const resetOverride = useCallback(async (commodityId) => {
    await clearPriceOverride(commodityId);
    reloadCommodityPrice(commodityId);
  }, [reloadCommodityPrice]);

  return {
    rows,
    products,
    reviews,
    loadError,
    isInitialLoading,
    pricesProgress,
    saveOverride,
    resetOverride,
    reloadListings,
  };
}
