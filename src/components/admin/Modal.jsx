import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

// Admin-scoped slide-over — same mechanics as src/components/common/SlideOver.jsx (ESC/
// backdrop/close-button to dismiss) but compact per this section's own spacing/typography
// scale, kept separate so it never affects SlideOver's other caller (Profile.jsx).
export default function Modal({ open, onClose, eyebrow, title, children }) {
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
          className="fixed inset-0 z-50 bg-black/30"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <motion.div
            className="absolute right-0 top-0 flex h-full w-full max-w-[520px] flex-col border-l border-[#D0D7DE] bg-white"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#D0D7DE] px-5 py-4">
              <div>
                {eyebrow ? <p className="text-[11px] font-medium uppercase tracking-wide text-[#57606A]">{eyebrow}</p> : null}
                <h2 className="text-[18px] font-semibold text-[#24292F]">{title}</h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-0 bg-transparent p-0 text-[#57606A] hover:bg-[#F6F8FA] hover:text-[#24292F]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {children}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
