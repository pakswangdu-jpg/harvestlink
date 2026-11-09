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

function OverrideForm({ commodity, initialPrice, units, onClose, onConfirm }) {
  const [price, setPrice] = useState(initialPrice != null ? String(initialPrice) : '');
  const [unit, setUnit] = useState(commodity.override?.unit || commodity.unit || 'kg');
  const [source, setSource] = useState(commodity.override?.source || 'admin_entered');
  const [effectiveDate, setEffectiveDate] = useState(commodity.override?.effectiveDate || localDateValue());
  const [supportingReference, setSupportingReference] = useState(commodity.override?.supportingReference || '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const handleConfirm = async () => {
    if (inFlight.current) return;
    const value = Number(price);
    if (!price || !Number.isFinite(value) || value <= 0) {
      setError('Override price must be greater than 0.');
      return;
    }
    if (value > MAX_OVERRIDE_PRICE) {
      setError(`Override price cannot exceed ${formatCurrency(MAX_OVERRIDE_PRICE)}.`);
      return;
    }
    if (!reason.trim()) {
      setError('A reason is required.');
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError('');
    try {
      await onConfirm(value, {
        commodityLabel: commodity.label,
        unit,
        source,
        effectiveDate,
        referenceYear: Number(effectiveDate.slice(0, 4)),
        supportingReference,
        reason: reason.trim(),
        baselinePrice: commodity.psaPrice,
      });
      onClose();
    } catch (confirmError) {
      setError(confirmError.message || 'Could not save this override.');
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
        <p className="text-[12px] font-medium text-[var(--muted)]">PSA reference</p>
        <p className="mt-0.5 text-[14px] text-[var(--text)]">
          {commodity.psaPrice == null ? 'No PSA data available' : `${formatCurrency(commodity.psaPrice)} / kg (PSA ${commodity.psaYear})`}
        </p>
      </div>

      <div>
        <label className="mb-1 block text-[12px] font-medium uppercase tracking-wide text-[var(--muted)]" htmlFor="override-price-input">
          New reference price
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
          <select id="override-unit" className="pm-reason-choice" value={unit} onChange={(event) => setUnit(event.target.value)} disabled={saving || commodity.isCustom}>
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
        <label className="mb-1 block text-[13px] font-medium" htmlFor="override-supporting-reference">Supporting reference <span className="text-[var(--muted)]">(optional)</span></label>
        <Input id="override-supporting-reference" value={supportingReference} onChange={(event) => setSupportingReference(event.target.value)} disabled={saving} maxLength={500} />
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
  commodity, initialPrice, units = [], onClose, onConfirm,
}) {
  const saving = useRef(false);
  const close = () => { if (!saving.current) onClose(); };
  const confirm = async (...args) => {
    saving.current = true;
    try { await onConfirm(...args); } finally { saving.current = false; }
  };
  return (
    <Modal open={Boolean(commodity)} onClose={close} title="Set manual reference price?" className="pm-modal" dialogLabel="Set manual reference price">
      {commodity ? (
        <OverrideForm
          key={commodity.id}
          commodity={commodity}
          initialPrice={initialPrice}
          units={units}
          onClose={close}
          onConfirm={confirm}
        />
      ) : null}
    </Modal>
  );
}
