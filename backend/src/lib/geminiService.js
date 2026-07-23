// Same "return null, never fabricate, when the integration isn't configured" contract as
// weatherService.js's OPENWEATHERMAP_API_KEY handling — Gemini only ever explains numbers
// the forecast engine already computed; it is never asked to invent or adjust a price or
// demand figure, and the feature must still work (with the forecast numbers fully
// populated, just without an AI narrative) when no key is set or the request fails.
const MODEL = 'gemini-flash-latest';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// `forecast` carries only already-computed, real values (see priceForecastEngine.js and
// forecastEngine.js) — the prompt explicitly forbids Gemini from stating any other price,
// percentage, or demand figure than the ones given.
export async function generateForecastInsights(forecast) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const {
    cropName, municipality, periodLabel, currentPrice, predictedPrice, changePercent,
    trend, demandLevel, demandTrend, supplyLevel, seasonalImpact, weatherImpact,
    expectedProfit, bestTimeToHarvest, bestTimeToSell, unit,
  } = forecast;

  const prompt = `You are an agricultural market analyst helping a Filipino farmer in Cebu understand a demand and price forecast.
Use ONLY the numbers given below — never state, imply, or calculate a different predicted price, percentage, or demand figure than the ones given.

Crop: ${cropName}
Location: ${municipality}
Forecast period: ${periodLabel}
Current price: PHP ${currentPrice.toFixed(2)} per ${unit}
Predicted price: PHP ${predictedPrice.toFixed(2)} per ${unit}
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

  try {
    const response = await fetch(`${API_BASE}/${MODEL}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // Gemini's newer flash models spend "thinking" tokens out of maxOutputTokens before
        // producing the actual answer, which can truncate a small budget before any JSON is
        // written — a generous budget leaves room for both, without depending on a
        // thinkingConfig shape that isn't consistently accepted across model versions.
        generationConfig: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 2048 },
      }),
    });

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
