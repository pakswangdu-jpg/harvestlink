import { Sparkles } from 'lucide-react';

// The forecast price/trend/etc. above this card always comes from the real trend-projection
// engine — this card only ever explains those already-computed numbers in plain language.
// If GEMINI_API_KEY isn't configured on the backend, `summary` is null and that's stated
// honestly here rather than a fabricated explanation standing in for it.
export default function MarketSummaryCard({ summary }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--green-50)] text-[var(--green-700)]">
          <Sparkles size={16} strokeWidth={2} />
        </span>
        <p className="text-[15px] font-semibold text-[var(--text)]">AI Market Analysis</p>
      </div>
      {summary ? (
        <p className="mt-3 text-[14px] leading-relaxed text-[var(--text-secondary)]">{summary}</p>
      ) : (
        <p className="mt-3 text-[14px] leading-relaxed text-[var(--muted)]">
          AI market analysis unavailable — GEMINI_API_KEY not configured. The forecast numbers above are unaffected.
        </p>
      )}
    </div>
  );
}
