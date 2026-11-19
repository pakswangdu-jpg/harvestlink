import { useEffect, useId, useRef } from 'react';
import './RequiredFeedbackDialog.css';

export default function RequiredFeedbackDialog({ title, children }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const instructionsId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="required-feedback-dialog"
      aria-labelledby={titleId}
      aria-describedby={instructionsId}
      onCancel={(event) => event.preventDefault()}
    >
      <h2 id={titleId}>{title}</h2>
      <p id={instructionsId}>Choose a star rating and submit your feedback to continue.</p>
      {children}
    </dialog>
  );
}
