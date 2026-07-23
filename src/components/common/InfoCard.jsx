import { motion } from 'framer-motion';

// Monochrome, minimal information card — deliberately not a bright green icon tile, per
// the "looks hand-built by a professional, not AI-generated" direction: a plain gray icon
// container, thin border, and a clear label/value hierarchy read as enterprise SaaS
// (Stripe/Linear-style) rather than decorative.
export default function InfoCard({ icon: Icon, label, value }) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className="flex items-start gap-3.5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow duration-200 hover:shadow-md"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-500">
        <Icon size={18} strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] font-medium uppercase tracking-wide text-gray-500">{label}</span>
        <span className="block break-words text-[16px] font-semibold text-gray-900">{value || 'Not provided'}</span>
      </span>
    </motion.div>
  );
}
