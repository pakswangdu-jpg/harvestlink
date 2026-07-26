// Monochrome, minimal information card — deliberately not a bright green icon tile, per
// the "looks hand-built by a professional, not AI-generated" direction: a plain gray icon
// container, thin border, and a clear label/value hierarchy read as enterprise SaaS
// (Stripe/Linear-style) rather than decorative.
export default function InfoCard({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-[#D0D7DE] bg-white p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-50 text-gray-500">
        <Icon size={18} strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] font-medium uppercase tracking-wide text-gray-500">{label}</span>
        <span className="block break-words text-[15px] font-semibold text-gray-900">{value || 'Not provided'}</span>
      </span>
    </div>
  );
}
