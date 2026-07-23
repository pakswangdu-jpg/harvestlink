import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import ProductForm from '../forms/ProductForm';
import Button from '../common/Button';

const FORM_ID = 'product-drawer-form';

// Right-side slide-over — the background page stays mounted and visible behind a
// translucent backdrop (never a full-page navigation), per the "no permanently visible
// form" redesign: Add/Edit both open this same drawer instead of a separate route.
export default function ProductDrawer({
  open, product, currentUser, onSubmit, onClose, onApplyDiscount, onRemoveDiscount,
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

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
            className="absolute right-0 top-0 flex h-full w-full max-w-[700px] flex-col bg-white shadow-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3, ease: 'easeOut' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                  {product ? 'Edit listing' : 'New listing'}
                </p>
                <h2 className="text-[20px] font-semibold text-gray-900">{product ? 'Edit product' : 'Add product'}</h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-lg border-0 bg-transparent text-gray-400 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={20} strokeWidth={2} />
              </button>
            </div>

            <div className="product-drawer-body flex-1 overflow-y-auto px-6 py-6">
              <ProductForm
                key={product?.id || 'new-product'}
                product={product}
                currentUser={currentUser}
                onSubmit={onSubmit}
                formId={FORM_ID}
                hideActions
                onSubmittingChange={setIsSubmitting}
                onApplyDiscount={onApplyDiscount}
                onRemoveDiscount={onRemoveDiscount}
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t border-gray-100 px-6 py-4">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button type="submit" form={FORM_ID} disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : 'Save Product'}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
