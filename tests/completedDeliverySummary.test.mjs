import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CheckCircle2, Clock3, Gauge, MapPin, Truck } from 'lucide-react';
import { transformWithOxc } from 'vite';
import { getRecordedAverageSpeedKmh } from '../src/utils/tripTelemetry.js';

async function renderSection(file, className, order, active = false) {
  const source = await readFile(new URL(`../src/components/orders/${file}`, import.meta.url), 'utf8');
  const start = source.indexOf(`<section className="${className}"`);
  const section = source.slice(start, source.indexOf('</section>', start) + '</section>'.length);
  const average = getRecordedAverageSpeedKmh(order);
  const scope = { React, CheckCircle2, Clock3, Gauge, MapPin, Truck,
    completedAverageSpeedKmh: average, isDelivered: !active, statusLabel: active ? 'On the way' : 'Delivered',
    etaCardValue: 'Delivered', speedCardValue: average == null ? '\u2014' : `${average.toFixed(1)} km/h avg`,
    speedValue: average == null ? '\u2014' : `${average.toFixed(1)} km/h`, distanceValue: '1.8 km', etaValue: '6 mins',
  };
  const { code } = await transformWithOxc(`function Summary(){return (${section});}`, 'fixture.jsx', { jsx: { runtime: 'classic' } });
  const Summary = new Function('scope', `with(scope){${code};return Summary;}`)(scope);
  return renderToStaticMarkup(React.createElement(Summary));
}

for (const file of ['LiveDeliveryMap.jsx', 'LiveTrackingModal.jsx']) {
  test(`${file}: completed summary omits remaining distance and shows only recorded average speed`, async () => {
    const html = await renderSection(file, 'tracking-completed-summary', { trackedDistanceKm: 8, trackedDurationSeconds: 3600 });
    assert.match(html, /Delivered/);
    assert.match(html, /Order completed successfully/);
    assert.match(html, /Average speed/);
    assert.match(html, /8\.0 km\/h/);
    assert.doesNotMatch(html, /Remaining|0\.0 km|ETA|Delivery Status/);
  });

  test(`${file}: absent trip data does not create placeholders or a fabricated completion timestamp`, async () => {
    const html = await renderSection(file, 'tracking-completed-summary', {
      updatedAt: '2026-10-07T13:42:00Z', locationUpdatedAt: '2026-10-07T13:40:00Z',
    });
    assert.match(html, /Delivered/);
    assert.doesNotMatch(html, /Remaining|Average speed|Delivered at|<dl|\u2014/);
  });
}

test('active modal still shows its existing remaining distance, ETA, speed and delivery status', async () => {
  const html = await renderSection('LiveTrackingModal.jsx', 'tracking-delivery-summary', {
    trackedDistanceKm: 8, trackedDurationSeconds: 3600,
  }, true);
  assert.match(html, /Remaining Distance/);
  assert.match(html, /1\.8 km/);
  assert.match(html, /6 mins/);
  assert.match(html, /Current Speed/);
  assert.match(html, /Delivery Status/);
  assert.doesNotMatch(html, /Order completed successfully|Average speed/);
});
