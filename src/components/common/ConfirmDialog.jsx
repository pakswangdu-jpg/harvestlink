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
            className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-6 shadow-xl"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-700">
              <TriangleAlert size={22} strokeWidth={2} />
            </div>
            <h3 className="mt-4 text-[16px] font-semibold text-gray-900">{title}</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-gray-500">{message}</p>
            <div className="mt-6 flex justify-end gap-2.5">
              <Button variant="secondary" onClick={onCancel}>Cancel</Button>
              <Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
