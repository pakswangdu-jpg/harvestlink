export default function Input({ className = '', ...props }) {
  return (
    <input
      className={`h-9 w-full rounded-md border border-[var(--line)] bg-[var(--input-bg)] px-3 text-[13px] text-[var(--text)] outline-none transition-shadow duration-150 placeholder:text-[var(--muted)] focus:border-[var(--green-800)] focus:ring-2 focus:ring-[var(--green-800)]/20 ${className}`.trim()}
      {...props}
    />
  );
}
