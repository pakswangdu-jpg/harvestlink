import { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

// Drop-in replacement for a plain <input type="password">, used everywhere the auth pages
// (login, register, partner-org register) collect a password — a leading lock icon plus a
// trailing show/hide toggle, matching the icon-adorned field style used across the redesigned
// auth pages. Purely presentational: id/value/onChange/onBlur/placeholder behave exactly like
// the bare input it replaces, so no calling FormField/validation code needs to change.
export default function PasswordInput({
  id, value, onChange, onBlur, placeholder,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="input-icon-wrap">
      <Lock size={16} className="input-icon" />
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="input-icon-trailing-btn"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
