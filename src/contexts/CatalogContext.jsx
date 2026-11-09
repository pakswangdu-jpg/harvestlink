/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../features/auth/AuthContext';
import { getCatalog } from '../services/catalogService';
import { supabase } from '../lib/supabaseClient';

const CatalogContext = createContext(null);





export function CatalogProvider({ children }) {
  const { currentUser } = useAuth();
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [commodities, setCommodities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCatalog();
      setCategories(data.categories || []);
      setUnits(data.units || []);
      setCommodities(data.commodities || []);
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
          setCommodities([]);
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

  useEffect(() => {
    if (!currentUser?.id) return undefined;
    const channel = supabase
      .channel(`commodity-catalog-${currentUser.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commodity_catalog' }, () => {
        refresh().catch((refreshError) => setError(refreshError.message || 'Unable to refresh the product catalog.'));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'units' }, () => {
        refresh().catch((refreshError) => setError(refreshError.message || 'Unable to refresh measurement units.'));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUser?.id, refresh]);

  const value = useMemo(() => {
    const categoryNames = categories.map((category) => category.name);

    return {
      categories,
      categoryNames,
      units,
      commodities,
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
  }, [categories, units, commodities, loading, error, refresh]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const context = useContext(CatalogContext);
  if (!context) throw new Error('useCatalog must be used inside CatalogProvider.');
  return context;
}
