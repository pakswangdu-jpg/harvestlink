import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { MapPin, RefreshCw, RotateCcw, Search, Users } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import PageHeader from '../../components/admin/PageHeader';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { getAdminUserLocations, sendAdminLocationReminder } from '../../services/authService';
import { DARK_MAP_STYLE, loadGoogleMaps } from '../../lib/googleMapsLoader';
import { MAP_COLORS } from '../../lib/mapMarkerColors';
import { matchesAdminUserLocationSearch } from '../../utils/adminUserLocationSearch';
import { adminNavItems } from './adminNav';
import './AdminUserLocations.css';

const ROLE_COLORS = {
  farmer: MAP_COLORS.farmer,
  buyer: MAP_COLORS.buyer,
  stakeholder: MAP_COLORS.stakeholder,
};
const ROLE_LABELS = {
  farmer: 'Farmer',
  buyer: 'Buyer',
  stakeholder: 'Stakeholder',
};
const PIN_PATH = 'M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20s12-11 12-20C24 5.373 18.627 0 12 0z';
const CEBU_CENTER = { lat: 10.3157, lng: 123.8854 };
const ADDRESS_FIELDS = ['address', 'barangay', 'municipality'];

function validCoordinates(user) {
  if (user.latitude == null || user.longitude == null || user.latitude === '' || user.longitude === '') return null;
  const latitude = Number(user.latitude);
  const longitude = Number(user.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { lat: latitude, lng: longitude };
}

function accountStatus(user) {
  if (user.accountStatus !== 'suspended') return 'active';
  return user.inactivitySuspendedAt ? 'suspended' : 'deactivated';
}

function accountStatusLabel(user) {
  return {
    active: 'Active',
    suspended: 'Suspended',
    deactivated: 'Deactivated',
  }[accountStatus(user)];
}

function verificationLabel(user) {
  if (user.role === 'buyer') return 'Not required';
  return {
    pending: 'Pending',
    verified: 'Verified',
    rejected: 'Rejected',
  }[user.verificationStatus] || 'Not recorded';
}

function registeredAddress(user) {
  return ADDRESS_FIELDS.map((field) => user[field]).filter(Boolean).join(', ') || 'No registered address';
}

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0]?.slice(0, 2) || '?').toUpperCase();
}

function matchesFilters(user, { query, roleFilter, statusFilter }) {
  if (roleFilter && user.role !== roleFilter) return false;
  if (statusFilter === 'pending' && user.verificationStatus !== 'pending') return false;
  if (['active', 'suspended', 'deactivated'].includes(statusFilter) && accountStatus(user) !== statusFilter) return false;
  return matchesAdminUserLocationSearch(user, query);
}

