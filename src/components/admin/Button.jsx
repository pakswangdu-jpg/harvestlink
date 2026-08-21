// Admin-scoped button — deliberately separate from src/components/common/Button.jsx (used
// by every non-admin page) so this section's flatter, denser enterprise styling never leaks
// into the farmer/buyer/stakeholder UI, and vice versa.
const VARIANT_CLASSES = {
  // Hover targets --green-700, not a darker/deeper token — --green-700 is already proven
  // safe as a solid button fill with white text everywhere else in the app (in both themes),
  // so reusing it here guarantees the hover state stays legible instead of risking a token
  // that's tuned bright for heading text, not for sitting behind white button text.
  primary: 'border-[var(--green-800)] bg-[var(--green-800)] text-white hover:bg-[var(--green-700)]',
  secondary: 'border-[var(--line)] bg-[var(--panel)] text-[var(--text)] hover:bg-[var(--soft)]',
  danger: 'border-[var(--line)] bg-[var(--panel)] text-[var(--red-700)] hover:border-[var(--red-700)] hover:bg-[var(--red-100)]',
};

export default function Button({
  children, type = 'button', variant = 'secondary', className = '', ...props
}) {
  return (
    <button
      type={type}
      className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border px-3.5 text-[13px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
