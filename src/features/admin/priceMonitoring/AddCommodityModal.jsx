import { useState } from 'react';
import Modal from '../../../components/admin/Modal';
import Button from '../../../components/admin/Button';
import Input from '../../../components/admin/Input';
import Alert from '../../../components/admin/Alert';
import { createCommodity } from '../../../services/marketPriceService';

export default function AddCommodityModal({ open, categories, units, onClose, onCreated }) {
  const [values, setValues] = useState({
    name: '',
    variety: '',
    category: '',
    unit: '',
    description: '',
    isActive: true,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const update = (field, value) => setValues((previous) => ({ ...previous, [field]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await createCommodity(values);
      await onCreated();
      setValues({ name: '', variety: '', category: '', unit: '', description: '', isActive: true });
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
          <Input id="commodity-name" value={values.name} onChange={(event) => update('name', event.target.value)} maxLength={100} required />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[13px] font-medium" htmlFor="commodity-variety">Variety <span className="text-[var(--muted)]">(optional)</span></label>
            <Input id="commodity-variety" value={values.variety} onChange={(event) => update('variety', event.target.value)} maxLength={100} />
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
            <select id="commodity-category" className="pm-reason-choice" value={values.category} onChange={(event) => update('category', event.target.value)} required>
              <option value="" disabled>Select category</option>
              {categories.filter((category) => category.isActive).map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium" htmlFor="commodity-unit">Unit of measurement</label>
            <select id="commodity-unit" className="pm-reason-choice" value={values.unit} onChange={(event) => update('unit', event.target.value)} required>
              <option value="" disabled>Select unit</option>
              {units.map((unit) => <option key={unit.id} value={unit.value}>{unit.name}{unit.abbreviation ? ` (${unit.abbreviation})` : ''}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[13px] font-medium" htmlFor="commodity-description">Description <span className="text-[var(--muted)]">(optional)</span></label>
          <textarea id="commodity-description" rows={3} maxLength={500} value={values.description} onChange={(event) => update('description', event.target.value)} className="w-full rounded-md border border-[var(--line)] bg-[var(--input-bg)] px-3 py-2 text-[13px] text-[var(--text)]" />
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving || !categories.length || !units.length}>{saving ? 'Saving…' : 'Add commodity'}</Button>
        </div>
      </form>
    </Modal>
  );
}
