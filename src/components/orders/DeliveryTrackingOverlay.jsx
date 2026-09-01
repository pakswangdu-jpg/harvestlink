import { useEffect } from 'react';
import { X } from 'lucide-react';

// A presentation-only wrapper: it renders whatever tracking UI it is handed, and controls
// nothing but WHERE that UI appears. No tracking state, props, calculations or API calls pass
// through here — OrderTracking.jsx still owns all of it and passes the same JSX it used to
// render inline.
//
// Deliberately NOT conditionally rendered, and deliberately NOT using AnimatePresence like the
// app's other overlays: the children must stay mounted at all times. LiveDeliveryMap reports
// its Google Directions ETA/distance up to OrderTracking via onRouteUpdate, and that number
// feeds the "Estimated delivery" row in the order details panel that stays on the page behind
// this overlay (see the `liveRoute` comment in OrderTracking.jsx). Mounting the map only while
// the overlay is open would drop that page back to the coarser OSRM fallback until the user
// happened to open tracking, and would re-initialise the map on every open.
//
// Hidden with visibility (not display: none) for the same reason: visibility keeps the
// element's layout box and dimensions, so the Google map inside still measures a real
// width/height and initialises correctly, instead of the zero-size container a display: none
// parent would give it.
export default function DeliveryTrackingOverlay({ open, title, onClose, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  return (
    <div
      className={`tracking-overlay${open ? ' is-open' : ''}`}
      aria-hidden={open ? undefined : 'true'}
      onClick={onClose}
    >
      <div
        className="tracking-overlay-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="tracking-overlay-header">
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close tracking" className="tracking-overlay-close">
            <X size={20} strokeWidth={2} />
          </button>
        </div>
        <div className="tracking-overlay-body">
          {children}
        </div>
      </div>
    </div>
  );
}
