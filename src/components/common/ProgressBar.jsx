import { motion } from 'framer-motion';

const TONE_COLOR = {
  green: '#22C55E',
  amber: '#F59E0B',
  red: '#EF4444',
};

// `value` is a 0-100 percentage the caller already computed from real data (e.g. a
// confidence score) — this component only ever renders it, never derives or rounds it.
export default function ProgressBar({ value, tone = 'green', label }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = TONE_COLOR[tone] || TONE_COLOR.green;

  return (
    <div className="w-full" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}
