import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PackageCheck, X } from 'lucide-react';
import ProductForm from '../forms/ProductForm';
import Button from '../common/Button';
import { removeStorage } from '../../services/storageService';
import { useToast } from '../../contexts/ToastContext';

const FORM_ID = 'product-drawer-form';




export default function ProductDrawer({
  open, product, currentUser, onSubmit, onClose, onApplyDiscount, onRemoveDiscount,
}) {
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const draftStorageKey = !product && currentUser?.id
    ? `harvestlink:product-draft:${currentUser.id}`
    : null;

  const handleFormSubmit = (values) => {
    if (product) {
      onSubmit(values);
      return;
    }
    setPendingValues(values);
    setIsConfirmationOpen(true);
  };

  const closeConfirmation = useCallback(() => {
    if (isSaving) return;
    setIsConfirmationOpen(false);
    setPendingValues(null);
  }, [isSaving]);

  const confirmSave = async () => {
    if (!pendingValues || isSaving) return;
    setIsSaving(true);
    try {
      const saved = await onSubmit(pendingValues);
      if (saved && draftStorageKey) {
        try {
          removeStorage(draftStorageKey);
        } catch (error) {
          showToast({ type: 'error', message: error.message || 'Product saved, but the saved draft could not be cleared.' });
        }
      }
      setIsConfirmationOpen(false);
      setPendingValues(null);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (isConfirmationOpen) {
        closeConfirmation();
        return;
      }
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, isConfirmationOpen, isSaving, closeConfirmation]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="product-drawer-overlay fixed inset-0 z-50 bg-black/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => {
            if (!isConfirmationOpen && !isSaving) onClose();
          }}
        >
          <motion.div
            className="product-drawer-panel absolute right-0 top-0 flex h-full w-full max-w-[800px] flex-col bg-[var(--surface-elevated)] shadow-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3, ease: 'easeOut' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="product-drawer-header flex items-start justify-between gap-4 border-b border-[var(--line)] px-8 py-6">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-widest text-[var(--green-700)]">
                  {product ? 'Edit listing' : 'New listing'}
                </p>
                <h2 className="mt-1 text-[28px] font-semibold leading-tight text-[var(--text)]">{product ? 'Edit product' : 'Add Product'}</h2>
                <p className="mt-1.5 text-[13px] text-[var(--muted)]">
                  {product
                    ? 'Update the information below to save your changes.'
                    : 'Fill in the information below to publish your product listing.'}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent text-[var(--muted)] transition-colors duration-200 hover:bg-[var(--soft)] hover:text-[var(--text)]"
              >
                <X size={20} strokeWidth={2} />
              </button>
            </div>

            <div className="product-drawer-body flex-1 overflow-y-auto px-8 py-8">
              <ProductForm
                key={product?.id || 'new-product'}
                product={product}
                currentUser={currentUser}
                onSubmit={handleFormSubmit}
                formId={FORM_ID}
                hideActions
                draftStorageKey={draftStorageKey}
                onSubmittingChange={setIsSubmitting}
                onApplyDiscount={onApplyDiscount}
                onRemoveDiscount={onRemoveDiscount}
              />
            </div>

            <div className="product-drawer-footer flex items-center justify-end gap-2.5 border-t border-[var(--line)] px-8 py-5">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button type="submit" form={FORM_ID} disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : 'Save Product'}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
      {isConfirmationOpen ? (
        <motion.div
          className="product-save-confirmation-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeConfirmation}
        >
          <motion.section
            className="product-save-confirmation"
            role="dialog"
            aria-modal="true"
            aria-busy={isSaving}
            aria-labelledby="product-save-confirmation-title"
            aria-describedby="product-save-confirmation-message"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="product-save-confirmation-icon" aria-hidden="true">
              <PackageCheck size={21} strokeWidth={1.9} />
            </div>
            <h2 id="product-save-confirmation-title">Save this product?</h2>
            <p id="product-save-confirmation-message">
              Please review the product details before adding it to your listings. Are you sure you want to save this product?
            </p>
            <div className="product-save-confirmation-actions">
              <Button variant="secondary" onClick={closeConfirmation} disabled={isSaving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={confirmSave} disabled={isSaving}>
                {isSaving ? 'Adding product...' : 'Yes, add product'}
              </Button>
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
