// Small, flat, muted-color badge — light tint of the tone color as background, the tone
// color itself as text (same convention GitHub's own labels use). Never used decoratively —
// only for a field that's genuinely a status.
const TONE_CLASSES = {
  neutral: 'bg-[var(--soft)] text-[var(--muted)]',
  success: 'bg-[var(--green-100)] text-[var(--green-800)]',
  danger: 'bg-[var(--red-100)] text-[var(--red-700)]',
  warning: 'bg-[var(--amber-100)] text-[var(--amber-700)]',
  // Added for Price Monitoring's 6-color status system (Under Review / Overridden /
  // Underpriced) — additive only, every existing tone/caller above is untouched.
  orange: 'bg-[#FFF1E5] text-[#BC4C00]',
  info: 'bg-[var(--blue-100)] text-[var(--blue-700)]',
  teal: 'bg-[#DDF9F4] text-[#0C7566]',
};

export default function Badge({ children, tone = 'neutral' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none ${TONE_CLASSES[tone] || TONE_CLASSES.neutral}`}>
      {children}
    </span>
  );
}
