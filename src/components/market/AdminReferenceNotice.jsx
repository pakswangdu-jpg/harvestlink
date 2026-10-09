import { ShieldCheck } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';
import './AdminReferenceNotice.css';

export default function AdminReferenceNotice({ reference }) {
  if (!reference || !Number.isFinite(Number(reference.referencePrice)) || Number(reference.referencePrice) <= 0) return null;
  return <div className="admin-reference-notice">
    <div><ShieldCheck size={15} aria-hidden="true" /><strong>Admin reference: {formatCurrency(reference.referencePrice)}/kg</strong></div>
    <p>{reference.updatedAt ? `Updated ${formatDate(reference.updatedAt)}` : 'Set by admin'}{reference.referenceYear ? ` / Reference year ${reference.referenceYear}` : ''}</p>
    {reference.reason ? <p className="admin-reference-reason">{reference.reason}</p> : null}
    <p>Reference only. Farmer selling price is unchanged.</p>
  </div>;
}
