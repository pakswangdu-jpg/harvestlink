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
  open, rows, units = [], onClose, onConfirm,
}) {
  const [commodityId, setCommodityId] = useState('');
  const [marketType, setMarketType] = useState('retail');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('kg');
  const [source, setSource] = useState('admin_entered');
  const [effectiveDate, setEffectiveDate] = useState(localDateValue);
  const [supportingReference, setSupportingReference] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const commodity = useMemo(() => rows.find((row) => row.id === commodityId) || null, [rows, commodityId]);

  const unitOptions = useMemo(() => {
    const list = units.map((entry) => ({
      value: entry.value || entry.abbreviation || entry.name,
      label: entry.name || entry.value,
    })).filter((entry) => entry.value);
    if (unit && !list.some((entry) => entry.value.toLowerCase() === unit.toLowerCase())) {
      list.unshift({ value: unit, label: unit });
    }
    return list.length ? list : [{ value: 'kg', label: 'kg' }];
  }, [units, unit]);

  const activeOverrideForMarket = commodity
    ? (marketType === 'wholesale' ? commodity.wholesaleOverride : commodity.retailOverride)
    : null;

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
    if (marketType !== 'retail' && marketType !== 'wholesale') {
      setError('Choose a valid market type (Retail or Wholesale).');
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
    const trimmedSupport = supportingReference.trim();
    if (trimmedSupport.length < 10 || trimmedSupport.split(/\s+/).filter(Boolean).length < 2) {
      setError('Supporting reference is required and must include source and location details (e.g. market name and survey date).');
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
        marketType,
        unit: unit.trim() || selectedCommodity.unit || 'kg',
        customUnit: false,
        source,
        effectiveDate,
        referenceYear: Number(effectiveDate.slice(0, 4)),
        supportingReference: trimmedSupport,
        reason: reason.trim(),
        commodityLabel: selectedCommodity.label,
        baselinePrice: marketType === 'retail' ? (selectedCommodity.psaPrice ?? null) : null,
      });
      setCommodityId('');
      setMarketType('retail');
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
            {rows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label} · {row.isCustom
                  ? 'Added by admin'
                  : row.psaPrice != null
                    ? `Market Insights (${formatCurrency(row.psaPrice)}/${row.unit || 'kg'})`
                    : 'Market Insights (PSA)'}
              </option>
            ))}
          </select>
          {!rows.length ? (
            <p className="mt-1 text-[12px] text-[var(--muted)]">Add a commodity first, then set its reference price here.</p>
          ) : commodity ? (
            <p className="mt-1 text-[12px] text-[var(--muted)]">
              {commodity.psaPrice != null
                ? `PSA: ${formatCurrency(commodity.psaPrice)}/${commodity.unit || 'kg'}${commodity.psaYear ? ` (${commodity.psaYear})` : ''}`
                : 'PSA: No data'}
              {activeOverrideForMarket?.isActive && activeOverrideForMarket?.referencePrice != null
                ? ` · Current ${marketType} reference: ${formatCurrency(activeOverrideForMarket.referencePrice)}/${activeOverrideForMarket.unit || commodity.unit || 'kg'}`
                : ` · Current ${marketType} reference: Not set`}
            </p>
          ) : null}
        </div>
        <div>
          <label className="mb-1 block text-[13px] font-medium" htmlFor="reference-market-type">Market Type</label>
          <select
            id="reference-market-type"
            className="pm-reason-choice"
            value={marketType}
            onChange={(event) => setMarketType(event.target.value)}
            required
          >
            <option value="retail">Retail</option>
            <option value="wholesale">Wholesale</option>
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[13px] font-medium" htmlFor="reference-price">Reference price (PHP)</label>
            <Input id="reference-price" type="number" min="0.01" max="999999" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium" htmlFor="reference-unit">Registered commodity unit</label>
            <select
              id="reference-unit"
              className="pm-reason-choice"
              value={unit}
              aria-label="Reference price unit"
              onChange={(event) => setUnit(event.target.value)}
              disabled={saving}
              required
            >
              {unitOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
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
          <label className="mb-1 block text-[13px] font-medium" htmlFor="reference-support">
            Supporting reference <span className="text-[var(--red-700)]">*</span>
          </label>
          <Input
            id="reference-support"
            value={supportingReference}
            onChange={(event) => setSupportingReference(event.target.value)}
            maxLength={500}
            required
            placeholder="Market location, source agency, and survey date (e.g. Carbon Public Market, Cebu City)"
          />
        </div>
        <div>
          <label className="mb-1 block text-[13px] font-medium" htmlFor="reference-reason">
            Explanation <span className="text-[var(--red-700)]">*</span>
          </label>
          <textarea id="reference-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required className="w-full rounded-md border border-[var(--line)] bg-[var(--input-bg)] px-3 py-2 text-[13px] text-[var(--text)]" />
        </div>
        <p className="text-[12px] text-[var(--muted)]">This reference guides farmer recommendations; it does not change existing listing prices.</p>
        <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving || !rows.length}>{saving ? 'Saving…' : 'Save reference price'}</Button>
        </div>
      </form>
    </Modal>
  );
}
