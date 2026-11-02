import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LoaderCircle, PackageOpen, Plus, X } from 'lucide-react';
import ProductForm from '../forms/ProductForm';
import Button from '../common/Button';
import { removeStorage } from '../../services/storageService';
import { useToast } from '../../contexts/ToastContext';
import { formatCurrency, formatQuantity } from '../../utils/formatters';

const FORM_ID = 'product-drawer-form';




export default function ProductDrawer({
  open, product, currentUser, onSubmit, onClose, onApplyDiscount, onRemoveDiscount,
}) {
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmationError, setConfirmationError] = useState('');
  const cancelButtonRef = useRef(null);
  const returnFocusRef = useRef(null);
  const wasConfirmationOpenRef = useRef(false);
  const isSavingRef = useRef(false);
  const draftStorageKey = !product && currentUser?.id
    ? `harvestlink:product-draft:${currentUser.id}`
    : null;
  const confirmationTitle = pendingValues?.isDonation
    ? 'Ready to share this donation?'
    : 'Ready to add this product?';
  const confirmationMessage = pendingValues?.isDonation
      ? 'Check the details below before sharing it with community partners.'
      : 'Take a moment to check the details. If the price needs Admin review, the listing will wait for approval before it is available.';
  const confirmationActionLabel = pendingValues?.isDonation ? 'List donation' : 'Add product';
  const confirmationItemType = pendingValues?.isDonation ? 'Donation' : pendingValues?.category || 'Product listing';
  const productImage = pendingValues?.imageUrls?.[0] || pendingValues?.image;
  const previewPrice = Number(pendingValues?.price || 0)
    * (1 - (Number(pendingValues?.discountPercent) || 0) / 100);

  const handleFormSubmit = (values) => {
    if (product) {
      onSubmit(values);
      return;
    }
    returnFocusRef.current = document.activeElement;
    setConfirmationError('');
    setPendingValues(values);
    setIsConfirmationOpen(true);
  };

  const closeConfirmation = useCallback(() => {
    if (isSaving) return;
    setIsConfirmationOpen(false);
    setPendingValues(null);
    setConfirmationError('');
  }, [isSaving]);

  const confirmSave = async () => {
    if (!pendingValues || isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const result = await onSubmit(pendingValues, { fromConfirmation: true });
      if (result !== true) {
        setConfirmationError(
          result?.success === false
            ? result.error || 'We could not save this product. Please try again.'
            : 'We could not confirm that this product was saved. Your details are still here; please try again.',
        );
        return;
      }
      if (draftStorageKey) {
        try {
          removeStorage(draftStorageKey);
        } catch (error) {
          showToast({ type: 'error', message: error.message || 'Product saved, but the saved draft could not be cleared.' });
        }
      }
      setIsConfirmationOpen(false);
      setPendingValues(null);
      setConfirmationError('');
    } catch (error) {
      setConfirmationError(error.message || 'We could not save this product. Please try again.');
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!isConfirmationOpen) {
      if (wasConfirmationOpenRef.current) {
        returnFocusRef.current?.focus();
        wasConfirmationOpenRef.current = false;
      }
      return undefined;
    }

    wasConfirmationOpenRef.current = true;
    cancelButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isConfirmationOpen]);

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

  const handleConfirmationKeyDown = (event) => {
    if (event.key !== 'Tab') return;
    const dialog = event.currentTarget;
    const focusable = [...dialog.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

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
              initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
            onClick={(event) => event.stopPropagation()}
              onKeyDown={handleConfirmationKeyDown}
            >
              <div className="product-save-confirmation-heading">
                <div className="product-save-confirmation-icon" aria-hidden="true">
                <PackageOpen size={20} strokeWidth={1.8} />
              </div>
              <div>
                <p className="product-save-confirmation-eyebrow">Review product</p>
                <h2 id="product-save-confirmation-title">{confirmationTitle}</h2>
              </div>
            </div>
            <p id="product-save-confirmation-message">
              {confirmationMessage}
            </p>
            <div className="product-save-confirmation-preview">
              {productImage ? (
                <img
                  className="product-save-confirmation-image"
                  src={productImage}
                  alt=""
                />
              ) : (
                <div className="product-save-confirmation-image-fallback" aria-hidden="true">
                  <PackageOpen size={21} strokeWidth={1.8} />
                </div>
              )}
              <div className="product-save-confirmation-product">
                <span className="product-save-confirmation-item-label">{confirmationItemType}</span>
                <strong>{pendingValues?.name || 'Untitled product'}</strong>
                <span className="product-save-confirmation-category">{pendingValues?.category}</span>
              </div>
              <dl className="product-save-confirmation-details">
                <div>
                  <dt>{pendingValues?.isDonation ? 'For' : 'Price'}</dt>
                  <dd>{pendingValues?.isDonation ? 'Donation' : `${formatCurrency(previewPrice)}/${pendingValues?.unit || ''}`}</dd>
                </div>
                <div>
                  <dt>Available</dt>
                  <dd>{formatQuantity(pendingValues?.quantity)} {pendingValues?.unit}</dd>
                </div>
              </dl>
            </div>
            {confirmationError ? (
              <p className="product-save-confirmation-error" role="alert">{confirmationError}</p>
            ) : null}
            <div className="product-save-confirmation-actions">
              <button
                ref={cancelButtonRef}
                type="button"
                className="btn btn-secondary"
                onClick={closeConfirmation}
                aria-disabled={isSaving}
              >
                Cancel
              </button>
              <Button variant="primary" onClick={confirmSave} disabled={isSaving}>
                {isSaving ? (
                  <><LoaderCircle size={16} className="product-save-confirmation-spinner" aria-hidden="true" />Adding product...</>
                ) : (
                  <><Plus size={16} strokeWidth={2.2} aria-hidden="true" />{confirmationActionLabel}</>
                )}
              </Button>
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
