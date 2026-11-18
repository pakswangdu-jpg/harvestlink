import { ShieldCheck } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';
import './AdminReferenceNotice.css';

export default function AdminReferenceNotice({ reference }) {
  if (!reference || !Number.isFinite(Number(reference.referencePrice)) || Number(reference.referencePrice) <= 0) return null;
  const unit = reference.unit || 'kg';
  const minimumPrice = Math.round(Number(reference.referencePrice) * 0.8 * 100) / 100;
  const maximumPrice = Math.round(Number(reference.referencePrice) * 1.2 * 100) / 100;
  return <div className="admin-reference-notice">
    <div><ShieldCheck size={15} aria-hidden="true" /><strong>Admin reference: {formatCurrency(reference.referencePrice)}/{unit}</strong></div>
    <p>{reference.updatedAt ? `Updated ${formatDate(reference.updatedAt)}` : 'Set by admin'}{reference.referenceYear ? ` / Reference year ${reference.referenceYear}` : ''}</p>
    {reference.reason ? <p className="admin-reference-reason">{reference.reason}</p> : null}
    <p>Suggested range (±20%): {formatCurrency(minimumPrice)}–{formatCurrency(maximumPrice)}/{unit}</p>
    <p>Reference only. Farmer selling price is unchanged.</p>
  </div>;
}
