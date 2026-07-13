import { useEffect, useMemo, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import FarmerMap from '../../components/map/FarmerMap';
import EmptyState from '../../components/common/EmptyState';
import { useAuth } from '../auth/AuthContext';
import { getBuyers, getStakeholders, getVerifiedFarmers } from '../../services/authService';
import { getOrdersByBuyer } from '../../services/orderService';
import { getActiveProducts } from '../../services/productService';
import { getInitials } from '../../utils/formatters';
import { getNavItemsForRole } from '../../utils/navItemsByRole';

// Matches the ~4s live-refresh cadence used everywhere else in the app (orders, messages,
// notifications) — keeps presence dots and the contactable-farmer set from going stale
// while the map is left open.
const REFRESH_MS = 4000;

export default function FarmerMapPage() {
  const { currentUser } = useAuth();
  const navItems = getNavItemsForRole(currentUser.role);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [farmers, setFarmers] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [stakeholders, setStakeholders] = useState([]);
  const [contactableFarmerOrderIds, setContactableFarmerOrderIds] = useState({});
  const [farmersWithProducts, setFarmersWithProducts] = useState(() => new Set());

  useEffect(() => {
    const reload = () => {
      getVerifiedFarmers().then(setFarmers);
      getBuyers().then(setBuyers);
      getStakeholders().then(setStakeholders);
      getActiveProducts().then((products) => {
        setFarmersWithProducts(new Set(products.map((product) => product.farmerId)));
      });
      if (currentUser.role === 'buyer') {
        // Newest-first (see backend/src/controllers/orders.controller.js) — first
        // occurrence wins, so each farmer maps to the buyer's most recent order with them.
        getOrdersByBuyer(currentUser.id).then((orders) => {
          const lookup = {};
          orders.forEach((order) => {
            if (!(order.farmerId in lookup)) lookup[order.farmerId] = order.id;
          });
          setContactableFarmerOrderIds(lookup);
        });
      }
    };
    reload();
    const interval = setInterval(reload, REFRESH_MS);
    return () => clearInterval(interval);
  }, [currentUser.id, currentUser.role]);

  const filteredFarmers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return farmers;
    return farmers.filter((farmer) =>
      [farmer.name, farmer.farmName, farmer.municipality].join(' ').toLowerCase().includes(normalized)
    );
  }, [farmers, query]);

  const filteredBuyers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return buyers;
    return buyers.filter((buyer) =>
      [buyer.name, buyer.municipality].join(' ').toLowerCase().includes(normalized)
    );
  }, [buyers, query]);

  const filteredStakeholders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return stakeholders;
    return stakeholders.filter((stakeholder) =>
      [stakeholder.organizationName, stakeholder.name, stakeholder.municipality].join(' ').toLowerCase().includes(normalized)
    );
  }, [stakeholders, query]);

  const hasAnyAccounts = farmers.length > 0 || buyers.length > 0 || stakeholders.length > 0;

  return (
    <AppShell
      user={currentUser}
      navItems={navItems}
      title="View Map"
      subtitle="Trace every DTI-approved farmer, registered buyer, and partner stakeholder across Cebu — pick a pin or a name to see their details."
    >
      {hasAnyAccounts ? (
        <>
          <section className="panel marketplace-toolbar">
            <label className="search-field" htmlFor="farmer-map-search">
              <Search size={18} />
              <input
                id="farmer-map-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, farm name, or municipality"
              />
            </label>
          </section>

          <section className="content-grid two uneven">
            <div className="panel">
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
                contactableFarmerOrderIds={contactableFarmerOrderIds}
                farmersWithProducts={farmersWithProducts}
              />
            </div>

            <div className="panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Directory</p>
                  <h2>{filteredFarmers.length} approved farmer{filteredFarmers.length === 1 ? '' : 's'}</h2>
                </div>
              </div>
              {filteredFarmers.length ? (
                <div className="farmer-list">
                  {filteredFarmers.map((farmer) => (
                    <button
                      key={farmer.id}
                      type="button"
                      className={`farmer-list-item ${selectedId === farmer.id ? 'active' : ''}`}
                      onClick={() => setSelectedId(farmer.id)}
                    >
                      <span className="farmer-list-avatar">{getInitials(farmer.name)}</span>
                      <span className="farmer-list-text">
                        <strong>{farmer.farmName || farmer.name}</strong>
                        <span className="muted"><MapPin size={13} /> {farmer.municipality}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState title="No matching farmers" message="Try a different search term." />
              )}

              <div className="section-heading">
                <div>
                  <p className="eyebrow">Directory</p>
                  <h2>{filteredBuyers.length} registered buyer{filteredBuyers.length === 1 ? '' : 's'}</h2>
                </div>
              </div>
              {filteredBuyers.length ? (
                <div className="farmer-list">
                  {filteredBuyers.map((buyer) => (
                    <button
                      key={buyer.id}
                      type="button"
                      className={`farmer-list-item ${selectedId === buyer.id ? 'active' : ''}`}
                      onClick={() => setSelectedId(buyer.id)}
                    >
                      <span className="farmer-list-avatar buyer">{getInitials(buyer.name)}</span>
                      <span className="farmer-list-text">
                        <strong>{buyer.name}</strong>
                        <span className="muted"><MapPin size={13} /> {buyer.municipality}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState title="No matching buyers" message="Try a different search term." />
              )}

              <div className="section-heading">
                <div>
                  <p className="eyebrow">Directory</p>
                  <h2>{filteredStakeholders.length} registered stakeholder{filteredStakeholders.length === 1 ? '' : 's'}</h2>
                </div>
              </div>
              {filteredStakeholders.length ? (
                <div className="farmer-list">
                  {filteredStakeholders.map((stakeholder) => (
                    <button
                      key={stakeholder.id}
                      type="button"
                      className={`farmer-list-item ${selectedId === stakeholder.id ? 'active' : ''}`}
                      onClick={() => setSelectedId(stakeholder.id)}
                    >
                      <span className="farmer-list-avatar stakeholder">{getInitials(stakeholder.organizationName || stakeholder.name)}</span>
                      <span className="farmer-list-text">
                        <strong>{stakeholder.organizationName || stakeholder.name}</strong>
                        <span className="muted"><MapPin size={13} /> {stakeholder.municipality}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState title="No matching stakeholders" message="Try a different search term." />
              )}
            </div>
          </section>
        </>
      ) : (
        <EmptyState title="No accounts yet" message="Once farmers are ADMIN-verified and buyers register, they'll appear here and on the map." />
      )}
    </AppShell>
  );
}
