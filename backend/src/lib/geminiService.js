
const MODEL = 'gemini-flash-latest';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Gemini's own 503 body literally says "usually temporary... try again later" — one quick
// retry recovers most of those without the farmer ever seeing the deterministic fallback
// instead of Gemini's actual writeup. Not applied to other error codes (400/403/etc.),
// where retrying identically can't change the outcome and would only add latency to a
// guaranteed failure.
const RETRYABLE_STATUS_CODES = new Set([429, 503]);
const RETRY_DELAY_MS = 700;
// Google's endpoint can black-hole a request under network trouble (proxy/firewall, brief
// outage) instead of returning a fast error — without a hard cap, that hang propagates all
// the way up through getCropForecastDetail and leaves the whole crop-detail request (not
// just the AI narrative) stuck forever. 10s is generous for a real answer but still short
// enough that a farmer isn't staring at a stalled report.
const REQUEST_TIMEOUT_MS = 10000;

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

// `forecast` carries only already-computed, real values (see priceForecastEngine.js and
// forecastEngine.js) — the prompt explicitly forbids Gemini from stating any other price,
// percentage, or demand figure than the ones given.
export async function generateForecastInsights(forecast) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  // A crop with recent orders but no *currently active* listing has no priceSampleCount to
  // average (see computeCropForecast in forecast.controller.js), so currentPrice — and the
  // predictedPrice projected from it — legitimately come back null. Building the prompt
  // (and the .toFixed() calls in it) inside the same try below is what actually makes this
  // function's "never breaks the parent request" contract (see comment above) hold: a plain
  // template-literal crash out here, before the try, used to bubble all the way up and fail
  // the whole crop-detail request instead of just skipping the AI narrative.
  try {
    const {
      cropName, municipality, periodLabel, currentPrice, predictedPrice, changePercent,
      trend, demandLevel, demandTrend, supplyLevel, seasonalImpact, weatherImpact,
      expectedProfit, bestTimeToHarvest, bestTimeToSell, unit,
    } = forecast;

    const formatPrice = (value) => (value != null ? `PHP ${value.toFixed(2)} per ${unit}` : 'not currently available');

    const prompt = `You are an agricultural market analyst helping a Filipino farmer in Cebu understand a demand and price forecast.
Use ONLY the numbers given below — never state, imply, or calculate a different predicted price, percentage, or demand figure than the ones given.

Crop: ${cropName}
Location: ${municipality}
Forecast period: ${periodLabel}
Current price: ${formatPrice(currentPrice)}
Predicted price: ${formatPrice(predictedPrice)}
Expected price change: ${changePercent > 0 ? '+' : ''}${changePercent}%
Expected profit per unit: PHP ${expectedProfit != null ? expectedProfit.toFixed(2) : '0.00'}
Market trend: ${trend}
Current demand: ${demandLevel}
Demand trend: ${demandTrend}
Supply level: ${supplyLevel}
Seasonal impact: ${seasonalImpact}
Weather impact: ${weatherImpact}
Best time to harvest: ${bestTimeToHarvest}
Best time to sell: ${bestTimeToSell}

Respond with strict JSON: {"summary": "2-3 sentence plain-language market summary a farmer with no data background can follow, mentioning both the demand outlook and the price change", "recommendation": "1-2 sentence actionable recommendation on timing (harvesting/selling)"}. Keep both fields concise, friendly, and grounded only in the numbers above.`;

    const requestBody = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      // Gemini's newer flash models spend "thinking" tokens out of maxOutputTokens before
      // producing the actual answer, which can truncate a small budget before any JSON is
      // written — a generous budget leaves room for both, without depending on a
      // thinkingConfig shape that isn't consistently accepted across model versions.
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 2048 },
    });

    let response = await fetch(`${API_BASE}/${MODEL}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok && RETRYABLE_STATUS_CODES.has(response.status)) {
      await sleep(RETRY_DELAY_MS);
      response = await fetch(`${API_BASE}/${MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    }

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Gemini forecast insight generation failed:', response.status, errorBody);
      return null;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const parsed = JSON.parse(text);
    if (!parsed.summary || !parsed.recommendation) return null;
    return { summary: String(parsed.summary), recommendation: String(parsed.recommendation) };
  } catch (error) {
    console.error('Gemini forecast insight generation failed:', error.message);
    return null;
  }
}
