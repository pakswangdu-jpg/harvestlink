import { AlertCircle, AlertTriangle, CheckCircle, Info } from 'lucide-react';

const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};









export default function FormAlert({
  type = 'info', title, message, children, className = '',
}) {
  const Icon = ICONS[type] || Info;
  const content = message ?? children;
  const safeContent = typeof content === 'string' || typeof content === 'number'
    ? content
    : 'Something went wrong. Please try again.';
  return (
    <div
      className={`form-alert ${type} has-icon ${className}`.trim()}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
    >
      <Icon size={17} strokeWidth={2} />
      <div className="form-alert-content">
        {title ? <span className="form-alert-title">{title}</span> : null}
        <span className="form-alert-body">{safeContent}</span>
      </div>
    </div>
  );
}
