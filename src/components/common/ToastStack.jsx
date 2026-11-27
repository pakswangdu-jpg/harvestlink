import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';

const ICONS = {
  success: CheckCircle, error: AlertCircle, warning: AlertTriangle, info: Info,
};





export default function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null;

  const cornerToasts = toasts.filter((toast) => !toast.centered);
  const centeredToasts = toasts.filter((toast) => toast.centered);

  const renderToast = (toast) => {
    const Icon = ICONS[toast.type] || Info;
    return (
      <div
        key={toast.id}
        className={`toast form-alert ${toast.type} has-icon${toast.title === 'Donation listed' ? ' donation-success-toast' : ''}`}
        role={toast.type === 'error' ? 'alert' : 'status'}
        aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      >
        <span className="toast-icon" aria-hidden="true">
          <Icon size={15} strokeWidth={2.2} />
        </span>
        <div className="form-alert-content">
          <div className="toast-header-row">
            {toast.title ? <span className="form-alert-title">{toast.title}</span> : <span className="form-alert-title" />}
            <button type="button" className="toast-close" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">
              <X size={14} strokeWidth={2} />
            </button>
          </div>
          {toast.message ? <span className="form-alert-body">{toast.message}</span> : null}
          {toast.actionLabel && toast.onAction ? (
            <div className="toast-action-row">
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  toast.onAction();
                  onDismiss(toast.id);
                }}
              >
                {toast.actionLabel}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <>
      {cornerToasts.length ? (
        <div className="toast-stack" role="region" aria-label="Notifications">
          {cornerToasts.map(renderToast)}
        </div>
      ) : null}
      {centeredToasts.length ? (
        <div className="toast-stack toast-stack-center" role="region" aria-label="Important notifications">
          {centeredToasts.map(renderToast)}
        </div>
      ) : null}
    </>
  );
}
