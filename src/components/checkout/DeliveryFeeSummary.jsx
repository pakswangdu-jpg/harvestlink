import { Clock3, Loader2, MapPinned, Truck } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

// A GrabFood/Foodpanda-style live checkout summary — road distance, ETA, delivery fee (with
// its pricing tier), subtotal, and grand total, all driven by
// src/services/deliveryFeeService.js's live backend estimate. Reusable: CheckoutForm.jsx is
// the only current caller, but nothing here is specific to it.
//
// `estimate` is `{ fee, distanceKm, durationMinutes, tierLabel, source }` (see
// backend/src/lib/deliveryFee.js) once loaded — `source: 'straight-line'` means the live
// backend call failed and the caller substituted a client-side fallback so checkout still
// shows a sensible total; `error` carries the message to display alongside it. For pickup,
// `estimate.distanceKm` is the real road distance from the buyer's own live location (not a
// fee — pickup is always free) — `locationStatus`/`locationNotice`/`onRetryLocation` cover
// the states before that location is actually available (requesting, denied, unsupported).
export default function DeliveryFeeSummary({
  subtotal, estimate, isLoading, error, isPickup, locationStatus, locationNotice, onRetryLocation,
}) {
  const fee = isPickup ? 0 : (estimate?.fee ?? 0);
  const total = subtotal + fee;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
        <Truck size={16} className="text-green-700" aria-hidden="true" />
        <span className="text-sm font-semibold text-slate-700">Delivery summary</span>
      </div>

      <div className="p-4 space-y-3">
        {isPickup ? (
          <>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <MapPinned size={15} aria-hidden="true" /> Buyer pickup — no delivery fee
            </div>

            {locationStatus === 'locating' ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Detecting your location…
              </div>
            ) : null}

            {(locationStatus === 'denied' || locationStatus === 'unsupported') && locationNotice ? (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                <span>{locationNotice}</span>
                {locationStatus === 'denied' ? (
                  <button type="button" onClick={onRetryLocation} className="font-semibold underline shrink-0">
                    Try again
                  </button>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {error}
              </div>
            ) : null}

            {isLoading && !estimate ? (
              <div className="animate-pulse space-y-2" aria-label="Calculating distance to the farm">
                <div className="h-3 bg-slate-100 rounded w-2/3" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
              </div>
            ) : estimate && estimate.distanceKm > 0 ? (
              <>
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <MapPinned size={14} aria-hidden="true" /> Distance from you to the farm
                  </span>
                  <span className="font-medium text-slate-800">{estimate.distanceKm.toFixed(1)} km</span>
                </div>
                {estimate.durationMinutes != null ? (
                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <Clock3 size={14} aria-hidden="true" /> Estimated travel time
                    </span>
                    <span className="font-medium text-slate-800">~{Math.round(estimate.durationMinutes)} min</span>
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        ) : (
          <>
            {error ? (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {error}
              </div>
            ) : null}

            {isLoading && !estimate ? (
              <div className="animate-pulse space-y-2" aria-label="Calculating delivery fee">
                <div className="h-3 bg-slate-100 rounded w-2/3" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
                <div className="h-3 bg-slate-100 rounded w-3/4" />
              </div>
            ) : estimate ? (
              <>
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <MapPinned size={14} aria-hidden="true" /> Road distance
                  </span>
                  <span className="font-medium text-slate-800">{estimate.distanceKm.toFixed(1)} km</span>
                </div>
                {estimate.durationMinutes != null ? (
                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <Clock3 size={14} aria-hidden="true" /> Estimated travel time
                    </span>
                    <span className="font-medium text-slate-800">~{Math.round(estimate.durationMinutes)} min</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>
                    Delivery fee <span className="text-slate-400">({estimate.tierLabel})</span>
                  </span>
                  <span className="font-medium text-slate-800">{formatCurrency(estimate.fee)}</span>
                </div>
              </>
            ) : null}
          </>
        )}

        <div className="border-t border-dashed border-slate-200 pt-3 space-y-1.5">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-base font-bold text-slate-900">
            <span>Total</span>
            <span className="text-green-700">{formatCurrency(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
