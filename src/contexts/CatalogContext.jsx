/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../features/auth/AuthContext';
import { getCatalog } from '../services/catalogService';

const CatalogContext = createContext(null);





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

    return {
      categories,
      categoryNames,
      units,
      loading,
      error,
      refresh,




      getCategoryOptions(currentValue) {
        if (!currentValue || categoryNames.includes(currentValue)) return categoryNames;
        return [...categoryNames, currentValue];
      },


      getUnitOptions(currentValue) {
        const values = units.map((unit) => unit.value);
        if (!currentValue || values.includes(currentValue)) return values;
        return [...values, currentValue];
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
