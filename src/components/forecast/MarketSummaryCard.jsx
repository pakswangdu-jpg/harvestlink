import { Sparkles } from 'lucide-react';

// The forecast price/trend/etc. above this card always comes from the real trend-projection
// engine — this card only ever explains those already-computed numbers in plain language.
// If GEMINI_API_KEY isn't configured on the backend, `summary` is null and that's stated
// honestly here rather than a fabricated explanation standing in for it.
export default function MarketSummaryCard({ summary }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-700">
          <Sparkles size={16} strokeWidth={2} />
        </span>
        <p className="text-[15px] font-semibold text-gray-900">AI Market Analysis</p>
      </div>
      {summary ? (
        <p className="mt-3 text-[14px] leading-relaxed text-gray-600">{summary}</p>
      ) : (
        <p className="mt-3 text-[14px] leading-relaxed text-gray-500">
          AI market analysis unavailable — GEMINI_API_KEY not configured. The forecast numbers above are unaffected.
        </p>
      )}
    </div>
  );
}
