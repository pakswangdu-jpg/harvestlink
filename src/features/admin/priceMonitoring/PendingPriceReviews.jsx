import { useEffect, useRef, useState } from 'react';
import { Check, Eye } from 'lucide-react';
import Table from '../../../components/admin/Table';
import Button from '../../../components/admin/Button';
import Modal from '../../../components/admin/Modal';
import LoadingState from '../../../components/admin/LoadingState';
import { approvePriceReview, declinePriceReview } from '../../../services/productService';
import { formatCurrency, formatDate } from '../../../utils/formatters';
import { priceReviewComparison } from './priceReviewPresentation';
import { getCropForecastDetail } from '../../../services/demandForecastService';

function previousApprovedPrice(review) {
  const approvals = (review.previousDecisions || []).filter((decision) => (
    decision.status === 'approved' && decision.approvedPrice != null
  ));
  return approvals.length ? approvals[approvals.length - 1] : null;
}

function reviewStatusLabel(status) {
  return ({
    pending: 'Pending review',
    approved: 'Approved',
    needs_adjustment: 'Needs price adjustment',
    declined: 'Declined',
  })[status] || status;
}

export default function PendingReviews({ reviews, commodities, onNotice, onError, onReload }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const [action, setAction] = useState('details');
  const [maximum, setMaximum] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [forecastResult, setForecastResult] = useState({ productId: '', data: null, error: '' });
  const openReview = (product, nextAction) => {
    setSelected(product); setAction(nextAction); setError('');
    setMaximum(product.priceReview.reviewUnit === product.unit ? product.priceReview.maxAllowedPrice ?? '' : '');
    setReason('');
  };
  const close = () => { if (!lock.current) setSelected(null); };
  useEffect(() => {
    if (!selected) return undefined;
    let cancelled = false;
    getCropForecastDetail(selected.name, { period: '7_days', municipality: selected.location || '' })
      .then((data) => { if (!cancelled) setForecastResult({ productId: selected.id, data, error: '' }); })
      .catch((failure) => { if (!cancelled) setForecastResult({ productId: selected.id, data: null, error: failure.message }); });
    return () => { cancelled = true; };
  }, [selected]);
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
  const priorApproval = selected ? previousApprovedPrice(selected.priceReview) : null;
  const forecastLoading = Boolean(selected) && forecastResult.productId !== selected.id;
  const forecast = forecastLoading ? { data: null, error: '' } : forecastResult;
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
    <div className="pm-pending-review-cards">
      {reviews.map((row) => {
        const rowComparison = priceReviewComparison(row, commodities);
        return (
          <article key={row.id} className="pm-pending-review-card">
            <div className="pm-pending-review-card-heading">
              <div><h3>{row.name}</h3><p>{row.farmerName || 'Farmer unavailable'}</p></div>
              <span>{formatDate(row.priceReview.submittedAt || row.priceReview.createdAt || row.createdAt)}</span>
            </div>
            <dl>
              <div><dt>Submitted price</dt><dd>{formatCurrency(row.price)}/{row.unit}</dd></div>
              <div><dt>Market reference</dt><dd>{rowComparison.referencePrice > 0 ? `${formatCurrency(rowComparison.referencePrice)}/kg` : 'Data unavailable'}</dd></div>
              <div><dt>Difference</dt><dd>{rowComparison.deviationPct == null ? 'Data unavailable' : `${rowComparison.deviationPct > 0 ? '+' : ''}${rowComparison.deviationPct}%`}</dd></div>
              <div><dt>Stock</dt><dd>{row.quantity} {row.unit}</dd></div>
            </dl>
            <div className="pm-review-actions">
              <Button type="button" disabled={busy} onClick={() => openReview(row, 'details')}>View details</Button>
              <Button type="button" variant="primary" disabled={busy} onClick={() => openReview(row, 'approve')}>Approve</Button>
              <Button type="button" disabled={busy} onClick={() => openReview(row, 'adjust')}>Needs adjustment</Button>
            </div>
          </article>
        );
      })}
    </div>
    <Modal open={Boolean(selected)} onClose={close} title={action === 'approve' ? 'Approve this selling price?' : action === 'adjust' ? 'Request price adjustment?' : 'Price review details'} className="pm-modal pm-price-review-modal" dialogLabel="Review Farmer selling price">
      {selected ? <form onSubmit={submit} className="pm-price-review-form">
        <div className="pm-review-product-heading">
          <div><h3>{selected.name}</h3><p className="pm-secondary">Farmer: {selected.farmerName || 'Unavailable'}{selected.location ? ` · ${selected.location}` : ''}</p></div>
          <span className="pm-review-current-status">{reviewStatusLabel(selected.priceReview.status)}</span>
        </div>
        <section className="pm-review-group" aria-labelledby="pm-review-submission-heading">
          <h4 id="pm-review-submission-heading">Farmer submission</h4>
          <dl className="pm-review-comparison">
            <div><dt>Retail price</dt><dd>{formatCurrency(selected.price)}/{selected.unit}</dd></div>
            <div><dt>Previous approved price</dt><dd>{priorApproval ? `${formatCurrency(priorApproval.approvedPrice)}/${priorApproval.reviewUnit || selected.unit}` : 'Data unavailable'}</dd></div>
            <div><dt>Submitted</dt><dd>{formatDate(selected.priceReview.submittedAt || selected.priceReview.createdAt || selected.createdAt)}</dd></div>
            {selected.unit !== 'kg' ? <div><dt>Equivalent per kg</dt><dd>{comparison.pricePerKg != null ? `${formatCurrency(comparison.pricePerKg)}/kg` : 'Data unavailable'}</dd></div> : null}
          </dl>
        </section>
        <section className="pm-review-group" aria-labelledby="pm-review-market-heading">
          <h4 id="pm-review-market-heading">Market reference</h4>
          <dl className="pm-review-comparison">
            <div><dt>{comparison.referenceSource}</dt><dd>{comparison.referencePrice > 0 ? `${formatCurrency(comparison.referencePrice)}/kg` : 'Data unavailable'}</dd></div>
            {comparison.referenceSource === 'Admin reference' && comparison.psaPrice != null ? <div><dt>PSA reference</dt><dd>{formatCurrency(comparison.psaPrice)}/kg</dd></div> : null}
            <div><dt>Difference from reference</dt><dd>{comparison.deviationPct == null ? 'Data unavailable' : `${comparison.deviationPct > 0 ? '+' : ''}${comparison.deviationPct}%`}</dd></div>
            <div><dt>Demand</dt><dd>{forecastLoading ? 'Loading…' : forecast.data?.forecastDemand || 'Data unavailable'}</dd></div>
            <div><dt>Market trend</dt><dd>{forecastLoading ? 'Loading…' : forecast.data?.forecastPrice != null && forecast.data?.expectedChangePercent != null ? forecast.data.marketTrend : 'Data unavailable'}</dd></div>
            <div><dt>Forecast period</dt><dd>{forecast.data?.periodLabel || 'Next 7 Days'}</dd></div>
          </dl>
          {comparison.possibleOverpricing ? <p className="pm-price-warning">Possible overpricing</p> : null}
          {selected.priceReview.reason ? <p className="pm-secondary">{selected.priceReview.reason}</p> : null}
          {forecast.error ? <p className="pm-forecast-error" role="status">Forecast details unavailable: {forecast.error}</p> : null}
        </section>
        {selected.priceReview.previousDecisions?.length ? (
          <section className="pm-review-group pm-price-history" aria-labelledby="pm-price-history-heading">
            <h4 id="pm-price-history-heading">Price history</h4>
            <ol>
              {selected.priceReview.previousDecisions.map((decision, index) => (
                <li key={`${decision.decidedAt || decision.status}-${index}`}>
                  <span>{decision.decidedAt ? formatDate(decision.decidedAt) : 'Date unavailable'}</span>
                  <span>{decision.status === 'needs_adjustment' ? 'Admin requested adjustment' : reviewStatusLabel(decision.status)}</span>
                  {decision.farmerPrice != null ? <span>Farmer price: {formatCurrency(decision.farmerPrice)}/{decision.reviewUnit || selected.unit}</span> : null}
                  {decision.maxAllowedPrice != null ? <span>Recommended maximum: {formatCurrency(decision.maxAllowedPrice)}/{decision.reviewUnit || selected.unit}</span> : null}
                  {decision.approvedPrice != null ? <span>Approved: {formatCurrency(decision.approvedPrice)}/{decision.reviewUnit || selected.unit}</span> : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        {action === 'adjust' ? <>
          <section className="pm-review-group pm-admin-decision" aria-labelledby="pm-review-decision-heading">
            <h4 id="pm-review-decision-heading">Admin decision</h4>
            <label htmlFor="review-max-price">Recommended / maximum acceptable price · {selected.unit}
              <input id="review-max-price" type="number" min="0.01" step="0.01" required value={maximum} disabled={busy} onChange={(event) => setMaximum(event.target.value)} />
            </label>
            <label htmlFor="review-reason">Note to Farmer
              <textarea id="review-reason" required maxLength={1000} rows={3} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} />
            </label>
          </section>
        </> : null}
        {action === 'approve' ? (
          <p className="pm-secondary">The Farmer’s submitted price of {formatCurrency(selected.price)}/{selected.unit} will become the approved selling price for this listing.</p>
        ) : null}
        {action === 'adjust' ? (
          <p className="pm-secondary">The Farmer’s submitted price will not change. They will be asked to review the recommendation and resubmit their own price.</p>
        ) : null}
        {error ? <p className="form-alert error" role="alert">{error}</p> : null}
        <div className="pm-review-dialog-actions">
          <Button type="button" disabled={busy} onClick={close}>Cancel</Button>
          {action === 'details' ? <><Button type="button" disabled={busy} onClick={() => { setAction('adjust'); setError(''); }}>Needs adjustment</Button><Button type="button" variant="primary" disabled={busy} onClick={() => { setAction('approve'); setError(''); }}>Approve</Button></> : <Button variant="primary" type="submit" disabled={busy}>{busy ? 'Saving...' : action === 'approve' ? 'Approve price' : 'Send request'}</Button>}
        </div>
      </form> : null}
    </Modal>
  </>;
}
