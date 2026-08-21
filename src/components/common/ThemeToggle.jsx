import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

// Reuses .segmented-control (the same compact three-way control Grade/Sales type already use
// in ProductForm.jsx) rather than a bespoke switch, so this reads as part of the existing
// design language instead of a new control style.
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="segmented-control three" role="radiogroup" aria-label="Theme">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={theme === option.value ? 'active' : ''}
          onClick={() => setTheme(option.value)}
          aria-pressed={theme === option.value}
        >
          <option.icon size={15} className="inline-block align-[-2px]" aria-hidden="true" /> {option.label}
        </button>
      ))}
    </div>
  );
}
