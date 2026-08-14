import { ChevronDown } from 'lucide-react';

// This project deliberately skips Tailwind's Preflight reset (see src/styles/globals.css's
// top comment), so a bare <select> keeps the browser's own native chrome unless explicitly
// stripped — appearance-none + a custom chevron here, same fix applied to the Messages
// translate dropdown.
export default function Select({ className = '', ...props }) {
  return (
    <div className="relative inline-flex">
      <select
        className={`h-9 w-full appearance-none rounded-md border border-[var(--line)] bg-white py-0 pl-3 pr-8 text-[13px] text-[var(--text)] outline-none transition-shadow duration-150 focus:border-[var(--green-800)] focus:ring-2 focus:ring-[var(--green-800)]/20 ${className}`.trim()}
        {...props}
      />
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
    </div>
  );
}
