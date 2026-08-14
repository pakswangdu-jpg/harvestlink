import { AlertCircle, AlertTriangle, CheckCircle, Info } from 'lucide-react';

const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

// The standardized notification used app-wide for success/error/warning/info messages that
// benefit from a short title plus a fuller explanation (e.g. "Code expired" / "Your
// verification code has expired. Please request a new code."). Every existing bare
// `<div className="form-alert TYPE">text</div>` elsewhere in the app already gets a matching
// icon/border/spacing treatment from the same .form-alert CSS in globals.css — this component
// is the richer two-line variant of that same system, not a separate one, for new/updated
// call sites (see AuthPage.jsx's verification screen) rather than a required rewrite of
// every existing usage.
export default function FormAlert({
  type = 'info', title, message, children, className = '',
}) {
  const Icon = ICONS[type] || Info;
  return (
    <div
      className={`form-alert ${type} has-icon ${className}`.trim()}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
    >
      <Icon size={17} strokeWidth={2} />
      <div className="form-alert-content">
        {title ? <span className="form-alert-title">{title}</span> : null}
        <span className="form-alert-body">{message ?? children}</span>
      </div>
    </div>
  );
}
