import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';
import './AdminReferenceNotice.css';

export default function AdminReferenceNotice({ reference }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  if (!reference || !Number.isFinite(Number(reference.referencePrice)) || Number(reference.referencePrice) <= 0) return null;
  const unit = reference.unit || 'kg';
  const minimumPrice = Math.round(Number(reference.referencePrice) * 0.8 * 100) / 100;
  const maximumPrice = Math.round(Number(reference.referencePrice) * 1.2 * 100) / 100;

  return <div ref={rootRef} className="admin-reference-notice" data-open={open ? 'true' : 'false'}>
    <button type="button" className="admin-reference-trigger" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <ShieldCheck size={15} aria-hidden="true" /><strong>Admin reference: {formatCurrency(reference.referencePrice)}/{unit}</strong>
    </button>
    {open ? <div className="admin-reference-details" role="region">
    <p>{reference.updatedAt ? `Updated ${formatDate(reference.updatedAt)}` : 'Set by admin'}{reference.referenceYear ? ` / Reference year ${reference.referenceYear}` : ''}</p>
    {reference.reason ? <p className="admin-reference-reason">{reference.reason}</p> : null}
      <p>Suggested range {formatCurrency(minimumPrice)}–{formatCurrency(maximumPrice)}/{unit}</p>
    <p>Reference only. Farmer selling price is unchanged.</p>
    </div> : null}
  </div>;
}
