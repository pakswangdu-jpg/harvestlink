import { useState } from 'react';
import Modal from '../../../components/admin/Modal';
import Button from '../../../components/admin/Button';
import Input from '../../../components/admin/Input';
import Alert from '../../../components/admin/Alert';
import Select from '../../../components/admin/Select';
import { formatCurrency } from '../../../utils/formatters';

const MAX_OVERRIDE_PRICE = 999999;

// nonce forces a fresh mount (and therefore fresh form state) every time the parent opens
// this for a new bulk action — same remount-via-key pattern as OverrideModal, needed here
// because "reopen with the same selection" has no other value that naturally changes.
function BulkUpdateForm({ rows, onClose, onConfirm }) {
  const [mode, setMode] = useState('fixed');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const handleConfirm = async () => {
    const numeric = Number(value);
    if (!value || !Number.isFinite(numeric)) {
      setError(mode === 'fixed' ? 'Override price must be greater than 0.' : 'Enter a percentage adjustment.');
      return;
    }
    if (mode === 'fixed' && (numeric <= 0 || numeric > MAX_OVERRIDE_PRICE)) {
      setError(`Override price must be greater than 0 and no more than ${formatCurrency(MAX_OVERRIDE_PRICE)}.`);
      return;
    }
    if (!reason.trim()) {
      setError('A reason is required.');
      return;
    }
    setSaving(true);
    setError('');
    let succeeded = 0;
    let failed = 0;
    for (const row of rows) {
      const nextPrice = mode === 'fixed'
        ? numeric
        : Number(((row.referencePrice || 0) * (1 + numeric / 100)).toFixed(2));
      if (!Number.isFinite(nextPrice) || nextPrice <= 0 || nextPrice > MAX_OVERRIDE_PRICE) {
        failed += 1;
        continue;
      }
      try {
        await onConfirm(row, nextPrice, reason.trim());
        succeeded += 1;
      } catch {
        failed += 1;
      }
    }
    setSaving(false);
    setResult({ succeeded, failed });
    if (failed === 0) setTimeout(onClose, 900);
  };

  return (
    <div className="space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {result ? (
        <Alert tone={result.failed ? 'danger' : 'success'}>
          Updated {result.succeeded} of {rows.length} commodities{result.failed ? ` — ${result.failed} failed.` : '.'}
        </Alert>
      ) : null}

      <div>
        <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--muted)]">Selected commodities</p>
        <p className="mt-0.5 text-[14px] text-[var(--text)]">{rows.map((row) => row.label).join(', ')}</p>
      </div>

      <div>
        <p className="mb-1 text-[12px] font-medium uppercase tracking-wide text-[var(--muted)]">Adjustment type</p>
        <Select value={mode} onChange={(event) => setMode(event.target.value)} disabled={saving}>
          <option value="fixed">Set fixed override price (₱/kg)</option>
          <option value="percent">Adjust by percentage from current price</option>
        </Select>
      </div>

      <div>
        <label className="mb-1 block text-[12px] font-medium uppercase tracking-wide text-[var(--muted)]" htmlFor="bulk-value-input">
          {mode === 'fixed' ? 'Override price (₱/kg)' : 'Percentage adjustment (%)'}
        </label>
        <Input
          id="bulk-value-input"
          type="number"
          step="0.01"
          placeholder={mode === 'fixed' ? '₱/kg' : 'e.g. 5 or -10'}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={saving}
        />
      </div>

      <div>
        <label className="mb-1 block text-[12px] font-medium uppercase tracking-wide text-[var(--muted)]" htmlFor="bulk-reason-input">
          Reason <span className="text-[var(--red-700)]">*</span>
        </label>
        <textarea
          id="bulk-reason-input"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={saving}
          placeholder="Why are these reference prices being changed?"
          className="w-full resize-none rounded-md border border-[var(--line)] bg-white px-3 py-2 text-[13px] text-[var(--text)] outline-none transition-shadow duration-150 placeholder:text-[var(--muted)] focus:border-[var(--green-800)] focus:ring-2 focus:ring-[var(--green-800)]/20"
        />
      </div>

      <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" onClick={handleConfirm} disabled={saving}>{saving ? 'Updating…' : 'Confirm'}</Button>
      </div>
    </div>
  );
}

export default function BulkUpdateModal({
  open, nonce, rows, onClose, onConfirm,
}) {
  return (
    <Modal open={open} onClose={onClose} eyebrow="DTI oversight" title="Bulk Update Reference Prices">
      {open ? (
        <BulkUpdateForm key={nonce} rows={rows} onClose={onClose} onConfirm={onConfirm} />
      ) : null}
    </Modal>
  );
}
