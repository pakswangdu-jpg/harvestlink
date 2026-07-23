import { Lightbulb } from 'lucide-react';

export default function RecommendationCard({ recommendation }) {
  return (
    <div className="rounded-xl border border-green-100 bg-green-50/50 p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-700">
          <Lightbulb size={16} strokeWidth={2} />
        </span>
        <p className="text-[15px] font-semibold text-gray-900">Farmer Recommendation</p>
      </div>
      {recommendation ? (
        <p className="mt-3 text-[14px] leading-relaxed text-gray-700">{recommendation}</p>
      ) : (
        <p className="mt-3 text-[14px] leading-relaxed text-gray-500">
          AI recommendation unavailable — GEMINI_API_KEY not configured.
        </p>
      )}
    </div>
  );
}
