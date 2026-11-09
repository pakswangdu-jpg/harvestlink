import { useMemo, useState } from 'react';
import Modal from '../../../components/admin/Modal';
import Button from '../../../components/admin/Button';
import Input from '../../../components/admin/Input';
import Alert from '../../../components/admin/Alert';
import { formatCurrency } from '../../../utils/formatters';
import { createUnit } from '../../../services/catalogService';
import { createCommodity } from '../../../services/marketPriceService';

const OTHER_COMMODITY = '__other__';

function localDateValue() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function AddReferencePriceModal({
  open, rows, categories, units, unitsLoading, catalogError, onClose, onConfirm,
}) {
  const [commodityId, setCommodityId] = useState('');
  const [otherCommodityName, setOtherCommodityName] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('');
  const [source, setSource] = useState('admin_entered');
  const [effectiveDate, setEffectiveDate] = useState(localDateValue);
  const [supportingReference, setSupportingReference] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const commodity = useMemo(() => rows.find((row) => row.id === commodityId) || null, [rows, commodityId]);
  const isOtherCommodity = commodityId === OTHER_COMMODITY;

  const selectCommodity = (id) => {
    setCommodityId(id);
    const selected = rows.find((row) => row.id === id);
    if (selected) setUnit(selected.unit || 'kg');
    else if (id === OTHER_COMMODITY) setUnit('kg');
  };

  const updateOtherCommodityName = (value) => {
    setOtherCommodityName(value);
    const normalizedName = value.trim().replace(/\s+/g, ' ').toLowerCase();
    const existing = rows.find((row) => row.label.toLowerCase() === normalizedName);
    if (existing) setUnit(existing.unit || 'kg');
  };

  const submit = async (event) => {
    event.preventDefault();
    const amount = Number(price);
    let selectedCommodity = commodity;
    const enteredName = otherCommodityName.trim().replace(/\s+/g, ' ');
    if (isOtherCommodity) {
      if (!enteredName || enteredName.length > 100) {
        setError('Enter a commodity name (up to 100 characters).');
        return;
      }
      selectedCommodity = rows.find((row) => row.label.trim().toLowerCase() === enteredName.toLowerCase()) || null;
    }
    if (!selectedCommodity && !isOtherCommodity) {
      setError('Choose a commodity.');
      return;
    }
    if (selectedCommodity?.isCustom && selectedCommodity.unit.toLowerCase() !== unit.trim().toLowerCase()) {
      setError(`This registered commodity uses ${selectedCommodity.unit}. Use that unit for its reference price.`);
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
      let normalizedUnit = unit.trim();
      const savedUnit = units.find((option) => option.value.toLowerCase() === normalizedUnit.toLowerCase()
        || option.name.toLowerCase() === normalizedUnit.toLowerCase());
      if (savedUnit) normalizedUnit = savedUnit.value;
      else {
        const createdUnit = await createUnit({ name: normalizedUnit, abbreviation: normalizedUnit.toLowerCase() });
        normalizedUnit = createdUnit.value;
      }

      if (isOtherCommodity && !selectedCommodity) {
        const category = categories.find((entry) => entry.isActive && entry.name.toLowerCase() === 'others');
        if (!category) throw new Error('The active “Others” category is unavailable. Refresh the catalog and try again.');
        selectedCommodity = await createCommodity({
          name: enteredName,
          category: category.name,
          unit: normalizedUnit,
          isActive: true,
        });
      }

      await onConfirm(selectedCommodity, amount, {
        unit: normalizedUnit,
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
      setOtherCommodityName('');
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
            {rows.map((row) => <option key={row.id} value={row.id}>{row.label}{row.isCustom ? ' · Added by admin' : ''}</option>)}
            <option value={OTHER_COMMODITY}>Others — type a commodity</option>
          </select>
          {isOtherCommodity ? (
            <Input
              id="reference-other-commodity"
              value={otherCommodityName}
              onChange={(event) => updateOtherCommodityName(event.target.value)}
              maxLength={100}
              placeholder="Type the specific commodity name"
              aria-label="Specific commodity name"
              required
            />
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
            <label className="mb-1 block text-[13px] font-medium" htmlFor="reference-unit">Unit</label>
            <Input
              id="reference-unit"
              list="reference-unit-options"
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              maxLength={30}
              placeholder={unitsLoading ? 'Loading saved units…' : 'Type or select a unit'}
              aria-label="Reference price unit"
              required
              disabled={unitsLoading}
            />
            <datalist id="reference-unit-options">
              {units.map((option) => <option key={option.id} value={option.value}>{option.name}</option>)}
            </datalist>
            {!unitsLoading && !units.length ? (
              <p className="mt-1 text-[12px] text-[var(--danger)]" role="alert">
                {catalogError
                  ? `The unit catalog could not be loaded: ${catalogError}`
                  : 'No saved units are available. A custom unit can still be entered.'}
              </p>
            ) : null}
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
          <Button type="submit" variant="primary" disabled={saving || unitsLoading}>{saving ? 'Saving…' : 'Save reference price'}</Button>
        </div>
      </form>
    </Modal>
  );
}
