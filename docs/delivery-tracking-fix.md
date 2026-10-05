# Farmer delivery tracking repair

## Confirmed code defects

- `LiveDeliveryMap` consumed database rows and connection-status events, but never joined the order's Socket.IO room. Only the separate `LiveTrackingModal` subscribed to live coordinates. The main buyer map could therefore lag or miss movement.
- The route controller rejected fixes older than 60 seconds, while transit/marker code accepted them for three minutes. A valid 90-second-old fix could display a vehicle and simultaneously block the route. A regression test reproduces this exact condition.
- The farmer watcher omitted `GeolocationPosition.timestamp` and did not publish its position locally. The farmer's own view waited on persistence and subsequent order refreshes.
- Room joins returned no saved location; old responses could replace newer location data; connection-error listeners were not removed.
- Matching a refreshed Google route compared vertices behind the moving vehicle, incorrectly marking the same road's updated ETA unavailable.
- Follow-up regression: a server clock ahead of the phone could make an old saved snapshot outrank the first current phone GPS fix. Fresh local acquisition now takes precedence over remote snapshots without comparing timestamps from different clocks; stale samples remain rejected.

## Corrected flow

The existing high-accuracy farmer watcher publishes one validated position per order to an in-memory store immediately. The existing `farmer-location` event carries the identical latitude, longitude, accuracy, optional heading/speed, original acquisition timestamp, and sample age. No new GPS watcher, Socket.IO connection, database table, or tracking event was introduced.

The backend retains the existing `order:{orderId}` rooms and persisted order location columns. Join acknowledgements include the latest saved location and server time. Conditional database updates prevent a delayed older write from replacing a newer sample. Both map components subscribe through the same hook/store and feed the same position to their marker and route controller.

Device timestamps are normalized from milliseconds, seconds, or ISO values. Freshness uses one three-minute threshold. Server timestamps and sample age account for client/server clock differences without treating a replayed old fix as newly acquired. Offline GPS events are not buffered: reconnection sends the newest still-fresh sample. Null speed/heading never invalidate coordinates.

Before live GPS exists, the map can request a clearly labelled route from the registered farmer location. The first live fix immediately supersedes that preview, including an in-flight preview request. Subsequent routing retains the existing 30-second minimum refresh, 150-metre movement, deviation, and two-minute traffic refresh rules. Route requests use exact farmer GPS and saved buyer coordinates. Only Google-returned geometry is displayed; the marker coordinates are never snapped or offset. Google's road access geometry can naturally stop short of an off-road GPS destination.

The UI, styling, traffic layer, vehicle asset, marker size, and phone rotation code are preserved. Missing route metrics and missing speed remain unavailable instead of becoming fabricated numbers or `null mins`.

## Automated verification

- Frontend tests exercise GPS acquisition, one-watcher lifecycle, immediate local publication, null compass/speed, permission denial, offline/reconnect behavior, timestamp formats, clock differences, stale/reordered samples, room subscriptions, late snapshots, route throttling, initial GPS superseding a preview, and Google fallback to normal driving directions.
- Backend integration tests run a real Socket.IO server with separate farmer, buyer, and late buyer clients. Database/auth boundaries are controlled test doubles. They verify identical broadcast coordinates, order isolation, authorization, persisted snapshots, stale input rejection, and delayed-write protection.
- Existing vehicle-heading tests remain part of the frontend suite.
- Both lint commands and the production build are checked. The existing large-bundle warning remains.

## Live acceptance still required

### Location access for all participating roles

Farmers, buyers, and stakeholders see a shared location-permission notice in their workspace when access is not enabled. The explicit Enable location action requests a high-accuracy fix through the native browser prompt. This permission check does not persist or broadcast the returned coordinates, and does not change saved delivery destinations. Denial includes site-settings instructions; timeout and unsupported/insecure-browser states are handled separately. Permission changes are observed and rechecked when returning to the app. Active farmer deliveries and buyer/stakeholder pickups resume their existing watcher when permission becomes granted.

Each user must approve access on their own device. Allowing a buyer/stakeholder's location does not improve the farmer's phone GPS; farmer-delivery routing continues to use the farmer's actual GPS and the buyer's saved destination. High-accuracy mode is requested, but physical signal quality is device-dependent. General browsing and viewing the other party's shared position remain accessible without sharing the viewer's own coordinates.

Browser contracts: [requesting high-accuracy geolocation](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition), [reading permission state](https://developer.mozilla.org/en-US/docs/Web/API/Permissions/query), and [observing permission changes](https://developer.mozilla.org/en-US/docs/Web/API/PermissionStatus/change_event).

Automated tests do not validate physical phone sensors, the deployed database, Google API credentials, or road geometry in the actual delivery area. Run both the updated frontend and backend, then:

1. Use a farmer and buyer with saved coordinates. Start a farmer delivery on an HTTPS phone session and grant location permission. Confirm a single van at the actual GPS position and a Google route toward the saved buyer marker.
2. Open the same order as the buyer, including after the farmer has already moved. Compare both vehicle positions and verify movement arrives without refreshing.
3. Move along the route, then take another road. Verify marker movement continues while route requests remain throttled and ETA/distance/arrival refresh from Google's result.
4. Rotate the phone and test with compass permission denied. Confirm position/routing work independently of rotation; toggle Traffic and confirm the route remains visible.
5. Briefly disconnect/reconnect, and reopen tracking. Confirm the latest position is restored, older fixes do not move the van backward, and no duplicate markers appear.

Reference contracts: [Geolocation acquisition timestamp](https://developer.mozilla.org/en-US/docs/Web/API/GeolocationPosition/timestamp), [Socket.IO offline event buffering](https://socket.io/docs/v4/client-offline-behavior/), [Google route requests](https://developers.google.com/maps/documentation/routes/compute_route_directions).
