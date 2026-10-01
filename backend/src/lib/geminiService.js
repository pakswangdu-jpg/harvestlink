
const DEFAULT_MODEL = 'gemini-flash-latest';
const DEFAULT_FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 8000;


const TOTAL_TIMEOUT_MS = 12000;
const pendingInsights = new Map();

function insightModels() {
  const primary = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const fallbacks = process.env.GEMINI_FALLBACK_MODELS === undefined
    ? DEFAULT_FALLBACK_MODELS
    : process.env.GEMINI_FALLBACK_MODELS.split(',');
  return [...new Set([primary, ...fallbacks]
    .map((model) => model.trim().replace(/^models\//, ''))
    .filter(Boolean))].slice(0, MAX_ATTEMPTS);
}

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function retryAfterMs(response) {
  const value = response.headers.get('retry-after');
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? 0 : Math.max(0, date - Date.now());
}

async function requestInsights(requestBody, apiKey, models) {
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  let failure = 'temporary service failure';

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {


    const model = models[attempt % models.length];
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    let retryAfter = 0;

    try {
      const response = await fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: requestBody,
        signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remaining)),
      });
      if (response.ok) return await response.json();

      failure = `${model}: HTTP ${response.status}`;
      retryAfter = retryAfterMs(response);
      await response.body?.cancel();


      const canSwitchMissingModel = response.status === 404 && attempt < models.length - 1;
      if (!RETRYABLE_STATUS_CODES.has(response.status) && !canSwitchMissingModel) {
        console.error(`Gemini forecast insights unavailable (${failure}); check API access/configuration.`);
        return null;
      }
    } catch (error) {
      if (!['TypeError', 'AbortError', 'TimeoutError'].includes(error.name)) throw error;
      failure = `${model}: ${error.name}`;
    }

    if (attempt === MAX_ATTEMPTS - 1) break;


    const delay = Math.max(retryAfter, RETRY_DELAY_MS * (2 ** attempt) + Math.floor(Math.random() * 250));
    if (delay >= deadline - Date.now()) break;
    await sleep(delay);
  }

  console.warn(`Gemini temporarily unavailable (${failure}); using the standard forecast report.`);
  return null;
}




export async function generateForecastInsights(forecast) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;


  const models = insightModels();
  const key = JSON.stringify({ models, forecast });
  if (pendingInsights.has(key)) return pendingInsights.get(key);
  const pending = generateInsights(forecast, apiKey, models);
  pendingInsights.set(key, pending);
  try {
    return await pending;
  } finally {
    pendingInsights.delete(key);
  }
}

async function generateInsights(forecast, apiKey, models) {







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




      generationConfig: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 2048 },
    });

    const data = await requestInsights(requestBody, apiKey, models);
    const text = data?.candidates?.[0]?.content?.parts
      ?.filter((part) => !part.thought && typeof part.text === 'string')
      .map((part) => part.text).join('');
    if (!text) return null;

    const parsed = JSON.parse(text);
    if (typeof parsed.summary !== 'string' || !parsed.summary.trim()
      || typeof parsed.recommendation !== 'string' || !parsed.recommendation.trim()) return null;
    return { summary: parsed.summary.trim(), recommendation: parsed.recommendation.trim() };
  } catch (error) {
    console.error('Gemini forecast insight generation failed:', error.message);
    return null;
  }
}
