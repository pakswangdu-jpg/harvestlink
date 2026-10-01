import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];




export default function ThemeToggle({ compact = false }) {
  const { theme, effectiveTheme, setTheme } = useTheme();

  if (compact) {
    const isDark = effectiveTheme === 'dark';
    return (
      <button
        type="button"
        className="theme-toggle-compact"
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
      </button>
    );
  }

  return (
    <div className={`segmented-control three ${compact ? 'theme-toggle-compact' : ''}`.trim()} role="radiogroup" aria-label="Theme">
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
