import { useEffect, useId, useRef } from 'react';
import { Check } from 'lucide-react';
import Button from '../common/Button';
import './OrderThanksDialog.css';

export default function OrderThanksDialog({ open, onClose, productName }) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    const returnFocusTarget = document.activeElement;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (returnFocusTarget?.isConnected) returnFocusTarget.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="order-thanks-dialog"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <span className="order-thanks-icon" aria-hidden="true">
        <Check size={24} strokeWidth={2.25} />
      </span>
      <p className="order-thanks-eyebrow">Order complete</p>
      <h2 id={titleId}>Thanks for ordering</h2>
      <p id={messageId}>
        {productName
          ? `We hope you enjoy your ${productName}. Thank you for supporting a local farmer.`
          : 'Thank you for supporting a local farmer.'}
      </p>
      <Button ref={closeButtonRef} className="order-thanks-close" onClick={onClose}>Continue</Button>
    </dialog>
  );
}
