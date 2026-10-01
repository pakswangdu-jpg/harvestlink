import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';

const ICONS = {
  success: CheckCircle, error: AlertCircle, warning: AlertTriangle, info: Info,
};





export default function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div className="toast-stack" role="region" aria-label="Notifications">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.type] || Info;
        return (
          <div
            key={toast.id}
            className={`toast form-alert ${toast.type} has-icon`}
            role={toast.type === 'error' ? 'alert' : 'status'}
            aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
          >
            <Icon size={17} strokeWidth={2} />
            <div className="form-alert-content">
              {toast.title ? <span className="form-alert-title">{toast.title}</span> : null}
              {toast.message ? <span className="form-alert-body">{toast.message}</span> : null}
            </div>
            <button type="button" className="toast-close" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
