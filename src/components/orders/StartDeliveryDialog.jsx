import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Truck } from 'lucide-react';
import Button from '../common/Button';

export default function StartDeliveryDialog({ open, onCancel, onConfirm, isSubmitting = false }) {
  const [plateNumber, setPlateNumber] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    const normalizedPlate = plateNumber.trim().toUpperCase();
    if (!normalizedPlate || isSubmitting) return;
    setPlateNumber('');
    onConfirm(normalizedPlate);
  };

  const handleCancel = () => {
    setPlateNumber('');
    onCancel();
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={isSubmitting ? undefined : handleCancel}
        >
          <motion.form
            className="w-full max-w-sm rounded-lg border border-[var(--line)] bg-[var(--surface-elevated)] p-5 shadow-lg"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            onClick={(event) => event.stopPropagation()}
            onSubmit={handleSubmit}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--green-50)] text-[var(--green-700)]">
              <Truck size={20} aria-hidden="true" />
            </div>
            <h2 className="mt-3 text-[17px] font-semibold text-[var(--text)]">Start delivery</h2>
            <p className="mt-1 text-[14px] leading-relaxed text-[var(--muted)]">
              Enter the plate number of the vehicle you will use for this delivery.
            </p>
            <label className="mt-4 block text-[14px] font-medium text-[var(--text)]" htmlFor="delivery-plate-number">
              Vehicle plate number <span aria-hidden="true">*</span>
            </label>
            <input
              id="delivery-plate-number"
              className="mt-1.5 h-11 w-full rounded-md border border-[var(--line)] bg-[var(--input-bg)] px-3 text-[15px] font-medium uppercase text-[var(--text)] outline-none focus:border-[var(--green-700)] focus:ring-2 focus:ring-[var(--green-700)]/20"
              value={plateNumber}
              onChange={(event) => setPlateNumber(event.target.value)}
              placeholder="e.g. ABC 1234"
              autoComplete="off"
              maxLength={15}
              pattern="[A-Za-z0-9 -]+"
              title="Use letters, numbers, spaces, or hyphens only."
              required
              autoFocus
              disabled={isSubmitting}
            />
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">
              Enter the plate number the buyer should look for.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={handleCancel} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" disabled={!plateNumber.trim() || isSubmitting}>
                {isSubmitting ? 'Starting…' : 'Start Delivery'}
              </Button>
            </div>
          </motion.form>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
