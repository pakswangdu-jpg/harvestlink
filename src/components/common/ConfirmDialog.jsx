import { AnimatePresence, motion } from 'framer-motion';
import { TriangleAlert } from 'lucide-react';
import Button from './Button';

// Generic yes/no confirmation dialog — used wherever an action needs a "are you sure"
// checkpoint before something irreversible happens (e.g. deleting a product).
export default function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', onConfirm, onCancel,
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onCancel}
        >
          <motion.div
            className="w-full max-w-sm rounded-lg border border-[var(--line)] bg-[var(--surface-elevated)] p-5 shadow-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--red-100)] text-[var(--red-700)]">
              <TriangleAlert size={20} strokeWidth={2} />
            </div>
            <h3 className="mt-3 text-[15px] font-semibold text-[var(--text)]">{title}</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--muted)]">{message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={onCancel}>Cancel</Button>
              <Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
