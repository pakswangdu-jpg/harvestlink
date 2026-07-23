import { motion } from 'framer-motion';
import { CheckCircle2, Sparkles, Wallet } from 'lucide-react';
import { formatCurrency, harvestActionLabel, sellWindowLabel } from '../../utils/formatters';

// The single most important section on the page: what a farmer needs to act on for the
// currently selected crop, in one glance. `aiSummary` is Gemini's real narrative over the
// already-computed numbers below (null, honestly, if GEMINI_API_KEY isn't configured — see
// MarketSummaryCard.jsx's identical fallback contract); the action lines and price come
// straight from the crop-detail forecast, nothing invented for this card.
export default function AiRecommendationHero({ crop, forecast, aiSummary }) {
  if (!crop || !forecast) return null;

  const { forecastPrice, unit, bestTimeToHarvest, bestTimeToSell } = forecast;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl border border-green-100 bg-gradient-to-br from-green-50/70 via-white to-white p-6 shadow-sm sm:p-7"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-700 text-white">
          <Sparkles size={18} strokeWidth={2} />
        </span>
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest text-green-700">AI Recommendation</p>
          <h2 className="text-[20px] font-bold text-gray-900">{crop}</h2>
        </div>
      </div>

      {aiSummary ? (
        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-gray-700">{aiSummary}</p>
      ) : (
        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-gray-500">
          AI narrative unavailable — GEMINI_API_KEY not configured. The recommendation below is still real, computed
          from live forecast data.
        </p>
      )}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1.5 rounded-xl border border-green-200 bg-green-50/80 p-4">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-green-800">Recommended Action</p>
          <p className="flex items-center gap-1.5 text-[14px] font-semibold text-gray-900">
            <CheckCircle2 size={16} className="shrink-0 text-green-700" /> {harvestActionLabel(bestTimeToHarvest)}
          </p>
          <p className="flex items-center gap-1.5 text-[14px] font-semibold text-gray-900">
            <CheckCircle2 size={16} className="shrink-0 text-green-700" /> {sellWindowLabel(bestTimeToSell)}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:w-56">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <Wallet size={13} /> Expected Price
          </p>
          <p className="mt-1.5 text-[22px] font-bold text-gray-900">{formatCurrency(forecastPrice)}{unit ? `/${unit}` : ''}</p>
        </div>
      </div>
    </motion.section>
  );
}
