import { useRef, useState } from 'react';
import { Check, Eye } from 'lucide-react';
import Table from '../../../components/admin/Table';
import Button from '../../../components/admin/Button';
import Modal from '../../../components/admin/Modal';
import LoadingState from '../../../components/admin/LoadingState';
import { approvePriceReview, declinePriceReview } from '../../../services/productService';
import { formatCurrency, formatDate } from '../../../utils/formatters';
import { priceReviewComparison } from './priceReviewPresentation';

export default function PendingReviews({ reviews, commodities, onNotice, onError, onReload }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const [action, setAction] = useState('details');
  const [maximum, setMaximum] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const openReview = (product, nextAction) => {
    setSelected(product); setAction(nextAction); setError('');
    setMaximum(product.priceReview.reviewUnit === product.unit ? product.priceReview.maxAllowedPrice ?? '' : '');
    setReason('');
  };
  const close = () => { if (!lock.current) setSelected(null); };
  const submit = async (event) => {
    event.preventDefault();
    if (!selected || lock.current || !['approve', 'adjust'].includes(action)) return;
    if (action === 'adjust' && (!(Number(maximum) > 0) || !Number.isFinite(Number(maximum)) || !reason.trim())) {
      setError('Enter a positive maximum price and a reason.'); return;
    }
    lock.current = true; setBusy(true); setError('');
    try {
      const snapshot = { submittedPrice: selected.price, unit: selected.unit };
      if (action === 'approve') await approvePriceReview(selected.id, snapshot);
      else await declinePriceReview(selected.id, { ...snapshot, maxAllowedPrice: Number(maximum), reason: reason.trim() });
      onNotice(action === 'approve' ? `${selected.name}'s selling price was approved.` : `${selected.name} was returned to the Farmer for a price adjustment.`);
      onError(''); onReload(); setSelected(null);
    } catch (failure) { setError(failure.message); onError(failure.message); }
    finally { lock.current = false; setBusy(false); }
  };
  if (reviews === null) return <LoadingState />;
  if (!reviews.length) return <p className="pm-empty"><Check size={16} /> No listings currently need review.</p>;
  const comparison = selected ? priceReviewComparison(selected, commodities) : null;
  return <>
    <Table className="pm-pending-reviews-table" scrollLabel="Pending price reviews" rows={reviews} columns={[
      { key: 'name', label: 'Product' }, { key: 'farmerName', label: 'Farmer' },
      { key: 'price', label: 'Submitted price', render: (row) => formatCurrency(row.price) },
      { key: 'unit', label: 'Unit' },
      { key: 'reference', label: 'Reference / kg', render: (row) => { const info = priceReviewComparison(row, commodities); return <>{info.referencePrice > 0 ? formatCurrency(info.referencePrice) : 'Unavailable'}<small>{info.referenceSource}{info.referenceYear ? ` (${info.referenceYear})` : ''}</small></>; } },
      { key: 'difference', label: 'Difference', render: (row) => { const info = priceReviewComparison(row, commodities); return <>{info.deviationPct == null ? '--' : `${info.deviationPct > 0 ? '+' : ''}${info.deviationPct}%`}{info.possibleOverpricing ? <small className="pm-price-warning">Possible overpricing</small> : null}</>; } },
      { key: 'quantity', label: 'Stock', render: (row) => `${row.quantity} ${row.unit}` },
      { key: 'submitted', label: 'Submitted', render: (row) => formatDate(row.priceReview.submittedAt || row.priceReview.createdAt || row.createdAt) },
      { key: 'actions', label: 'Actions', render: (row) => <div className="pm-review-actions">
        <Button disabled={busy} onClick={() => openReview(row, 'details')}><Eye size={14} /> View details</Button>
        <Button variant="primary" disabled={busy} onClick={() => openReview(row, 'approve')}><Check size={14} /> Approve</Button>
        <Button disabled={busy} onClick={() => openReview(row, 'adjust')}>Needs adjustment</Button>
      </div> },
    ]} />
    <Modal open={Boolean(selected)} onClose={close} title={action === 'approve' ? 'Approve selling price?' : action === 'adjust' ? 'Request price adjustment' : 'Price review details'} className="pm-modal pm-price-review-modal" dialogLabel="Review Farmer selling price">
      {selected ? <form onSubmit={submit} className="pm-price-review-form">
        <div><h3>{selected.name}</h3><p className="pm-secondary">Farmer: {selected.farmerName}</p></div>
        <dl className="pm-review-comparison">
          <div><dt>Submitted price</dt><dd>{formatCurrency(selected.price)}/{selected.unit}</dd></div>
          {selected.unit !== 'kg' ? <div><dt>Equivalent per kg</dt><dd>{formatCurrency(comparison.pricePerKg)}/kg</dd></div> : null}
          <div><dt>{comparison.referenceSource}</dt><dd>{comparison.referencePrice > 0 ? `${formatCurrency(comparison.referencePrice)}/kg` : 'Unavailable'}</dd></div>
          {comparison.referenceSource === 'Admin reference' && comparison.psaPrice != null ? <div><dt>PSA reference</dt><dd>{formatCurrency(comparison.psaPrice)}/kg</dd></div> : null}
          <div><dt>Difference from reference</dt><dd>{comparison.deviationPct == null ? '--' : `${comparison.deviationPct > 0 ? '+' : ''}${comparison.deviationPct}%`}</dd></div>
          <div><dt>Stock</dt><dd>{selected.quantity} {selected.unit}</dd></div>
          {comparison.maxAllowedPrice != null ? <div><dt>Previous Admin maximum</dt><dd>{formatCurrency(comparison.maxAllowedPrice)}/{selected.unit}</dd></div> : null}
        </dl>
        {comparison.possibleOverpricing ? <p className="pm-price-warning">Possible overpricing</p> : null}
        {selected.priceReview.reason ? <p className="pm-secondary">{selected.priceReview.reason}</p> : null}
        {action === 'adjust' ? <>
          <label htmlFor="review-max-price">Maximum acceptable price /{selected.unit}
            <input id="review-max-price" type="number" min="0.01" step="0.01" required value={maximum} disabled={busy} onChange={(event) => setMaximum(event.target.value)} />
          </label>
          <label htmlFor="review-reason">Reason
            <textarea id="review-reason" required maxLength={1000} rows={3} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} />
          </label>
        </> : null}
        {error ? <p className="form-alert error" role="alert">{error}</p> : null}
        <div className="pm-review-dialog-actions">
          <Button disabled={busy} onClick={close}>Cancel</Button>
          {action === 'details' ? <><Button disabled={busy} onClick={() => setAction('adjust')}>Needs adjustment</Button><Button variant="primary" disabled={busy} onClick={() => setAction('approve')}>Approve</Button></> : <Button variant="primary" type="submit" disabled={busy}>{busy ? 'Saving...' : action === 'approve' ? 'Approve price' : 'Send to Farmer'}</Button>}
        </div>
      </form> : null}
    </Modal>
  </>;
}
