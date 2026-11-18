# HarvestLink AI Price Recommendation Analysis

## Scope

This document describes the farmer Add Product price recommendation. The feature uses existing HarvestLink Market Insights values, PSA historical farmgate trends, verified paid-order history, active listing supply, production cost, and optional Gemini text assistance.

## Existing Market Insights Integration

Market references are resolved by `backend/src/lib/effectiveMarketPrice.js`.

- Admin-entered or verified-local references are primary.
- PSA Central Visayas annual farmgate prices are the built-in supplementary benchmark.
- Custom/admin-added commodities use their registered unit and active override.
- Product matching is exact and case-insensitive.
- Units are converted before the recommendation is calculated.

The existing endpoint is `POST /api/market-price-overrides/:commodityId/recommendation`.

## Verified Data Sources

1. Active admin market-price override, effective date, source, and unit.
2. PSA Central Visayas historical farmgate trend for built-in commodities.
3. HarvestLink paid orders for exact product-name and unit matches.
4. Active HarvestLink listings for exact product-name and unit matches.
5. Farmer-entered production cost and available quantity.

No random or fabricated market values are used. If a source is missing or insufficient, the engine returns unavailable or uses only evidence that exists.

## Deterministic Pricing Algorithm

Let:

- `M` = effective Market Insights reference price in the selected selling unit.
- `E` = exact paid-order average for the same product name and unit, when within 25% of `M`.
- `T` = market trend percentage, bounded to -12.5% to +12.5%.
- `D` = demand adjustment: +2% for high demand, 0% for moderate demand, -2% for low demand.
- `S` = supply adjustment: +2% for low supply, 0% for moderate supply, -1% for high supply.
- `C` = farmer production cost per selling unit.

For exact order evidence, a conservative blended reference is:

`B = 0.75M + 0.25E`

If exact order evidence is too far from Market Insights, it is not blended.

The evidence adjustment is:

`A = clamp(T + D + S, -15%, +20%)`

The initial recommendation is:

`R = round(B * (1 + A / 100), 2 decimals)`

The profitability floor is:

`F = round(C * 1.15, 2 decimals)`

The final recommendation is:

`R = max(R, F)` when production cost is available.

The market range guard is 85% to 120% of `M`. A cost higher than that range does not guarantee competitiveness; the UI explains that the result may be uncompetitive.

## Exact Trend Calculation

For PSA data:

`trend = ((latest annual price - previous annual price) / previous annual price) * 100`

The final trend adjustment is capped to avoid arbitrary changes.

For exact paid-order history:

- Rising: +3% evidence adjustment
- Stable: 0%
- Falling: -3%

This exact-order trend is supplementary; Market Insights remains the primary base.

## Profitability

For production cost `C` and recommended price `R`:

- Profit per unit: `R - C`
- Selling margin: `(R - C) / R * 100`
- Estimated stock revenue: `R * quantity`

These values are estimates and do not include labor, transport, spoilage, tax, or financing unless those values are represented by the entered production cost.

## AI Integration

Gemini is used only to explain the deterministic result, if `GEMINI_API_KEY` is configured.

- Gemini receives the exact product name, unit, reference, trend, cost, computed recommendation, profit, margin, and demand/supply evidence.
- Gemini cannot select or replace the recommended number.
- Gemini output is limited to a short summary and recommendation.
- The final number always comes from the deterministic formula.

If Gemini is unavailable or returns invalid output, the system uses `Rule-based, evidence-validated` and does not claim AI or machine-learning output.

## Example

Given:

- Market reference: ₱40/kg
- Production cost: ₱20/kg
- Market trend: +12.5%
- Demand: moderate
- Supply: moderate
- No exact-order blend

Demand and supply do not add adjustments. The evidence adjustment is:

`12.5%`

Recommendation:

`₱40 × (1 + 12.5/100) = ₱45/kg`

Cost profitability floor:

`₱20 × 1.15 = ₱23/kg`

Since ₱45 is above the floor:

- Estimated profit: `₱45 - ₱20 = ₱25/kg`
- Selling margin: `₱25 / ₱45 = 55.6%`

The “Why This Price?” panel displays these values and the source/date.

## UI Behavior

The Add Product modal:

- Shows Market Insights reference price and trend.
- Shows AI-recommended or rule-based recommended price.
- Shows adjustment percentage and exact calculation.
- Shows estimated profit, margin, and revenue.
- Shows source and updated/effective date.
- Populates only the Selling Price field when “Use AI-recommended price” is selected.
- Leaves saving and publishing unchanged.

## Known Limitations

- PSA data availability varies by commodity and year.
- Admin-entered custom commodities may not have PSA history.
- Exact-order evidence requires at least sufficient paid orders.
- Seasonal weather and demand forecasts are supplementary; they do not override the hard profitability and market-range guards.
- Gemini text is explanatory and is not used to fabricate prices.
