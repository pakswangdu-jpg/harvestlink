import { useCallback, useEffect, useRef, useState } from 'react';
import { getAvailableDonations, getDonations, getDonationsByFarmer, getDonationsForStakeholder } from '../services/donationService';
import { supabase } from '../lib/supabaseClient';

export function useDonationList({ farmerId, stakeholderId, availableOnly = false } = {}) {
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const pending = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    pending.current += 1;
    try {
      const rows = await (farmerId ? getDonationsByFarmer(farmerId)
        : stakeholderId ? getDonationsForStakeholder(stakeholderId)
          : availableOnly ? getAvailableDonations() : getDonations());
      if (request !== generation.current) return;
      setDonations(rows);
      setError('');
    } catch (loadError) {
      if (request === generation.current) setError(loadError.message);
    } finally {
      pending.current -= 1;
      if (request === generation.current) setLoading(false);
    }
  }, [farmerId, stakeholderId, availableOnly]);

  useEffect(() => {
    // State updates happen after the API request settles, not during the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
    const interval = setInterval(() => { if (!pending.current) reload(); }, 4000);
    const channel = supabase
      .channel(`donations-live-${farmerId || stakeholderId || (availableOnly ? 'available' : 'all')}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'donations' }, () => {
        reload();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'donation_claims' }, () => {
        reload();
      })
      .subscribe();
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
      generation.current += 1;
    };
  }, [reload, farmerId, stakeholderId, availableOnly]);

  return { donations, loading, loadError: error, reload };
}
