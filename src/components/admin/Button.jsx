// Admin-scoped button — deliberately separate from src/components/common/Button.jsx (used
// by every non-admin page) so this section's flatter, denser enterprise styling never leaks
// into the farmer/buyer/stakeholder UI, and vice versa.
const VARIANT_CLASSES = {
  primary: 'border-[#166534] bg-[#166534] text-white hover:bg-[#12502a]',
  secondary: 'border-[#D0D7DE] bg-white text-[#24292F] hover:bg-[#F6F8FA]',
  danger: 'border-[#D0D7DE] bg-white text-[#CF222E] hover:border-[#CF222E] hover:bg-[#FFEBE9]',
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
