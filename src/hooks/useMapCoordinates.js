import { useEffect, useState } from 'react';
import { CEBU_MUNICIPALITY_COORDS, getMunicipalityCoords } from '../utils/constants';
import { geocodeAccountLocation } from '../services/geocodeService';
import { getRegisteredCoordinates } from '../utils/geo';

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function jitter(id, salt) {
  const hash = hashString(`${id}-${salt}`);
  return ((hash % 1000) / 1000) * 0.0024 - 0.0012;
}

function fallbackCoords(person, requireKnownMunicipality = false) {
  if (requireKnownMunicipality && !CEBU_MUNICIPALITY_COORDS[person.municipality]) return null;
  const base = getMunicipalityCoords(person.municipality);
  return {
    lat: base.lat + jitter(person.id, 'lat'),
    lng: base.lng + jitter(person.id, 'lng'),
    precision: 'fallback',
  };
}






export function useMapCoordinates(people, { registeredOnly = false, municipalityOnly = false } = {}) {
  const [resolvedById, setResolvedById] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function upgradeSequentially() {
      for (const person of people) {
        if (cancelled) return;
        if (registeredOnly || municipalityOnly || !person || getRegisteredCoordinates(person)) continue;
        const geocoded = await geocodeAccountLocation(person);
        if (cancelled) return;
        if (geocoded) {
          setResolvedById((previous) => ({ ...previous, [person.id]: geocoded }));
        }
      }
    }

    upgradeSequentially();

    return () => {
      cancelled = true;
    };
  }, [people, registeredOnly, municipalityOnly]);



  const coordsById = {};
  people.forEach((person) => {
    if (!person) return;
    const registered = getRegisteredCoordinates(person);
    const resolved = registered
      ? { ...registered, precision: 'registered' }
      : registeredOnly ? null : municipalityOnly
        ? fallbackCoords(person, true)
        : resolvedById[person.id] || fallbackCoords(person);
    if (resolved) coordsById[person.id] = resolved;
  });
  return coordsById;
}
