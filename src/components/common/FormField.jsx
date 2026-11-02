import { AlertCircle } from 'lucide-react';

export default function FormField({
  label,
  name,
  error,
  helper,
  children,
  className = '',
}) {
  const errorId = error ? `${name}-error` : undefined;

  return (
    <label className={`form-field${className ? ` ${className}` : ''}`} htmlFor={name}>
      <span>{label}</span>
      {children}
      {helper && !error ? <small>{helper}</small> : null}
      {error ? (
        <small className="field-error" id={errorId} role="alert">
          <AlertCircle size={12} strokeWidth={2.25} />
          {error}
        </small>
      ) : null}
    </label>
  );
}
