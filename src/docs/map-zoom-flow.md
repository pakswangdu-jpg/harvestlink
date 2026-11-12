# Map Zoom Flow Documentation

This document describes the zoom‑control flow for the map components in **HarvestLink**. It covers the UI elements, event‑handler chain, zoom limits, and interactions with other map features.

---

## 1. UI Hierarchy

- Zoom controls are rendered inside a `<div className="nav-map-zoom-controls">` container which lives in the following components:
  - `src/components/orders/LiveDeliveryMap.jsx`
  - `src/components/orders/DeliveryMap.jsx`
- The container includes two buttons:
  ```jsx
  <button className="nav-zoom-in" onClick={() => adjustMapZoom(1)} disabled={!mapReady}>+</button>
  <button className="nav-zoom-out" onClick={() => adjustMapZoom(-1)} disabled={!mapReady}>‑</button>
  ```
- The buttons are positioned top‑right via CSS rules in `src/styles/globals.css`:
  ```css
  .nav-map-zoom-controls { position: absolute; top: 12px; right: 12px; }
  ```

---

## 2. Zoom Handler (`adjustMapZoom`)

### Definition (LiveDeliveryMap.jsx)
```jsx
function adjustMapZoom(delta) {
  if (!map) return;
  const currentZoom = map.getZoom();
  let newZoom = currentZoom + delta;
  // Clamp to allowed range [3, 21]
  newZoom = Math.max(3, Math.min(21, newZoom));
  map.setZoom(newZoom);
}
```
- **Parameters**: `delta` is `+1` for zoom‑in and `‑1` for zoom‑out.
- **Clamping**: Ensures zoom never goes below **3** or above **21**.
- **Side‑effects**: Only updates the zoom level; it does **not** change the map center or `autoFollow` state.

The same logic is present in `DeliveryMap.jsx` (imports the function from a shared utility). If the component does not have its own implementation, it forwards the call to the function defined in `LiveDeliveryMap.jsx`.

---

## 3. State Synchronisation

- `mapReady` (boolean) indicates whether the Google Maps instance has finished loading. The zoom buttons are disabled (`disabled={!mapReady}`) until the map is ready.
- The map object (`map`) is stored in a React `useRef` and is set after `loadGoogleMaps()` resolves.
- If the Google Maps API fails to load, we catch the promise to avoid an unhandled rejection and keep the UI stable:
```js
loadGoogleMaps().then(initMap).catch(() => {});
```

---

## 4. Interaction with Other Controls

| Control | Effect on Zoom | Notes |
|---------|----------------|-------|
| **Recenter / Auto‑follow button** (`nav-recenter-btn`) | No effect on zoom | Toggles `autoFollow` flag, does not call `setZoom` |
| **Traffic toggle** | No effect on zoom | Independent UI control
| **Zoom buttons** | Calls `adjustMapZoom` → updates `map.setZoom` | Respects min 3 / max 21 limits |

Zoom changes do **not** reset the map center; they only affect the zoom level.

---

## 5. Edge Cases & Fallbacks

1. **Map not ready** – Buttons are disabled, preventing calls to `adjustMapZoom`.
2. **API load failure** – The `.catch(() => {})` ensures the UI does not show a white screen.
3. **Zoom limits** – Enforced programmatically; unit tests (`liveDeliveryMap.test.mjs`) verify:
   - Repeated zoom‑in stops at 21.
   - Repeated zoom‑out stops at 3.

---

## 6. Flow Diagram (Mermaid)
```mermaid
flowchart TD
    UI[User clicks + / - button] -->|onClick| Handler{adjustMapZoom(delta)}
    Handler -->|getZoom| MapAPI[map.getZoom()]
    Handler -->|clamp| Clamp[Clamp to 3‑21]
    Clamp -->|setZoom| MapAPI2[map.setZoom(newZoom)]
    MapAPI2 --> UI
    style UI fill:#f9f,stroke:#333,stroke-width:2px
    style Handler fill:#bbf,stroke:#333,stroke-width:2px
    style Clamp fill:#efe,stroke:#333,stroke-width:2px
```

---

## 7. References
- **Components**:
  - `src/components/orders/LiveDeliveryMap.jsx`
  - `src/components/orders/DeliveryMap.jsx`
- **Tests**: `src/components/orders/liveDeliveryMap.test.mjs`
- **Styles**: `src/styles/globals.css`

---

*This documentation is meant to serve as a single source of truth for developers working on map zoom functionality.*
