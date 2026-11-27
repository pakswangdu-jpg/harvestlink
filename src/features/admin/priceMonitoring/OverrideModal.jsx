import { useRef, useState } from 'react';
import Modal from '../../../components/admin/Modal';
import Button from '../../../components/admin/Button';
import Input from '../../../components/admin/Input';
import Alert from '../../../components/admin/Alert';
import { formatCurrency } from '../../../utils/formatters';

const MAX_OVERRIDE_PRICE = 999999;




function localDateValue() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function OverrideForm({ commodity, initialMarketType = 'retail', units, onClose, onConfirm }) {
  const [marketType, setMarketType] = useState(initialMarketType === 'wholesale' ? 'wholesale' : 'retail');
  const getOverrideFor = (type) => (type === 'wholesale' ? commodity.wholesaleOverride : commodity.retailOverride);
  const currentOverride = getOverrideFor(marketType);

  const [price, setPrice] = useState(
    currentOverride?.referencePrice != null
      ? String(currentOverride.referencePrice)
      : (marketType === 'retail' && commodity.referencePrice != null ? String(commodity.referencePrice) : ''),
  );
  const [unit, setUnit] = useState(currentOverride?.unit || commodity.unit || 'kg');
  const [source, setSource] = useState(currentOverride?.source || 'admin_entered');
  const [effectiveDate, setEffectiveDate] = useState(currentOverride?.effectiveDate || localDateValue());
  const [supportingReference, setSupportingReference] = useState(currentOverride?.supportingReference || '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const handleMarketTypeChange = (nextType) => {
    setMarketType(nextType);
    const nextOverride = getOverrideFor(nextType);
    setPrice(nextOverride?.referencePrice != null ? String(nextOverride.referencePrice) : '');
    setUnit(nextOverride?.unit || commodity.unit || 'kg');
    setSource(nextOverride?.source || 'admin_entered');
    setEffectiveDate(nextOverride?.effectiveDate || localDateValue());
    setSupportingReference(nextOverride?.supportingReference || '');
    setError('');
  };

  const handleConfirm = async () => {
    if (inFlight.current) return;
    const value = Number(price);
    if (!price || !Number.isFinite(value) || value <= 0) {
      setError('Reference price must be greater than 0.');
      return;
    }
    if (value > MAX_OVERRIDE_PRICE) {
      setError(`Reference price cannot exceed ${formatCurrency(MAX_OVERRIDE_PRICE)}.`);
      return;
    }
    const trimmedSupport = supportingReference.trim();
    if (trimmedSupport.length < 10 || trimmedSupport.split(/\s+/).filter(Boolean).length < 2) {
      setError('Supporting reference is required and must include source and location details.');
      return;
    }
    if (!reason.trim()) {
      setError('An explanation is required.');
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError('');
    try {
      await onConfirm(value, {
        commodityLabel: commodity.label,
        marketType,
        unit,
        source,
        effectiveDate,
        referenceYear: Number(effectiveDate.slice(0, 4)),
        supportingReference: trimmedSupport,
        reason: reason.trim(),
        baselinePrice: marketType === 'retail' ? commodity.psaPrice : null,
      });
      onClose();
    } catch (confirmError) {
      setError(confirmError.message || 'Could not save this reference price.');
      setSaving(false);
      inFlight.current = false;
    }
  };

  return (
    <div className="space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div>
        <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--muted)]">Commodity</p>
        <p className="mt-0.5 text-[15px] font-semibold text-[var(--text)]">{commodity.label}</p>
      </div>

      <div>
        <label className="mb-1 block text-[13px] font-medium" htmlFor="override-market-type">Market Type</label>
        <select
          id="override-market-type"
          className="pm-reason-choice"
          value={marketType}
          onChange={(event) => handleMarketTypeChange(event.target.value)}
          disabled={saving}
        >
          <option value="retail">Retail</option>
          <option value="wholesale">Wholesale</option>
        </select>
      </div>

      <div>
        <p className="text-[12px] font-medium text-[var(--muted)]">PSA reference</p>
        <p className="mt-0.5 text-[14px] text-[var(--text)]">
          {commodity.psaPrice == null ? 'No PSA data available' : `${formatCurrency(commodity.psaPrice)} / kg (PSA ${commodity.psaYear})`}
        </p>
      </div>

      <div>
        <label className="mb-1 block text-[12px] font-medium uppercase tracking-wide text-[var(--muted)]" htmlFor="override-price-input">
          New {marketType} reference price (PHP)
        </label>
        <Input
          id="override-price-input"
          type="number"
          min="0.01"
          max={MAX_OVERRIDE_PRICE}
          step="0.01"
          placeholder="PHP"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          disabled={saving}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[13px] font-medium" htmlFor="override-unit">Unit</label>
          <select id="override-unit" className="pm-reason-choice" value={unit} onChange={(event) => setUnit(event.target.value)} disabled={saving}>
            {units.map((option) => <option key={option.id} value={option.value}>{option.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[13px] font-medium" htmlFor="override-source">Price source</label>
          <select id="override-source" className="pm-reason-choice" value={source} onChange={(event) => setSource(event.target.value)} disabled={saving}>
            <option value="admin_entered">Admin-entered</option>
            <option value="verified_local_market">Verified local market survey</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-[13px] font-medium" htmlFor="override-effective-date">Effective date</label>
          <Input id="override-effective-date" type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} disabled={saving} required />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[13px] font-medium" htmlFor="override-supporting-reference">
          Supporting reference <span className="text-[var(--red-700)]">*</span>
        </label>
        <Input
          id="override-supporting-reference"
          value={supportingReference}
          onChange={(event) => setSupportingReference(event.target.value)}
          disabled={saving}
          maxLength={500}
          placeholder="Market location, source agency, and survey date"
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-[12px] font-medium uppercase tracking-wide text-[var(--muted)]" htmlFor="override-reason-input">
          Explanation <span className="text-[var(--red-700)]">*</span>
        </label>
        <textarea
          id="override-reason-input"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={saving}
          placeholder="How was this reference price determined?"
          className="w-full resize-none rounded-md border border-[var(--line)] bg-[var(--input-bg)] px-3 py-2 text-[13px] text-[var(--text)] outline-none transition-shadow duration-150 placeholder:text-[var(--muted)] focus:border-[var(--green-800)] focus:ring-2 focus:ring-[var(--green-800)]/20"
        />
      </div>

      <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" onClick={handleConfirm} disabled={saving}>{saving ? 'Saving...' : 'Save reference price'}</Button>
      </div>
    </div>
  );
}

export default function OverrideModal({
  commodity, initialMarketType = 'retail', units = [], onClose, onConfirm,
}) {
  const saving = useRef(false);
  const close = () => { if (!saving.current) onClose(); };
  const confirm = async (...args) => {
    saving.current = true;
    try { await onConfirm(...args); } finally { saving.current = false; }
  };
  return (
    <Modal open={Boolean(commodity)} onClose={close} title="Set reference price" className="pm-modal" dialogLabel="Set reference price">
      {commodity ? (
        <OverrideForm
          key={`${commodity.id}-${initialMarketType}`}
          commodity={commodity}
          initialMarketType={initialMarketType}
          units={units}
          onClose={close}
          onConfirm={confirm}
        />
      ) : null}
    </Modal>
  );
}
