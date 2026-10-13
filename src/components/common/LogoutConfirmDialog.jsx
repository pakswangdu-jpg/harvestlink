import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LogOut } from 'lucide-react';
import Button from './Button';
import './LogoutConfirmDialog.css';

export default function LogoutConfirmDialog({ open, busy, onConfirm, onCancel, isAdmin = false }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <dialog
      ref={dialogRef}
      className="logout-confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <span className="logout-confirm-icon" aria-hidden="true"><LogOut size={20} /></span>
      <h2 id={titleId}>{isAdmin ? 'Log out as administrator?' : 'Log out of HarvestLink?'}</h2>
      <p id={messageId}>
        {isAdmin
          ? "You'll be signed out of the HarvestLink Admin Portal."
          : "You'll need to sign in again to access your account."}
      </p>
      <div className="logout-confirm-actions">
        <Button variant="secondary" onClick={onCancel} disabled={busy} autoFocus>Stay signed in</Button>
        <Button variant="primary" onClick={onConfirm} disabled={busy}>
          {busy ? 'Logging out...' : 'Log out'}
        </Button>
      </div>
    </dialog>,
    document.body,
  );
}
