import { useState } from 'react';
import { Navigation } from 'lucide-react';
import { getOrderTrackingProfiles } from '../../services/orderService';
import { getRegisteredCoordinates } from '../../utils/geo';
import { buildWazeNavigationUrl } from '../../utils/wazeNavigation';

export default function WazeNavigationButton({ orderId, destinationRole }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const launchWaze = async () => {
    const wazeWindow = window.open('about:blank', '_blank');
    if (!wazeWindow) {
      setError('Allow pop-ups to open Waze navigation.');
      return;
    }
    wazeWindow.opener = null;
    setIsLoading(true);
    setError('');
    try {
      const profiles = await getOrderTrackingProfiles(orderId, { fresh: true });
      const destinationProfile = destinationRole === 'farmer' ? profiles.farmer : profiles.buyer;
      const url = buildWazeNavigationUrl(getRegisteredCoordinates(destinationProfile));
      if (!url) {
        wazeWindow.close();
        setError('Saved destination coordinates are unavailable.');
        return;
      }
      wazeWindow.location.replace(url);
    } catch {
      wazeWindow.close();
      setError('Could not load the latest destination. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="ot-view-tracking-btn"
        onClick={launchWaze}
        disabled={isLoading}
        aria-busy={isLoading}
      >
        <Navigation size={15} aria-hidden="true" />
        {isLoading ? 'Opening Waze…' : 'Navigate with Waze'}
      </button>
      {error ? <span className="ot-waze-navigation-error" role="alert">{error}</span> : null}
    </>
  );
}
