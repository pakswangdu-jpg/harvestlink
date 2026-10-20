import {
  Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Droplets,
  Sun, Thermometer, ThermometerSun, Wind,
} from 'lucide-react';

const FOG_CONDITIONS = new Set(['Mist', 'Smoke', 'Haze', 'Dust', 'Fog', 'Sand', 'Ash', 'Squall', 'Tornado']);

function getConditionBadge(condition, rainfallProbability) {
  const main = condition?.main || '';
  if (main === 'Thunderstorm') return { label: 'Storm', icon: CloudLightning, className: 'bg-[var(--red-100)] text-[var(--red-700)]' };
  if (main === 'Snow') return { label: 'Snow', icon: CloudSnow, className: 'bg-[var(--blue-100)] text-[var(--blue-700)]' };
  if (main === 'Rain' || main === 'Drizzle') {
    if (rainfallProbability >= 60) return { label: 'Heavy rain', icon: CloudRain, className: 'bg-[var(--blue-100)] text-[var(--blue-700)]' };
    if (rainfallProbability >= 30) return { label: 'Rain', icon: CloudRain, className: 'bg-[var(--blue-100)] text-[var(--blue-700)]' };
    return { label: 'Light rain', icon: CloudDrizzle, className: 'bg-[var(--blue-100)] text-[var(--blue-700)]' };
  }
  if (FOG_CONDITIONS.has(main)) return { label: 'Foggy', icon: CloudFog, className: 'bg-[var(--soft)] text-[var(--muted)]' };
  if (main === 'Clouds') return { label: 'Cloudy', icon: Cloud, className: 'bg-[var(--soft)] text-[var(--muted)]' };
  if (main === 'Clear') return { label: 'Sunny', icon: Sun, className: 'bg-[var(--amber-100)] text-[var(--amber-700)]' };
  return { label: condition?.description || 'Current conditions', icon: Cloud, className: 'bg-[var(--soft)] text-[var(--muted)]' };
}

function getRainOutlook(rainfallProbability) {
  if (rainfallProbability == null) return 'No rainfall estimate is available.';
  if (rainfallProbability >= 60) return 'Rain is likely in the current forecast. Check local conditions before planning harvest or transport.';
  if (rainfallProbability >= 30) return 'Rain is possible in the current forecast. Check local conditions before planning outdoor work.';
  return 'The current forecast shows a low chance of rain.';
}

function WeatherStat({ icon: Icon, label, value, unit }) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-[var(--line)] py-3 last:border-b-0">
      <Icon size={18} aria-hidden="true" className="shrink-0 text-[var(--green-700)]" />
      <dt className="min-w-0 flex-1 text-[14px] text-[var(--text-secondary)]">{label}</dt>
      <dd className="shrink-0 text-[15px] font-semibold text-[var(--text)]">
        {value}{unit ? <span className="ml-1 text-[13px] font-normal text-[var(--muted)]">{unit}</span> : null}
      </dd>
    </div>
  );
}

function WeatherSkeleton() {
  return (
    <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 sm:p-6" aria-label="Loading weather">
      <div className="h-6 w-40 animate-pulse rounded bg-[var(--soft)]" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-7 animate-pulse rounded bg-[var(--soft)]" />)}
      </div>
    </section>
  );
}

export default function WeatherPanel({ weather, isLoading }) {
  if (isLoading) return <WeatherSkeleton />;

  if (!weather) {
    return (
      <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <CloudSun size={21} aria-hidden="true" className="text-[var(--green-700)]" />
          <h2 className="text-[18px] font-semibold text-[var(--text)]">Local weather</h2>
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-[var(--muted)]">Weather information is not available right now.</p>
      </section>
    );
  }

  const badge = getConditionBadge(weather.condition, weather.rainfallProbability);
  const BadgeIcon = badge.icon;

  return (
    <section className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 sm:p-6" aria-labelledby="forecast-weather-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CloudSun size={21} aria-hidden="true" className="text-[var(--green-700)]" />
            <h2 id="forecast-weather-title" className="text-[18px] font-semibold text-[var(--text)]">Local weather</h2>
          </div>
          <p className="mt-1 text-[14px] text-[var(--muted)]">{weather.municipality || 'Selected municipality'}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium ${badge.className}`}>
          <BadgeIcon size={15} aria-hidden="true" /> {badge.label}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 sm:gap-x-6">
        <WeatherStat icon={Thermometer} label="Temperature" value={weather.currentTemp ?? '—'} unit={weather.currentTemp != null ? '°C' : ''} />
        <WeatherStat icon={ThermometerSun} label="Feels like" value={weather.feelsLike ?? '—'} unit={weather.feelsLike != null ? '°C' : ''} />
        <WeatherStat icon={Droplets} label="Humidity" value={weather.humidity ?? '—'} unit={weather.humidity != null ? '%' : ''} />
        <WeatherStat icon={CloudRain} label="Rain chance" value={weather.rainfallProbability ?? '—'} unit={weather.rainfallProbability != null ? '%' : ''} />
        <WeatherStat icon={Wind} label="Wind speed" value={weather.windSpeedKmh ?? '—'} unit={weather.windSpeedKmh != null ? 'km/h' : ''} />
      </dl>

      <p className="mt-4 rounded-md bg-[var(--soft)] px-4 py-3 text-[14px] leading-relaxed text-[var(--text-secondary)]">
        <span className="font-semibold text-[var(--text)]">Rain outlook: </span>
        {getRainOutlook(weather.rainfallProbability)}
      </p>
    </section>
  );
}
