import { useEffect, useId, useRef } from 'react';
import { CheckCircle2 } from 'lucide-react';
import Button from '../common/Button';
import './FeedbackSuccessDialog.css';

export default function FeedbackSuccessDialog({ open, onClose, returnFocusRef }) {
  const dialogRef = useRef(null);
  const doneRef = useRef(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogRef.current;
    const returnFocusTarget = returnFocusRef?.current || document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    doneRef.current?.focus();
    document.body.style.overflow = 'hidden';

    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (returnFocusTarget?.isConnected) returnFocusTarget.focus({ preventScroll: true });
    };
  }, [open, returnFocusRef]);

  return (
    <dialog
      ref={dialogRef}
      className="feedback-success-dialog"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onKeyDown={(event) => {
        if (event.key === 'Tab') {
          event.preventDefault();
          doneRef.current?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <CheckCircle2 className="feedback-success-icon" size={40} strokeWidth={1.8} aria-hidden="true" />
      <h2 id={titleId}>Thank you for your feedback</h2>
      <p id={messageId}>Your feedback helps farmers improve their service.</p>
      <p className="feedback-success-note">Your review is now visible on this order.</p>
      <Button ref={doneRef} className="feedback-success-done" onClick={onClose}>Done</Button>
    </dialog>
  );
}
