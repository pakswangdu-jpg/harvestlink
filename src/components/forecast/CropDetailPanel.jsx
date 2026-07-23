import { motion } from 'framer-motion';
import { CloudRain, DollarSign, Lightbulb, TrendingUp, Wallet } from 'lucide-react';
import { cropActionRecommendation, formatCurrency } from '../../utils/formatters';

const ACTION_STYLE = {
  Sell: 'bg-blue-100 text-blue-700',
  Hold: 'bg-amber-100 text-amber-700',
  Plant: 'bg-green-100 text-green-800',
  Harvest: 'bg-purple-100 text-purple-700',
};

function DetailCard({ icon: Icon, label, children }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        <Icon size={13} /> {label}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

// Appears once a crop is selected (row click in the table). Every value is the same
// `forecast` row already fetched for the table; this component only re-presents the
// handful of fields the simplified design asks for as cards instead of long descriptions.
export default function CropDetailPanel({ crop, forecast }) {
  if (!crop || !forecast) return null;
  const action = cropActionRecommendation(forecast);

  return (
    <motion.div
      key={crop}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest text-green-700">Crop Detail</p>
          <h2 className="text-[24px] font-bold text-gray-900">{crop}</h2>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-[13px] font-bold ${ACTION_STYLE[action]}`}>{action}</span>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <DetailCard icon={DollarSign} label="Current Price">
          <p className="text-[17px] font-bold text-gray-900">{formatCurrency(forecast.currentPrice)}{forecast.unit ? `/${forecast.unit}` : ''}</p>
        </DetailCard>
        <DetailCard icon={Wallet} label="Forecast Price">
          <p className="text-[17px] font-bold text-gray-900">{formatCurrency(forecast.forecastPrice)}{forecast.unit ? `/${forecast.unit}` : ''}</p>
        </DetailCard>
        <DetailCard icon={TrendingUp} label="Expected Profit">
          <p className={`text-[17px] font-bold ${forecast.expectedProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {forecast.expectedProfit > 0 ? '+' : ''}{formatCurrency(forecast.expectedProfit)}
          </p>
        </DetailCard>
        <DetailCard icon={CloudRain} label="Weather Impact">
          <p className="text-[13px] font-semibold text-gray-700">{forecast.weatherImpact}</p>
        </DetailCard>
        <DetailCard icon={Lightbulb} label="Recommendation">
          <p className="text-[13px] text-gray-700">{forecast.recommendation}</p>
        </DetailCard>
      </div>
    </motion.div>
  );
}
