import { useMemo, useState } from 'react';
import Modal from '../../../components/admin/Modal';
import Button from '../../../components/admin/Button';
import Input from '../../../components/admin/Input';
import Alert from '../../../components/admin/Alert';
import { createCommodity } from '../../../services/marketPriceService';

function capitalizeFirstLetter(value) {
  const text = String(value || '');
  const firstNonSpace = text.search(/\S/);
  if (firstNonSpace === -1) return text;
  return text.slice(0, firstNonSpace) + text.charAt(firstNonSpace).toUpperCase() + text.slice(firstNonSpace + 1);
}

const INITIAL_VALUES = {
  name: '',
  variety: '',
  category: '',
  customCategory: '',
  unit: '',
  description: '',
  isActive: true,
};

export default function AddCommodityModal({ open, categories, units, onClose, onCreated }) {
  const [values, setValues] = useState(INITIAL_VALUES);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isOtherCategory = values.category.trim().toLowerCase() === 'others';

  const organizedCategories = useMemo(
    () => categories
      .filter((category) => category.isActive)
      .slice()
      .sort((a, b) => {
        const aIsOthers = a.name.trim().toLowerCase() === 'others';
        const bIsOthers = b.name.trim().toLowerCase() === 'others';
        if (aIsOthers && !bIsOthers) return 1;
        if (!aIsOthers && bIsOthers) return -1;
        return a.name.localeCompare(b.name);
      }),
    [categories],
  );

  const organizedUnits = useMemo(
    () => units.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [units],
  );

  const update = (field, value) => setValues((previous) => ({ ...previous, [field]: value }));
  const updateCapitalized = (field, value) => update(field, capitalizeFirstLetter(value));

  const handleCategoryChange = (nextCategory) => {
    setValues((previous) => ({
      ...previous,
      category: nextCategory,
      customCategory: nextCategory.trim().toLowerCase() === 'others' ? previous.customCategory : '',
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    const customCategory = capitalizeFirstLetter(values.customCategory.trim().replace(/\s+/g, ' '));
    if (isOtherCategory && !customCategory) {
      setError('Enter a custom category name.');
      return;
    }
    setSaving(true);
    try {
      const createdName = capitalizeFirstLetter(values.name.trim().replace(/\s+/g, ' '));
      const payload = {
        ...values,
        name: createdName,
        variety: capitalizeFirstLetter(values.variety.trim().replace(/\s+/g, ' ')),
        customCategory: isOtherCategory ? customCategory : '',
        description: capitalizeFirstLetter(values.description.trim()),
      };
      await createCommodity(payload);
      await onCreated(createdName);
      setValues(INITIAL_VALUES);
    } catch (submitError) {
      setError(submitError.message || 'Could not add this commodity.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add commodity" dialogLabel="Add commodity">
      <form className="space-y-4" onSubmit={handleSubmit}>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div>
          <label className="mb-1 block text-[13px] font-medium" htmlFor="commodity-name">Commodity name</label>
          <Input id="commodity-name" value={values.name} onChange={(event) => updateCapitalized('name', event.target.value)} maxLength={100} required />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[13px] font-medium" htmlFor="commodity-variety">Variety <span className="text-[var(--muted)]">(optional)</span></label>
            <Input id="commodity-variety" value={values.variety} onChange={(event) => updateCapitalized('variety', event.target.value)} maxLength={100} />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium" htmlFor="commodity-status">Status</label>
            <select id="commodity-status" className="pm-reason-choice" value={values.isActive ? 'active' : 'inactive'} onChange={(event) => update('isActive', event.target.value === 'active')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[13px] font-medium" htmlFor="commodity-category">Category</label>
            <select id="commodity-category" className="pm-reason-choice" value={values.category} onChange={(event) => handleCategoryChange(event.target.value)} required>
              <option value="" disabled>Select category</option>
              {organizedCategories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium" htmlFor="commodity-unit">Unit of measurement</label>
            <select id="commodity-unit" className="pm-reason-choice" value={values.unit} onChange={(event) => update('unit', event.target.value)} required>
              <option value="" disabled>Select unit</option>
              {organizedUnits.map((unit) => <option key={unit.id} value={unit.value}>{unit.name}{unit.abbreviation ? ` (${unit.abbreviation})` : ''}</option>)}
            </select>
          </div>
        </div>
        {isOtherCategory ? (
          <div>
            <label className="mb-1 block text-[13px] font-medium" htmlFor="commodity-custom-category">Custom category</label>
            <Input
              id="commodity-custom-category"
              value={values.customCategory}
              onChange={(event) => updateCapitalized('customCategory', event.target.value)}
              placeholder="Enter custom category"
              maxLength={80}
              required
            />
          </div>
        ) : null}
        <div>
          <label className="mb-1 block text-[13px] font-medium" htmlFor="commodity-description">Description <span className="text-[var(--muted)]">(optional)</span></label>
          <textarea id="commodity-description" rows={3} maxLength={500} value={values.description} onChange={(event) => updateCapitalized('description', event.target.value)} className="w-full rounded-md border border-[var(--line)] bg-[var(--input-bg)] px-3 py-2 text-[13px] text-[var(--text)]" />
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving || !organizedCategories.length || !organizedUnits.length}>{saving ? 'Saving…' : 'Add commodity'}</Button>
        </div>
      </form>
    </Modal>
  );
}