function markerInfoContent(user, onViewProfile) {
  const root = document.createElement('div');
  root.className = 'admin-location-info';

  const heading = document.createElement('div');
  heading.className = 'admin-location-info-heading';
  const avatar = document.createElement('div');
  avatar.className = 'admin-location-avatar';
  avatar.textContent = initials(user.name);
  if (user.avatarUrl) {
    const image = document.createElement('img');
    image.src = user.avatarUrl;
    image.alt = '';
    image.className = 'admin-location-avatar-image';
    image.addEventListener('error', () => image.remove(), { once: true });
    avatar.textContent = '';
    avatar.append(image);
  }
  const identity = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = user.name || 'Registered user';
  const role = document.createElement('span');
  role.textContent = ROLE_LABELS[user.role] || user.role;
  identity.append(name, role);
  heading.append(avatar, identity);
  root.append(heading);

  const details = [
    ...(user.farmName ? [['Farm', user.farmName]] : []),
    ...(user.organizationName ? [['Organization', user.organizationName]] : []),
    ['Registered address', registeredAddress(user)],
    ['Account status', accountStatusLabel(user)],
    ...(user.role === 'buyer' ? [] : [['Verification', verificationLabel(user)]]),
    ['Registered', user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Not recorded'],
  ];
  const list = document.createElement('dl');
  list.className = 'admin-location-info-details';
  details.forEach(([label, value]) => {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value;
    row.append(term, description);
    list.append(row);
  });
  root.append(list);

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'admin-location-view-profile';
  action.textContent = 'View Profile';
  action.addEventListener('click', () => onViewProfile(user.id));
  root.append(action);
  return root;
}

function clusterInfoContent(users, onViewProfile) {
  const root = document.createElement('div');
  root.className = 'admin-location-cluster-info';
  const heading = document.createElement('strong');
  heading.textContent = `${users.length} accounts share this registered location`;
  root.append(heading);

  const list = document.createElement('ul');
  users.forEach((user) => {
    const item = document.createElement('li');
    const identity = document.createElement('div');
    const marker = document.createElement('i');
    marker.style.backgroundColor = ROLE_COLORS[user.role];
    marker.setAttribute('aria-hidden', 'true');
    const details = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = user.name || 'Registered user';
    const role = document.createElement('small');
    role.textContent = ROLE_LABELS[user.role] || user.role;
    details.append(name, role);
    identity.append(marker, details);

    const action = document.createElement('button');
    action.type = 'button';
    action.textContent = 'View Profile';
    action.addEventListener('click', () => onViewProfile(user.id));
    item.append(identity, action);
    list.append(item);
  });
  root.append(list);
  return root;
}

function createRoleMarker(mapsApi, user) {
  const color = ROLE_COLORS[user.role];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 24 32"><path d="${PIN_PATH}" fill="${color}" stroke="#ffffff" stroke-width="1.25"/><circle cx="12" cy="12" r="4.25" fill="#ffffff"/></svg>`;
  const marker = new mapsApi.Marker({
    position: validCoordinates(user),
    title: `${user.name || 'Registered user'} — ${ROLE_LABELS[user.role]}`,
    icon: {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new mapsApi.Size(32, 42),
      anchor: new mapsApi.Point(16, 42),
    },
    zIndex: 2,
  });
  return marker;
}

function SummaryItem({ label, value, tone = 'default' }) {
  return (
    <div className={`admin-location-summary-item is-${tone}`}>
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
}

export default function AdminUserLocations() {
  const { currentUser } = useAuth();
  const { effectiveTheme } = useTheme();
  const navigate = useNavigate();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapsApiRef = useRef(null);
  const clustererRef = useRef(null);
  const markerUsersRef = useRef(new WeakMap());
  const infoWindowRef = useRef(null);
  const [users, setUsers] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [mapLoading, setMapLoading] = useState(true);
  const [mapAttempt, setMapAttempt] = useState(0);
  const [reminderState, setReminderState] = useState({});
  useEffect(() => {
    let cancelled = false;
    getAdminUserLocations()
      .then((result) => {
        if (cancelled) return;
        setUsers(result.users);
        setTotalUsers(result.total);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message || 'Unable to load registered user locations.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshVersion]);

  useEffect(() => {
    if (!mapContainerRef.current) return undefined;
    let cancelled = false;
    loadGoogleMaps()
      .then((mapsApi) => {
        if (cancelled || !mapContainerRef.current) return;
        const map = new mapsApi.Map(mapContainerRef.current, {
          center: CEBU_CENTER,
          zoom: 7,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
          gestureHandling: 'greedy',
        });
        const clusterer = new MarkerClusterer({
          map,
          algorithmOptions: { maxZoom: 14 },
          onClusterClick: (_event, cluster, clusterMap) => {
            const clusterUsers = (cluster.markers || [])
              .map((marker) => markerUsersRef.current.get(marker))
              .filter(Boolean);
            const positions = (cluster.markers || [])
              .map((marker) => {
                const position = marker.getPosition();
                return position ? `${position.lat()},${position.lng()}` : null;
              })
              .filter(Boolean);
            if (clusterUsers.length > 1 && new Set(positions).size === 1) {
              infoWindowRef.current?.close();
              const infoWindow = new mapsApi.InfoWindow({
                content: clusterInfoContent(clusterUsers, (id) => {
                  infoWindow.close();
                  navigate(`/admin-users?user=${encodeURIComponent(id)}`);
                }),
                position: cluster.position,
                maxWidth: 360,
              });
              infoWindow.open({ map: clusterMap });
              infoWindowRef.current = infoWindow;
              return;
            }
            if (cluster.bounds) clusterMap.fitBounds(cluster.bounds, 48);
          },
          renderer: {
            render: ({ count, position }) => new mapsApi.Marker({
              position,
              label: { text: String(count), color: '#ffffff', fontSize: '12px', fontWeight: '700' },
              icon: {
                path: mapsApi.SymbolPath.CIRCLE,
                fillColor: '#14532d',
                fillOpacity: 0.94,
                strokeColor: '#ffffff',
                strokeWeight: 2,
                scale: Math.min(24, 16 + Math.log2(count) * 2),
              },
              zIndex: Number(mapsApi.Marker.MAX_ZINDEX) + count,
            }),
          },
        });
        mapRef.current = map;
        mapsApiRef.current = mapsApi;
        clustererRef.current = clusterer;
        setMapError('');
        setMapLoading(false);
        setMapReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setMapError('Google Maps could not load. Check your connection and Maps configuration, then retry.');
          setMapLoading(false);
        }
      });
    return () => {
      cancelled = true;
      clustererRef.current?.clearMarkers();
      clustererRef.current?.setMap(null);
      clustererRef.current = null;
      mapRef.current = null;
      mapsApiRef.current = null;
    };
  }, [mapAttempt, navigate]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    mapRef.current.setOptions({ styles: effectiveTheme === 'dark' ? DARK_MAP_STYLE : [] });
  }, [effectiveTheme, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapContainerRef.current || !mapsApiRef.current) return undefined;
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    const observer = new ResizeObserver(() => {
      const center = map.getCenter();
      mapsApi.event.trigger(map, 'resize');
      if (center) map.setCenter(center);
    });
    observer.observe(mapContainerRef.current);
    return () => observer.disconnect();
  }, [mapReady]);

  const locatedUsers = useMemo(
    () => users.filter((user) => validCoordinates(user)),
    [users],
  );
  const filteredUsers = useMemo(() => {
    const filters = { query: search.trim().toLocaleLowerCase(), roleFilter, statusFilter };
    return locatedUsers.filter((user) => matchesFilters(user, filters));
  }, [locatedUsers, roleFilter, search, statusFilter]);
  const missingUsers = useMemo(
    () => users.filter((user) => !validCoordinates(user)),
    [users],
  );
  const filteredMissingUsers = useMemo(() => {
    const filters = { query: search.trim().toLocaleLowerCase(), roleFilter, statusFilter };
    return missingUsers.filter((user) => matchesFilters(user, filters));
  }, [missingUsers, roleFilter, search, statusFilter]);
  const searchResults = useMemo(
    () => [...filteredUsers, ...filteredMissingUsers]
      .sort((left, right) => (left.name || '').localeCompare(right.name || '')),
    [filteredMissingUsers, filteredUsers],
  );
  const hasFilters = Boolean(search || roleFilter || statusFilter);

  useEffect(() => {
    const clusterer = clustererRef.current;
    const mapsApi = mapsApiRef.current;
    const map = mapRef.current;
    if (!mapReady || !clusterer || !mapsApi || !map) return;

    infoWindowRef.current?.close();
    const markers = filteredUsers.map((user) => {
      const marker = createRoleMarker(mapsApi, user);
      markerUsersRef.current.set(marker, user);
      const infoWindow = new mapsApi.InfoWindow({
        content: markerInfoContent(user, (id) => {
          infoWindow.close();
          navigate(`/admin-users?user=${encodeURIComponent(id)}`);
        }),
        maxWidth: 340,
      });
      marker.addListener('click', () => {
        infoWindowRef.current?.close();
        infoWindow.open({ map, anchor: marker });
        infoWindowRef.current = infoWindow;
      });
      return marker;
    });
    clusterer.clearMarkers();
    clusterer.addMarkers(markers);
    return () => {
      markers.forEach((marker) => mapsApi.event.clearInstanceListeners(marker));
      infoWindowRef.current?.close();
    };
  }, [filteredUsers, mapReady, navigate]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const mapUsers = hasFilters ? filteredUsers : locatedUsers;
    const coordinates = mapUsers.map(validCoordinates).filter(Boolean);
    if (!coordinates.length) {
      if (!hasFilters) {
        mapRef.current.setCenter(CEBU_CENTER);
        mapRef.current.setZoom(7);
      }
      return;
    }
    if (coordinates.length === 1) {
      mapRef.current.setCenter(coordinates[0]);
      mapRef.current.setZoom(14);
      return;
    }
    const bounds = new mapsApiRef.current.LatLngBounds();
    coordinates.forEach((position) => bounds.extend(position));
    mapRef.current.fitBounds(bounds, 48);
  }, [filteredUsers, hasFilters, locatedUsers, mapReady]);

  const farmerCount = locatedUsers.filter((user) => user.role === 'farmer').length;
  const buyerCount = locatedUsers.filter((user) => user.role === 'buyer').length;
  const stakeholderCount = locatedUsers.filter((user) => user.role === 'stakeholder').length;
  const missingLocationCount = Math.max(0, totalUsers - locatedUsers.length);
  const resetFilters = () => {
    setSearch('');
    setRoleFilter('');
    setStatusFilter('');
  };
  const refreshLocations = () => {
    setIsLoading(true);
    setLoadError('');
    setRefreshVersion((version) => version + 1);
  };
  const retryMap = () => {
    setMapLoading(true);
    setMapError('');
    setMapAttempt((attempt) => attempt + 1);
  };
  const notifyUser = async (user) => {
    setReminderState((previous) => ({ ...previous, [user.id]: { status: 'sending', message: '' } }));
    try {
      await sendAdminLocationReminder(user.id);
      setReminderState((previous) => ({ ...previous, [user.id]: { status: 'sent', message: 'Reminder sent.' } }));
    } catch (error) {
      setReminderState((previous) => ({ ...previous, [user.id]: { status: 'error', message: error.message } }));
    }
  };

  return (
    <AppShell
      user={currentUser}
      navItems={adminNavItems}
      title="User Locations"
      hideHeader
      pageClassName="admin-user-locations-page"
    >
      <PageHeader
        title="User Locations"
        description="Explore saved profile locations for registered Farmers, Buyers, and Stakeholders."
        action={(
          <button
            type="button"
            className="admin-location-refresh"
            onClick={refreshLocations}
            disabled={isLoading}
          >
            <RefreshCw size={15} className={isLoading ? 'is-spinning' : ''} />
            Refresh locations
          </button>
        )}
      />

      <section className="admin-location-summary" aria-label="Registered user location summary">
        <SummaryItem label="Total Registered Users" value={totalUsers} />
        <SummaryItem label="Farmers on Map" value={farmerCount} tone="farmer" />
        <SummaryItem label="Buyers on Map" value={buyerCount} tone="buyer" />
        <SummaryItem label="Stakeholders on Map" value={stakeholderCount} tone="stakeholder" />
        <SummaryItem label="Users Without Saved Locations" value={missingLocationCount} tone="missing" />
      </section>

      <section className="admin-location-toolbar" aria-label="Map filters">
        <label className="admin-location-search">
          <span>Search registered users</span>
          <span className="admin-location-search-input">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              maxLength={160}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, email, farm, organization, or address"
            />
          </span>
        </label>
        <label>
          <span>User type</span>
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            <option value="">All Users</option>
            <option value="farmer">Farmers</option>
            <option value="buyer">Buyers</option>
            <option value="stakeholder">Stakeholders</option>
          </select>
        </label>
        <label>
          <span>Account status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All account statuses</option>
            <option value="active">Active Accounts</option>
            <option value="pending">Pending Accounts</option>
            <option value="suspended">Suspended Accounts</option>
            <option value="deactivated">Deactivated Accounts</option>
          </select>
        </label>
        <button type="button" className="admin-location-reset" onClick={resetFilters} disabled={!hasFilters}>
          <RotateCcw size={14} /> Reset filters
        </button>
      </section>
      {hasFilters ? (
        <section className="admin-location-search-results" aria-label="Search results">
          <div className="admin-location-search-results-heading">
            <h2>Search results</h2>
            <span role="status" aria-live="polite">
              {searchResults.length.toLocaleString()} {searchResults.length === 1 ? 'account' : 'accounts'}
            </span>
          </div>
          {searchResults.length ? (
            <>
              <div className="admin-location-search-result-list" role="list">
                {searchResults.map((user) => {
                  const hasLocation = Boolean(validCoordinates(user));
                  return (
                    <div className="admin-location-search-result" key={user.id} role="listitem">
                      <div className="admin-location-search-result-info">
                        <strong>{user.name || 'Registered user'}</strong>
                        <div className="admin-location-search-result-meta">
                          <span className={`admin-location-role-tag is-${user.role}`}>{ROLE_LABELS[user.role]}</span>
                          {user.email ? <span>{user.email}</span> : null}
                        </div>
                        {user.farmName || user.organizationName ? (
                          <span>{user.farmName || user.organizationName}</span>
                        ) : null}
                        <span>{registeredAddress(user)}</span>
                        <div className="admin-location-search-result-meta">
                          <span className="admin-location-result-status">{accountStatusLabel(user)}</span>
                          <span className={`admin-location-result-location ${hasLocation ? 'has-location' : ''}`}>
                            {hasLocation ? 'Saved map location' : 'No saved location'}
                          </span>
                        </div>
                        {reminderState[user.id]?.message ? (
                          <small
                            className={`admin-location-reminder-feedback is-${reminderState[user.id].status}`}
                            role={reminderState[user.id].status === 'error' ? 'alert' : 'status'}
                          >
                            {reminderState[user.id].message}
                          </small>
                        ) : null}
                      </div>
                      <div className="admin-location-search-result-actions">
                        {!hasLocation ? (
                          <button
                            type="button"
                            className="admin-location-notify"
                            onClick={() => notifyUser(user)}
                            disabled={['sending', 'sent'].includes(reminderState[user.id]?.status)}
                          >
                            {reminderState[user.id]?.status === 'sending'
                              ? 'Sending…'
                              : reminderState[user.id]?.status === 'sent' ? 'Reminder sent' : 'Notify user'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => navigate(`/admin-users?user=${encodeURIComponent(user.id)}`)}
                        >
                          View Profile
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="admin-location-search-results-empty">No accounts match your search and filters.</p>
          )}
        </section>
      ) : null}

      <div className="admin-location-map-heading">
        <div>
          <h2>Registered account locations</h2>
          <p>Markers use saved profile coordinates, not live GPS locations.</p>
        </div>
        <div className="admin-location-legend" aria-label="Map marker colors">
          {Object.entries(ROLE_LABELS).map(([role, label]) => (
            <span key={role}><i style={{ backgroundColor: ROLE_COLORS[role] }} />{label}</span>
          ))}
        </div>
      </div>

      {loadError ? (
        <div className="form-alert error admin-location-error" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={refreshLocations}>Try again</button>
        </div>
      ) : null}
      {mapError ? (
        <div className="form-alert error admin-location-error" role="alert">
          <span>{mapError}</span>
          <button type="button" onClick={retryMap}>Retry map</button>
        </div>
      ) : null}
      {isLoading ? <p className="admin-location-loading" role="status"><Users size={16} /> Loading registered user locations...</p> : null}
      {!isLoading && !loadError && locatedUsers.length === 0 ? (
        <div className="admin-location-empty" role="status">
          <MapPin size={20} />
          <div>
            <strong>No users have saved map locations</strong>
            <p>Registered accounts without valid saved coordinates are counted above and are not assigned an estimated marker.</p>
          </div>
        </div>
      ) : null}
      {!isLoading && !loadError && filteredUsers.length === 0 && filteredMissingUsers.length === 0 ? (
        <div className="admin-location-empty" role="status">
          <Search size={19} />
          <div><strong>No users match these filters</strong><p>Reset filters or try a different search.</p></div>
        </div>
      ) : null}
      {!isLoading && !loadError && filteredUsers.length === 0 && filteredMissingUsers.length > 0 ? (
        <div className="admin-location-empty" role="status">
          <MapPin size={19} />
          <div><strong>Matching accounts have no saved map locations</strong><p>They appear in Users Without Saved Locations below, but cannot be shown as map markers.</p></div>
        </div>
      ) : null}
      {!isLoading && !loadError && missingUsers.length > 0 ? (
        <details className="admin-location-missing-list">
          <summary>
            <span>Users Without Saved Locations</span>
            <strong>{missingLocationCount.toLocaleString()}</strong>
          </summary>
          <p>These profiles have no valid saved coordinates and are not shown as map markers. Notify them to complete their profile location, or open their profile to review the registered details.</p>
          {filteredMissingUsers.length ? (
            <ul>
              {filteredMissingUsers.slice(0, 100).map((user) => (
                <li key={user.id}>
                  <div>
                    <strong>{user.name || 'Registered user'}</strong>
                    <span>{ROLE_LABELS[user.role]} · {registeredAddress(user)}</span>
                    {reminderState[user.id]?.message ? (
                      <small
                        className={`admin-location-reminder-feedback is-${reminderState[user.id].status}`}
                        role={reminderState[user.id].status === 'error' ? 'alert' : 'status'}
                      >
                        {reminderState[user.id].message}
                      </small>
                    ) : null}
                  </div>
                  <div className="admin-location-missing-actions">
                    <button
                      type="button"
                      className="admin-location-notify"
                      onClick={() => notifyUser(user)}
                      disabled={['sending', 'sent'].includes(reminderState[user.id]?.status)}
                    >
                      {reminderState[user.id]?.status === 'sending'
                        ? 'Sending…'
                        : reminderState[user.id]?.status === 'sent' ? 'Reminder sent' : 'Notify user'}
                    </button>
                    <button type="button" onClick={() => navigate(`/admin-users?user=${encodeURIComponent(user.id)}`)}>
                      View Profile
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="admin-location-missing-empty">No missing-location accounts match the current filters.</p>}
          {filteredMissingUsers.length > 100 ? <p className="admin-location-missing-empty">Showing 100 of {filteredMissingUsers.length.toLocaleString()} matching accounts. Search to narrow the list.</p> : null}
        </details>
      ) : null}
      {mapLoading ? <p className="admin-location-loading" role="status">Loading Google Maps...</p> : null}
      <div className="admin-location-map-frame">
        <div ref={mapContainerRef} className="admin-location-map" aria-label="Map of registered user locations" />
        {mapError ? <div className="admin-location-map-fallback" role="status">Map unavailable</div> : null}
      </div>
    </AppShell>
  );
}
