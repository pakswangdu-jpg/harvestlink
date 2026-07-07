import { useEffect, useState } from 'react';
import { getMunicipalityCoords } from '../utils/constants';
import { geocodeAccountLocation } from '../services/geocodeService';

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// People in the same municipality share one coordinate pair — nudge each pin a small
// deterministic amount (based on the account's own id) so they don't stack exactly on
// top of each other when no more precise position is available yet.
function jitter(id, salt) {
  const hash = hashString(`${id}-${salt}`);
  return ((hash % 1000) / 1000) * 0.016 - 0.008;
}

function fallbackCoords(person) {
  const base = getMunicipalityCoords(person.municipality);
  return {
    lat: base.lat + jitter(person.id, 'lat'),
    lng: base.lng + jitter(person.id, 'lng'),
    precision: 'fallback',
  };
}

// Renders every account (farmer or buyer alike) immediately at a fallback position (their
// municipality's known center, offset slightly per-account), then geocodes each one's actual
// registered address in the background — one at a time, respecting Nominatim's ~1 request/
// second usage policy — and upgrades that pin in place if a real, more precise position
// comes back. Never blocks the initial render, and never fabricates precision the geocoder
// didn't actually return.
export function useMapCoordinates(people) {
  const [resolvedById, setResolvedById] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function upgradeSequentially() {
      for (const person of people) {
        if (cancelled) return;
        const geocoded = await geocodeAccountLocation(person);
        if (cancelled) return;
        if (geocoded) {
          setResolvedById((previous) => ({ ...previous, [person.id]: geocoded }));
        }
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }
    }

    upgradeSequentially();

    return () => {
      cancelled = true;
    };
  }, [people]);

  // Derived at render time — a geocoded position once one has resolved, otherwise the
  // immediate fallback — so there's never a synchronous setState in the effect body.
  const coordsById = {};
  people.forEach((person) => {
    coordsById[person.id] = resolvedById[person.id] || fallbackCoords(person);
  });
  return coordsById;
}
