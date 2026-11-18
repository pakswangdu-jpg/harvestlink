import { useMemo, useState } from 'react';
import Modal from '../../../components/admin/Modal';
import Button from '../../../components/admin/Button';
import Input from '../../../components/admin/Input';
import Alert from '../../../components/admin/Alert';
import { formatCurrency } from '../../../utils/formatters';

function localDateValue() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function AddReferencePriceModal({
  open, rows, onClose, onConfirm,
}) {
  const [commodityId, setCommodityId] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('');
  const [source, setSource] = useState('admin_entered');
  const [effectiveDate, setEffectiveDate] = useState(localDateValue);
  const [supportingReference, setSupportingReference] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const commodity = useMemo(() => rows.find((row) => row.id === commodityId) || null, [rows, commodityId]);

  const selectCommodity = (id) => {
    setCommodityId(id);
    const selected = rows.find((row) => row.id === id);
    if (selected) setUnit(selected.unit || 'kg');
  };

  const submit = async (event) => {
    event.preventDefault();
    const amount = Number(price);
    const selectedCommodity = commodity;
    if (!selectedCommodity) {
      setError('Choose a commodity.');
      return;
    }
    if (!unit.trim() || unit.trim().length > 30 || !/[\p{L}\p{N}]/u.test(unit)) {
      setError('Enter a valid unit of measurement (up to 30 characters).');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999999) {
      setError('Enter a price greater than ₱0 and no more than ₱999,999.');
      return;
    }
    if (!reason.trim()) {
      setError('Add a short explanation for this price.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onConfirm(selectedCommodity, amount, {
        unit: selectedCommodity.unit,
        customUnit: false,
        source,
        effectiveDate,
        referenceYear: Number(effectiveDate.slice(0, 4)),
        supportingReference,
        reason,
        commodityLabel: selectedCommodity.label,
        baselinePrice: selectedCommodity.psaPrice ?? null,
      });
      setCommodityId('');
      setPrice('');
      setReason('');
      setSupportingReference('');
      onClose();
    } catch (submitError) {
      setError(submitError.message || 'Could not save this reference price.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add reference price" dialogLabel="Add reference price">
      <form className="space-y-4" onSubmit={submit}>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div>
          <label className="mb-1 block text-[13px] font-medium" htmlFor="reference-commodity">Commodity</label>
          <select id="reference-commodity" className="pm-reason-choice" value={commodityId} onChange={(event) => selectCommodity(event.target.value)} required>
            <option value="" disabled>Select a commodity</option>
            {rows.map((row) => <option key={row.id} value={row.id}>{row.label} · Added by admin</option>)}
          </select>
          {!rows.length ? (
            <p className="mt-1 text-[12px] text-[var(--muted)]">Add a commodity first, then set its reference price here.</p>
          ) : commodity?.psaPrice == null ? (
            <p className="mt-1 text-[12px] text-[var(--muted)]">PSA reference: No data available</p>
          ) : <p className="mt-1 text-[12px] text-[var(--muted)]">PSA reference: {formatCurrency(commodity.psaPrice)}/kg</p>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[13px] font-medium" htmlFor="reference-price">Reference price (PHP)</label>
            <Input id="reference-price" type="number" min="0.01" max="999999" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium" htmlFor="reference-unit">Registered commodity unit</label>
            <Input
              id="reference-unit"
              value={unit}
              aria-label="Reference price unit"
              required
              readOnly
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[13px] font-medium" htmlFor="reference-source">Price source</label>
            <select id="reference-source" className="pm-reason-choice" value={source} onChange={(event) => setSource(event.target.value)}>
              <option value="admin_entered">Admin-entered</option>
              <option value="verified_local_market">Verified local market survey</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium" htmlFor="reference-effective-date">Effective date</label>
            <Input id="reference-effective-date" type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} required />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[13px] font-medium" htmlFor="reference-support">Supporting reference <span className="text-[var(--muted)]">(optional)</span></label>
          <Input id="reference-support" value={supportingReference} onChange={(event) => setSupportingReference(event.target.value)} maxLength={500} placeholder="Survey date, location, or source details" />
        </div>
        <div>
          <label className="mb-1 block text-[13px] font-medium" htmlFor="reference-reason">Explanation</label>
          <textarea id="reference-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required className="w-full rounded-md border border-[var(--line)] bg-[var(--input-bg)] px-3 py-2 text-[13px] text-[var(--text)]" />
        </div>
        <p className="text-[12px] text-[var(--muted)]">This reference guides farmer recommendations; it does not change existing listing prices or set a government price ceiling.</p>
        <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving || !rows.length}>{saving ? 'Saving…' : 'Save reference price'}</Button>
        </div>
      </form>
    </Modal>
  );
}
