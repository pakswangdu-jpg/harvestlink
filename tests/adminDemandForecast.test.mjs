import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Admin can open the shared Demand Forecast only inside the Admin-protected routes', async () => {
  const [routes, navigation] = await Promise.all([
    read('../src/app/routes.jsx'),
    read('../src/features/admin/adminNav.js'),
  ]);
  assert.match(routes, /<Route element=\{<AdminProtectedRoute \/>\}>[\s\S]*?<Route path="\/admin-demand-forecast" element=\{<AdminDemandForecast \/>} \/>/);
  assert.match(navigation, /\{ to: '\/admin-demand-forecast', label: 'Demand Forecast'/);
});

test('Admin forecast uses existing demand APIs and real series, and labels unavailable values explicitly', async () => {
  const page = await read('../src/features/admin/AdminDemandForecast.jsx');
  assert.match(page, /getDemandForecast\(\{ category, municipality, period, customDate \}\)/);
  assert.match(page, /getCropForecastDetail\(cropName, \{ period, municipality, customDate \}\)/);
  assert.match(page, /getProducts\(\)/);
  assert.match(page, /detail\?\.demandHistoricalChart/);
  assert.match(page, /detail\?\.forecastCurve/);
  assert.match(page, /'Data unavailable'/);
  assert.match(page, /Farmer listings for/);
});

test('Forecast charts use compact dates, distinguish observed data from forecasts, and fit mobile', async () => {
  const [page, styles] = await Promise.all([
    read('../src/features/admin/AdminDemandForecast.jsx'),
    read('../src/features/admin/AdminDemandForecast.css'),
  ]);
  assert.match(page, /tickFormatter=\{chartDateLabel\}/);
  assert.match(page, /ReferenceLine x=\{forecastStart\}/);
  assert.match(page, /Observed order volume and projected demand/);
  assert.match(page, /Historical prices and projected reference/);
  assert.match(styles, /\.admin-forecast-chart-grid \{ display: grid/);
  assert.match(styles, /@media \(max-width: 800px\)[\s\S]*?\.admin-forecast-chart-grid \{ grid-template-columns: 1fr/);
});

test('Price review modal shows decision evidence and preserves history without changing submitted price', async () => {
  const review = await read('../src/features/admin/priceMonitoring/PendingPriceReviews.jsx');
  assert.match(review, /getCropForecastDetail\(selected\.name/);
  assert.match(review, /Previous approved price/);
  assert.match(review, /Price history/);
  assert.match(review, /Recommended \/ maximum acceptable price/);
  assert.match(review, /submittedPrice: selected\.price/);
  assert.match(review, /The Farmer’s submitted price will not change/);
});
