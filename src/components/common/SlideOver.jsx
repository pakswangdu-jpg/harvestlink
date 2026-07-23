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
            className="absolute right-0 top-0 flex h-full w-full max-w-[720px] flex-col overflow-hidden rounded-l-2xl bg-white shadow-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3, ease: 'easeOut' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-8 py-6">
              <div>
                {eyebrow ? <p className="text-[12px] font-semibold uppercase tracking-widest text-gray-500">{eyebrow}</p> : null}
                <h2 className="text-[24px] font-bold text-gray-900">{title}</h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-gray-50 text-gray-500 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-900"
              >
                <X size={20} strokeWidth={2} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-8">
              {children}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
