// Small, flat, muted-color badge — light tint of the tone color as background, the tone
// color itself as text (same convention GitHub's own labels use). Never used decoratively —
// only for a field that's genuinely a status.
const TONE_CLASSES = {
  neutral: 'bg-[#F6F8FA] text-[#57606A]',
  success: 'bg-[#DAFBE1] text-[#1A7F37]',
  danger: 'bg-[#FFEBE9] text-[#CF222E]',
  warning: 'bg-[#FFF8C5] text-[#9A6700]',
  // Added for Price Monitoring's 6-color status system (Under Review / Overridden /
  // Underpriced) — additive only, every existing tone/caller above is untouched.
  orange: 'bg-[#FFF1E5] text-[#BC4C00]',
  info: 'bg-[#DDF4FF] text-[#0969DA]',
  teal: 'bg-[#DDF9F4] text-[#0C7566]',
};

export default function Badge({ children, tone = 'neutral' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${TONE_CLASSES[tone] || TONE_CLASSES.neutral}`}>
      {children}
    </span>
  );
}
