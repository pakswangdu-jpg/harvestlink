import {
  AlertTriangle, CheckCircle2, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow,
  CloudSun, Droplets, Sun, Thermometer, ThermometerSun, Wind,
} from 'lucide-react';

const FOG_CONDITIONS = new Set(['Mist', 'Smoke', 'Haze', 'Dust', 'Fog', 'Sand', 'Ash', 'Squall', 'Tornado']);

// OpenWeatherMap's real `condition.main` decides the badge's icon/label; `main` alone can't
// tell "light" from "heavy" rain, so intensity comes from the same real rainfallProbability
// already used everywhere else on this page (see priceForecastEngine.js's
// computeWeatherImpact) — never from parsing OpenWeatherMap's free-text description.
function getConditionBadge(condition, rainfallProbability) {
  const main = condition?.main || '';
  if (main === 'Thunderstorm') return { label: 'Storm', icon: CloudLightning, className: 'bg-red-50 text-red-700' };
  if (main === 'Snow') return { label: 'Snow', icon: CloudSnow, className: 'bg-sky-50 text-sky-700' };
  if (main === 'Rain' || main === 'Drizzle') {
    if (rainfallProbability >= 60) return { label: 'Heavy Rain', icon: CloudRain, className: 'bg-blue-100 text-blue-800' };
    if (rainfallProbability >= 30) return { label: 'Moderate Rain', icon: CloudRain, className: 'bg-blue-50 text-blue-700' };
    return { label: 'Light Rain', icon: CloudDrizzle, className: 'bg-blue-50 text-blue-600' };
  }
  if (FOG_CONDITIONS.has(main)) return { label: 'Foggy', icon: CloudFog, className: 'bg-gray-100 text-gray-600' };
  if (main === 'Clouds') return { label: 'Cloudy', icon: Cloud, className: 'bg-gray-100 text-gray-600' };
  if (main === 'Clear') return { label: 'Sunny', icon: Sun, className: 'bg-amber-50 text-amber-700' };
  return { label: condition?.description || 'Unknown', icon: Cloud, className: 'bg-gray-100 text-gray-600' };
}

// Same real rainfall-probability tiers computeWeatherImpact() already uses elsewhere on this
// page — this just expands that one real signal into short, actionable guidance instead of a
// single flat sentence. Nothing here is a new data source; it's the same number, re-worded.
function getWeatherGuidance(rainfallProbability) {
  if (rainfallProbability == null) {
    return { tone: 'neutral', headline: 'Weather data is currently unavailable.', tips: [] };
  }
  if (rainfallProbability >= 60) {
    return {
      tone: 'warning',
      headline: 'Heavy rainfall is expected today.',
      tips: [
        'Harvest early if possible.',
        'Protect harvested crops from moisture.',
        'Expect possible transportation delays.',
      ],
    };
  }
  if (rainfallProbability >= 30) {
    return {
      tone: 'warning',
      headline: 'Rain is possible today.',
      tips: ['Monitor conditions before harvesting.', 'Keep crop covers ready just in case.'],
    };
  }
  return {
    tone: 'favorable',
    headline: 'Favorable conditions for harvesting and selling today.',
    tips: [],
  };
}

function WeatherStat({ icon: Icon, label, value, unit }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-4 transition-colors duration-200 hover:bg-gray-100">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm">
        <Icon size={18} strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
        <p className="mt-0.5 flex items-baseline gap-1">
          <span className="text-[26px] font-bold leading-none text-gray-900">{value}</span>
          {unit ? <span className="text-[12px] font-medium text-gray-400">{unit}</span> : null}
        </p>
      </div>
    </div>
  );
}

function WeatherSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="h-6 w-40 animate-pulse rounded bg-gray-100" />
          <div className="h-3 w-24 animate-pulse rounded bg-gray-100" />
        </div>
        <div className="h-7 w-28 animate-pulse rounded-full bg-gray-100" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-[68px] animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
      <div className="mt-4 h-20 animate-pulse rounded-xl bg-gray-100" />
    </div>
  );
}

// Every field here is real OpenWeatherMap data from backend/src/lib/weatherService.js — this
// component only re-presents it: a condition badge, five compact stat cards, and a plain-
// language "what should I do about it" card. No API/backend change, presentation only.
export default function WeatherPanel({ weather, isLoading }) {
  if (isLoading) return <WeatherSkeleton />;

  if (!weather) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <CloudSun size={22} className="text-blue-600" />
          <h3 className="text-[20px] font-bold text-gray-900">Today's Weather</h3>
        </div>
        <p className="mt-3 text-[14px] text-gray-500">OpenWeatherMap not configured.</p>
      </div>
    );
  }

  const badge = getConditionBadge(weather.condition, weather.rainfallProbability);
  const BadgeIcon = badge.icon;
  const guidance = getWeatherGuidance(weather.rainfallProbability);
  const ImpactIcon = guidance.tone === 'favorable' ? CheckCircle2 : AlertTriangle;
  const impactClass = guidance.tone === 'favorable'
    ? 'bg-green-50 text-green-800'
    : guidance.tone === 'warning'
      ? 'bg-amber-50 text-amber-800'
      : 'bg-gray-50 text-gray-600';

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CloudSun size={22} className="text-blue-600" />
            <h3 className="text-[20px] font-bold leading-tight text-gray-900">Today's Weather</h3>
          </div>
          <p className="mt-1 text-[13px] text-gray-500">{weather.municipality}</p>
        </div>
        <span className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ${badge.className}`}>
          <BadgeIcon size={13} strokeWidth={2.5} /> {badge.label}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <WeatherStat icon={Thermometer} label="Temperature" value={weather.currentTemp} unit="°C" />
        <WeatherStat icon={ThermometerSun} label="Feels Like" value={weather.feelsLike != null ? weather.feelsLike : '—'} unit={weather.feelsLike != null ? '°C' : ''} />
        <WeatherStat icon={Droplets} label="Humidity" value={weather.humidity} unit="%" />
        <WeatherStat icon={CloudRain} label="Rain Chance" value={weather.rainfallProbability != null ? weather.rainfallProbability : '—'} unit={weather.rainfallProbability != null ? '%' : ''} />
        <WeatherStat icon={Wind} label="Wind Speed" value={weather.windSpeedKmh} unit="km/h" />
      </div>

      <div className={`mt-5 rounded-xl p-4 ${impactClass}`}>
        <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide">
          <ImpactIcon size={14} /> Weather Impact
        </p>
        <p className="mt-1.5 text-[14px] font-semibold">{guidance.headline}</p>
        {guidance.tips.length ? (
          <ul className="mt-2 flex flex-col gap-1">
            {guidance.tips.map((tip) => (
              <li key={tip} className="text-[13px] leading-relaxed">• {tip}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
