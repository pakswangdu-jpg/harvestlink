import { validateCoordinates } from './geo';
import { getContinuousVehicleHeading, normalizeVehicleHeading } from './vehicleMarker';

export function createLiveMapCamera({ map, mapsApi, container, getPosition, getHeading, onFollowChange }) {
  let destroyed = false;
  let following = false;
  let fitting = false;
  let cameraHeading = null;
  const visible = () => {
    const { width, height } = container.getBoundingClientRect();
    return !destroyed && width > 0 && height > 0;
  };
  const pause = () => {
    if (!following || destroyed) return;
    following = false;
    onFollowChange(false);
  };
  const update = () => {
    if (!following || !visible()) return false;
    const position = getPosition();
    const center = validateCoordinates(position?.lat, position?.lng);
    if (!center || typeof map.panTo !== 'function') return false;
    map.panTo(center);
    // A map ID can resolve to a raster map; rotation requires actual vector rendering.
    const vector = mapsApi.RenderingType?.VECTOR != null
      && map.getRenderingType?.() === mapsApi.RenderingType.VECTOR;
    const heading = normalizeVehicleHeading(getHeading());
    if (vector && heading != null && typeof map.setHeading === 'function') {
      const next = cameraHeading == null ? heading : getContinuousVehicleHeading(cameraHeading, heading);
      if (cameraHeading == null || Math.abs(next - cameraHeading) >= 6) {
        map.setHeading(heading);
        cameraHeading = next;
      }
    }
    return true;
  };
  const listeners = [
    map.addListener('dragstart', pause),
    map.addListener('zoom_changed', () => { if (!fitting) pause(); }),
    map.addListener('idle', () => { fitting = false; }),
  ];
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (!visible()) return;
    const center = map.getCenter?.();
    mapsApi.event?.trigger(map, 'resize');
    if (following) update();
    else if (center) map.setCenter(center);
  }) : null;
  observer?.observe(container);

  return {
    update,
    resume() {
      if (destroyed) return false;
      following = true;
      if (!update()) { pause(); return false; }
      onFollowChange(true);
      return true;
    },
    pause,
    fitOverview(bounds) {
      if (!visible() || following) return;
      fitting = true;
      map.fitBounds(bounds, 48);
    },
    destroy() {
      destroyed = true;
      observer?.disconnect();
      listeners.forEach((listener) => listener.remove());
    },
  };
}
