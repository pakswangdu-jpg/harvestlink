import { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';






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
