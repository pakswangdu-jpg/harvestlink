/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../features/auth/AuthContext';
import { getCatalog } from '../services/catalogService';

const CatalogContext = createContext(null);

// Fetches the admin-editable Category -> Product -> Unit catalog (see backend/src/
// controllers/catalog.controller.js) once per signed-in session and shares it app-wide — the
// single source of truth that replaced the old hardcoded PRODUCT_CATEGORIES array, and
// before that the flat crop_categories/crops tables.
export function CatalogProvider({ children }) {
  const { currentUser } = useAuth();
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCatalog();
      setCategories(data.categories || []);
      setUnits(data.units || []);
      setError('');
    } catch (fetchError) {
      setError(fetchError.message || 'Unable to load the product catalog.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Depends on currentUser?.id (a stable primitive), not the currentUser object itself —
  // AuthProvider hands out a brand-new object on every ~20s presence-poll hydrate (see
  // AuthContext.jsx), so depending on the whole object here would needlessly refetch the
  // catalog on that same cadence instead of only on an actual login/logout.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!currentUser) {
        if (!cancelled) {
          setCategories([]);
          setUnits([]);
        }
        return;
      }
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, refresh]);

  const value = useMemo(() => {
    const categoryNames = categories.map((category) => category.name);
    const byName = new Map(categories.map((category) => [category.name, category]));

    function getProductsForCategory(categoryName) {
      return byName.get(categoryName)?.products || [];
    }

    // A product without any catalog entry (the "Other" category, or a legacy/renamed
    // product name) falls back to the full master unit list — mirrors the backend's own
    // fallback exactly (see products.controller.js's assertValidCategoryAndUnit), which is
    // what "Other: allow administrator-defined units" resolves to in practice: admins
    // already fully control what's in the master unit list via the Catalog admin screen.
    function getUnitsForProduct(categoryName, productName) {
      const product = getProductsForCategory(categoryName).find((entry) => entry.name === productName);
      if (product) return product.units;
      return units.map((unit) => ({ ...unit, isDefault: false }));
    }

    return {
      categories,
      categoryNames,
      units,
      loading,
      error,
      refresh,
      getProductsForCategory,
      getUnitsForProduct,
      // A product created before its category was renamed/deactivated can still hold a
      // value no longer in `categoryNames` — appending it here keeps that value selectable
      // (and visibly correct) instead of silently defaulting away the moment an old listing
      // is opened for editing. Same reasoning for getProductOptions/getUnitOptions below.
      getCategoryOptions(currentValue) {
        if (!currentValue || categoryNames.includes(currentValue)) return categoryNames;
        return [...categoryNames, currentValue];
      },
      getProductOptions(categoryName, currentValue) {
        const names = getProductsForCategory(categoryName).map((entry) => entry.name);
        if (!currentValue || names.includes(currentValue)) return names;
        return [...names, currentValue];
      },
      getUnitOptions(categoryName, productName, currentValue) {
        const values = getUnitsForProduct(categoryName, productName).map((unit) => unit.value);
        if (!currentValue || values.includes(currentValue)) return values;
        return [...values, currentValue];
      },
      getDefaultUnitValue(categoryName, productName) {
        const list = getUnitsForProduct(categoryName, productName);
        const found = list.find((unit) => unit.isDefault);
        return found ? found.value : (list[0]?.value ?? '');
      },
    };
  }, [categories, units, loading, error, refresh]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const context = useContext(CatalogContext);
  if (!context) throw new Error('useCatalog must be used inside CatalogProvider.');
  return context;
}
