import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './LalamoveDelivery.css';

export default function CourierDialog({ title, busy, onClose, children }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return createPortal(
    <dialog ref={ref} className="lalamove-dialog" aria-labelledby={titleId} aria-busy={busy}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <header className="lalamove-dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button type="button" aria-label="Close courier details" title="Close" onClick={onClose} disabled={busy}><X size={18} /></button>
      </header>
      {children}
    </dialog>, document.body,
  );
}
