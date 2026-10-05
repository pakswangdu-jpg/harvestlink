export default function TrafficRouteNotice({ navigation, allowChoice }) {
  const { selected, suggestion, updating, stale, message } = navigation;
  const delay = selected?.hasTrafficData && selected.staticDurationMinutes != null && !stale
    ? Math.floor(selected.durationMinutes - selected.staticDurationMinutes) : 0;
  return (
    <div className="traffic-route-notices" aria-live="polite">
      {message ? <p className="traffic-route-status">{message}</p> : null}
      {!selected && !message ? <p className="traffic-route-status">Loading Google road route…</p> : null}
      {delay >= 2 ? <p className="traffic-route-status">Google estimates traffic adds about {delay} min.</p> : null}
      {allowChoice && suggestion && !stale ? (
        <div className="traffic-route-suggestion">
          <div>
            <strong>Faster route available</strong>
            <p>Current: {Math.ceil(selected.durationMinutes)} min · Alternative: {Math.ceil(suggestion.route.durationMinutes)} min</p>
            <span>Save approximately {suggestion.savingsMinutes} min with Google’s traffic-aware route.</span>
          </div>
          <div className="traffic-route-actions">
            <button type="button" className="btn btn-primary btn-sm" disabled={updating} onClick={navigation.chooseAlternative}>Use faster route</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={updating} onClick={navigation.keepCurrent}>Keep current route</button>
          </div>
        </div>
      ) : null}
      {updating && selected ? <p className="traffic-route-status">Checking Google routes from your current location…</p> : null}
    </div>
  );
}
