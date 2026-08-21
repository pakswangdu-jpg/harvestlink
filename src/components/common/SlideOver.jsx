import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

// Generic right-side slide-over — same shell as ProductDrawer (backdrop, slide from right,
// ESC/outside-click/close-button to dismiss) but with no form footer, for panels that just
// show details/actions rather than collect input.
export default function SlideOver({ open, onClose, eyebrow, title, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 bg-gray-900/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className="absolute right-0 top-0 flex h-full w-full max-w-[520px] flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--surface-elevated)]"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.2, ease: 'easeOut' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4">
              <div>
                {eyebrow ? <p className="text-[12px] font-semibold uppercase tracking-widest text-[var(--muted)]">{eyebrow}</p> : null}
                <h2 className="text-[18px] font-semibold text-[var(--text)]">{title}</h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-[var(--muted)] transition-colors duration-150 hover:bg-[var(--soft)] hover:text-[var(--text)]"
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              {children}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
