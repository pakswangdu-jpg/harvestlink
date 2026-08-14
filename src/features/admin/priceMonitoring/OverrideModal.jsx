import { useState } from 'react';
import Modal from '../../../components/admin/Modal';
import Button from '../../../components/admin/Button';
import Input from '../../../components/admin/Input';
import Alert from '../../../components/admin/Alert';
import { formatCurrency } from '../../../utils/formatters';

const MAX_OVERRIDE_PRICE = 999999;

// Mounted only while a commodity is being edited (see the outer wrapper below) and keyed by
// commodity id at the call site — same pattern as AdminUsers.jsx's UserDetail — so its lazy
// useState initializer seeds the price field fresh per commodity with no effect needed.
function OverrideForm({ commodity, initialPrice, onClose, onConfirm }) {
  const [price, setPrice] = useState(initialPrice != null ? String(initialPrice) : '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
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
    setSaving(true);
    setError('');
    try {
      await onConfirm(value, reason.trim());
      onClose();
    } catch (confirmError) {
      setError(confirmError.message || 'Could not save this override.');
      setSaving(false);
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
        <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--muted)]">Current PSA Price</p>
        <p className="mt-0.5 text-[14px] text-[var(--text)]">
          {commodity.referencePrice == null ? 'No data available' : `${formatCurrency(commodity.referencePrice)} / kg (${commodity.referenceYear})`}
        </p>
      </div>

      <div>
        <label className="mb-1 block text-[12px] font-medium uppercase tracking-wide text-[var(--muted)]" htmlFor="override-price-input">
          New Override Price (₱/kg)
        </label>
        <Input
          id="override-price-input"
          type="number"
          min="0.01"
          max={MAX_OVERRIDE_PRICE}
          step="0.01"
          placeholder="₱/kg"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          disabled={saving}
        />
      </div>

      <div>
        <label className="mb-1 block text-[12px] font-medium uppercase tracking-wide text-[var(--muted)]" htmlFor="override-reason-input">
          Reason <span className="text-[var(--red-700)]">*</span>
        </label>
        <textarea
          id="override-reason-input"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={saving}
          placeholder="Why is this reference price being changed?"
          className="w-full resize-none rounded-md border border-[var(--line)] bg-white px-3 py-2 text-[13px] text-[var(--text)] outline-none transition-shadow duration-150 placeholder:text-[var(--muted)] focus:border-[var(--green-800)] focus:ring-2 focus:ring-[var(--green-800)]/20"
        />
      </div>

      <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" onClick={handleConfirm} disabled={saving}>{saving ? 'Saving…' : 'Confirm'}</Button>
      </div>
    </div>
  );
}

// Thin, always-mounted wrapper — stays alive across open/close so Modal's own exit
// animation can play; only OverrideForm itself mounts/unmounts with the commodity.
// `initialPrice` seeds the New Override Price field (e.g. a draft the admin already typed in
// the row) and is deliberately separate from commodity.referencePrice, which this always
// shows, unmodified, as the real "Current PSA Price" for comparison.
export default function OverrideModal({
  commodity, initialPrice, onClose, onConfirm,
}) {
  return (
    <Modal open={Boolean(commodity)} onClose={onClose} eyebrow="DTI oversight" title="Update Reference Price">
      {commodity ? (
        <OverrideForm
          key={commodity.id}
          commodity={commodity}
          initialPrice={initialPrice}
          onClose={onClose}
          onConfirm={onConfirm}
        />
      ) : null}
    </Modal>
  );
}
