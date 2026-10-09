import { useEffect, useState } from 'react';
import { getAllPriceOverrides } from '../services/marketPriceService';

export function useAdminMarketReferences() {
  const [references, setReferences] = useState([]);
  const [referenceError, setReferenceError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let pending = false;
    const reload = async () => {
      if (pending) return;
      pending = true;
      try {
        const updates = await getAllPriceOverrides({ force: true });
        if (!cancelled) { setReferences(updates); setReferenceError(''); }
      } catch {
        if (!cancelled) { setReferences([]); setReferenceError('Admin market references are temporarily unavailable.'); }
      } finally { pending = false; }
    };
    reload();
    const interval = setInterval(reload, 15000);
    window.addEventListener('focus', reload);
    return () => { cancelled = true; clearInterval(interval); window.removeEventListener('focus', reload); };
  }, []);
  return { references, referenceError };
}
