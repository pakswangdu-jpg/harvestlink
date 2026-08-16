import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, MessageCircle, Package, Phone, Search, Store, Users } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import FarmerMap from '../../components/map/FarmerMap';
import EmptyState from '../../components/common/EmptyState';
import noAccountsIcon from '../../assets/icons/map-no-accounts.png';
import noLocationIcon from '../../assets/icons/map-no-location.png';
import noMatchIcon from '../../assets/icons/directory-no-match.png';
import { useAuth } from '../auth/AuthContext';
import { getBuyers, getStakeholders, getVerifiedFarmers } from '../../services/authService';
import { getActiveProducts } from '../../services/productService';
import { getInitials, isRecentlyActive } from '../../utils/formatters';
import { getNavItemsForRole } from '../../utils/navItemsByRole';

// Matches the ~4s live-refresh cadence used everywhere else in the app (orders, messages,
// notifications) — keeps presence dots current while the map is left open.
const REFRESH_MS = 4000;

// One row style shared by all three directory groups (farmers/buyers/stakeholders) instead
// of three near-identical blocks — same markup/behavior as before, just consolidated.
function DirectoryGroup({
  label, avatarClass, items, selectedId, onSelect, currentUserId, emptyMessage, itemRefs,
}) {
  return (
    <div className="directory-group">
      <p className="directory-group-label">
        {label} <span className="directory-group-count">{items.length}</span>
      </p>
      {items.length ? (
        <div className="farmer-list">
          {items.map((item) => (
            <button
              key={item.id}
              ref={(node) => { itemRefs.current[item.id] = node; }}
              type="button"
              className={`farmer-list-item ${selectedId === item.id ? 'active' : ''}`}
              onClick={() => onSelect(item.id)}
            >
              <span className={`farmer-list-avatar ${avatarClass}`}>
                {item.avatarUrl ? <img src={item.avatarUrl} alt="" /> : getInitials(item.avatarSeed)}
              </span>
              <span className="farmer-list-text">
                <strong>{item.displayName}{item.id === currentUserId ? ' (You)' : ''}</strong>
                <span className="muted"><MapPin size={13} /> {item.municipality}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          compact
          className="empty-state-transparent-icon"
          iconSrc={noMatchIcon}
          title={emptyMessage}
          message="Try a different search term."
        />
      )}
    </div>
  );
}

export default function FarmerMapPage() {
  const { currentUser } = useAuth();
  const navItems = getNavItemsForRole(currentUser.role);
  const [query, setQuery] = useState('');
  // Lets someone jump straight to just the group they care about instead of scrolling past
  // the other two directories to find it — 'all' keeps today's combined view as the default.
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [farmers, setFarmers] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [stakeholders, setStakeholders] = useState([]);
  const [farmersWithProducts, setFarmersWithProducts] = useState(() => new Set());
  const directoryItemRefs = useRef({});
  const selectedLocationRef = useRef(null);

  useEffect(() => {
    const reload = () => {
      getVerifiedFarmers().then(setFarmers);
      getBuyers().then(setBuyers);
      getStakeholders().then(setStakeholders);
      getActiveProducts().then((products) => {
        setFarmersWithProducts(new Set(products.map((product) => product.farmerId)));
      });
    };
    reload();
    const interval = setInterval(reload, REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  const showFarmers = typeFilter === 'all' || typeFilter === 'farmer';
  const showBuyers = typeFilter === 'all' || typeFilter === 'buyer';
  const showStakeholders = typeFilter === 'all' || typeFilter === 'stakeholder';

  const filteredFarmers = useMemo(() => {
    if (!showFarmers) return [];
    const normalized = query.trim().toLowerCase();
    const base = !normalized
      ? farmers
      : farmers.filter((farmer) =>
        [farmer.name, farmer.farmName, farmer.municipality].join(' ').toLowerCase().includes(normalized)
      );
    return base.map((farmer) => (
      { ...farmer, displayName: farmer.farmName || farmer.name, avatarSeed: farmer.name, role: 'farmer' }
    ));
  }, [farmers, query, showFarmers]);

  const filteredBuyers = useMemo(() => {
    if (!showBuyers) return [];
    const normalized = query.trim().toLowerCase();
    const base = !normalized
      ? buyers
      : buyers.filter((buyer) => [buyer.name, buyer.municipality].join(' ').toLowerCase().includes(normalized));
    return base.map((buyer) => ({ ...buyer, displayName: buyer.name, avatarSeed: buyer.name, role: 'buyer' }));
  }, [buyers, query, showBuyers]);

  const filteredStakeholders = useMemo(() => {
    if (!showStakeholders) return [];
    const normalized = query.trim().toLowerCase();
    const base = !normalized
      ? stakeholders
      : stakeholders.filter((stakeholder) =>
        [stakeholder.organizationName, stakeholder.name, stakeholder.municipality].join(' ').toLowerCase().includes(normalized)
      );
    return base.map((stakeholder) => {
      const displayName = stakeholder.organizationName || stakeholder.name;
      return { ...stakeholder, displayName, avatarSeed: displayName, role: 'stakeholder' };
    });
  }, [stakeholders, query, showStakeholders]);

  const hasAnyAccounts = farmers.length > 0 || buyers.length > 0 || stakeholders.length > 0;

  // The one record the currently selected marker/directory row refers to, if any — looked
  // up across all three already-filtered lists rather than the raw farmers/buyers/
  // stakeholders state, so "select a marker, then narrow the search" still resolves to the
  // same visible record instead of one that's now hidden.
  const selected = useMemo(() => {
    if (!selectedId) return null;
    return filteredFarmers.find((item) => item.id === selectedId)
      || filteredBuyers.find((item) => item.id === selectedId)
      || filteredStakeholders.find((item) => item.id === selectedId)
      || null;
  }, [selectedId, filteredFarmers, filteredBuyers, filteredStakeholders]);

  // Selecting a marker on the map should surface the matching row in the directory list even
  // if it's currently scrolled out of view — the directory is meant to work as a navigation
  // panel, not just a static list. Same reasoning for the "Selected location" detail panel
  // below the map/directory split — it starts out of view on most screens, so clicking a pin
  // or a directory row should bring the details into view too, instead of leaving the farmer/
  // buyer/stakeholder to scroll down and find it themselves.
  useEffect(() => {
    if (!selectedId) return;
    directoryItemRefs.current[selectedId]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    selectedLocationRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  const isYou = selected?.id === currentUser.id;
  const selectedOnline = selected ? isRecentlyActive(selected.lastActiveAt) : false;
  const selectedHasProducts = selected?.role === 'farmer' && farmersWithProducts.has(selected.id);
  const avatarClassByRole = { farmer: '', buyer: 'buyer', stakeholder: 'stakeholder' };
  const roleLabel = { farmer: 'Farmer', buyer: 'Buyer', stakeholder: 'Stakeholder' };
  const legendDotByRole = { farmer: 'origin', buyer: 'destination', stakeholder: 'stakeholder' };

  return (
    <AppShell
      user={currentUser}
      navItems={navItems}
      title="Nearby"
      subtitle="Find nearby verified farmers and buyers across Cebu."
      wide
    >
      {hasAnyAccounts ? (
        <>
          <section className="panel marketplace-toolbar">
            <div className="marketplace-filters">
              <label className="search-field" htmlFor="farmer-map-search">
                <Search size={18} />
                <input
                  id="farmer-map-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by name, farm name, or municipality"
                />
              </label>
              <label className="location-filter" htmlFor="farmer-map-type">
                <Users size={16} />
                <select id="farmer-map-type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                  <option value="all">All types</option>
                  <option value="farmer">Farmers</option>
                  <option value="buyer">Buyers</option>
                  <option value="stakeholder">Stakeholders</option>
                </select>
              </label>
            </div>
          </section>

          <section className="content-grid two map-directory-split">
            <div className="panel map-panel-fill">
              <p className="map-legend">
                <span className="legend-dot origin" /> Farmer
                <span className="legend-dot destination" /> Buyer
                <span className="legend-dot stakeholder" /> Stakeholder
              </p>
              <FarmerMap
                farmers={filteredFarmers}
                buyers={filteredBuyers}
                stakeholders={filteredStakeholders}
                selectedId={selectedId}
                onSelectPin={setSelectedId}
                farmersWithProducts={farmersWithProducts}
                currentUserId={currentUser.id}
              />
            </div>

            <div className="panel">
              <div className="directory-scroll">
                {showFarmers ? (
                  <DirectoryGroup
                    label="Farmers"
                    avatarClass=""
                    items={filteredFarmers}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    currentUserId={currentUser.id}
                    emptyMessage="No matching farmers"
                    itemRefs={directoryItemRefs}
                  />
                ) : null}
                {showBuyers ? (
                  <DirectoryGroup
                    label="Buyers"
                    avatarClass="buyer"
                    items={filteredBuyers}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    currentUserId={currentUser.id}
                    emptyMessage="No matching buyers"
                    itemRefs={directoryItemRefs}
                  />
                ) : null}
                {showStakeholders ? (
                  <DirectoryGroup
                    label="Stakeholders"
                    avatarClass="stakeholder"
                    items={filteredStakeholders}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    currentUserId={currentUser.id}
                    emptyMessage="No matching stakeholders"
                    itemRefs={directoryItemRefs}
                  />
                ) : null}
              </div>
            </div>
          </section>

          <section className="panel selected-location-panel" ref={selectedLocationRef}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Selected location</p>
                <h2>{selected ? selected.displayName : 'Details'}</h2>
              </div>
            </div>

            {selected ? (
              <div className="selected-location">
                <div className="selected-location-identity">
                  <span className={`selected-location-avatar ${avatarClassByRole[selected.role]}`}>
                    {selected.avatarUrl ? <img src={selected.avatarUrl} alt="" /> : getInitials(selected.avatarSeed)}
                  </span>
                  <div>
                    <p className="selected-location-name">
                      {selected.displayName}{isYou ? ' (You)' : ''}
                    </p>
                    <p className="selected-location-role">
                      <span className={`legend-dot ${legendDotByRole[selected.role]}`} /> {roleLabel[selected.role]}
                    </p>
                  </div>
                </div>

                <div className="selected-location-facts">
                  <div className="selected-location-fact">
                    <span>Municipality</span>
                    <strong><MapPin size={14} /> {selected.municipality}</strong>
                  </div>
                  {selected.role === 'stakeholder' && selected.contactPerson ? (
                    <div className="selected-location-fact">
                      <span>Contact person</span>
                      <strong>{selected.contactPerson}</strong>
                    </div>
                  ) : null}
                  {selected.contactNumber ? (
                    <div className="selected-location-fact">
                      <span>Contact number</span>
                      <strong><Phone size={14} /> {selected.contactNumber}</strong>
                    </div>
                  ) : null}
                  <div className="selected-location-fact">
                    <span>Status</span>
                    <strong>
                      <span className={`presence-dot ${selectedOnline ? 'online' : 'offline'}`} />
                      {selectedOnline ? 'Online' : 'Offline'}
                    </strong>
                  </div>
                  {selected.role === 'farmer' ? (
                    <div className="selected-location-fact">
                      <span>Listings</span>
                      <strong><Store size={14} /> {selectedHasProducts ? 'Has active products' : 'No products listed'}</strong>
                    </div>
                  ) : null}
                </div>

                <div className="selected-location-actions">
                  {selected.role === 'farmer' && selectedHasProducts ? (
                    <a
                      className="btn btn-secondary btn-md"
                      href={`/marketplace?farmerId=${selected.id}&farmerName=${encodeURIComponent(selected.displayName)}`}
                    >
                      <Package size={16} /> View products
                    </a>
                  ) : null}
                  {!isYou ? (
                    <a className="btn btn-primary btn-md" href={`/messages/direct/${selected.id}`}>
                      <MessageCircle size={16} /> Contact {roleLabel[selected.role].toLowerCase()}
                    </a>
                  ) : null}
                </div>
              </div>
            ) : (
              <EmptyState
                compact
                className="empty-state-transparent-icon"
                iconSrc={noLocationIcon}
                title="No location selected"
                message="Click a marker on the map or a name in the directory to see details here."
              />
            )}
          </section>
        </>
      ) : (
        <EmptyState className="empty-state-transparent-icon" iconSrc={noAccountsIcon} title="No accounts yet" message="Once farmers are ADMIN-verified and buyers register, they'll appear here and on the map." />
      )}
    </AppShell>
  );
}
