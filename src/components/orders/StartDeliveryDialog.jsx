import { useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Truck } from 'lucide-react';
import Button from '../common/Button';
import './StartDeliveryDialog.css';

export default function StartDeliveryDialog({ open, onCancel, onConfirm, isSubmitting = false }) {
  const [plateNumber, setPlateNumber] = useState('');
  const titleId = useId();
  const descriptionId = useId();
  const plateId = useId();
  const hintId = useId();

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
          className="start-delivery-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={isSubmitting ? undefined : handleCancel}
        >
          <motion.form
            className="start-delivery-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            aria-busy={isSubmitting}
            tabIndex={-1}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            onClick={(event) => event.stopPropagation()}
            onSubmit={handleSubmit}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !isSubmitting) {
                event.preventDefault();
                event.stopPropagation();
                handleCancel();
              }
              if (event.key !== 'Tab') return;
              const form = event.currentTarget;
              const controls = [...form.querySelectorAll('input:not(:disabled), button:not(:disabled)')];
              const first = controls[0];
              const last = controls.at(-1);
              if (!first) {
                event.preventDefault();
                form.focus();
              } else if (event.shiftKey && (document.activeElement === first || document.activeElement === form)) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === form)) {
                event.preventDefault();
                first.focus();
              }
            }}
          >
            <div className="start-delivery-heading">
              <Truck size={20} aria-hidden="true" />
              <h2 id={titleId}>Start delivery</h2>
            </div>
            <p id={descriptionId} className="start-delivery-description">
              Add your vehicle plate so the buyer can identify your delivery.
            </p>
            <label className="start-delivery-label" htmlFor={plateId}>
              Vehicle plate number <span aria-hidden="true">*</span>
            </label>
            <input
              id={plateId}
              className="start-delivery-plate"
              aria-describedby={hintId}
              value={plateNumber}
              onChange={(event) => setPlateNumber(event.target.value)}
              placeholder="e.g. ABC 1234"
              autoComplete="off"
              maxLength={15}
              pattern="[A-Za-z0-9 \-]+"
              title="Use letters, numbers, spaces, or hyphens only."
              required
              autoFocus
              disabled={isSubmitting}
            />
            <p id={hintId} className="start-delivery-hint">
              Use the plate exactly as it appears on your vehicle.
            </p>
            <div className="start-delivery-actions">
              <Button type="button" variant="secondary" onClick={handleCancel} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" disabled={!plateNumber.trim() || isSubmitting}>
                {isSubmitting ? 'Starting…' : 'Start delivery'}
              </Button>
            </div>
          </motion.form>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
