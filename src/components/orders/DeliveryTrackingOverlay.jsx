import { useEffect } from 'react';
import { X } from 'lucide-react';


















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
