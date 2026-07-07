import { useMemo, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import FarmerMap from '../../components/map/FarmerMap';
import EmptyState from '../../components/common/EmptyState';
import { useAuth } from '../auth/AuthContext';
import { getBuyers, getVerifiedFarmers } from '../../services/authService';
import { getInitials } from '../../utils/formatters';
import { farmerNavItems } from '../farmer/farmerNav';
import { buyerNavItems } from '../buyer/buyerNav';

const NAV_ITEMS_BY_ROLE = {
  farmer: farmerNavItems,
  buyer: buyerNavItems,
};

export default function FarmerMapPage() {
  const { currentUser } = useAuth();
  const navItems = NAV_ITEMS_BY_ROLE[currentUser.role];
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const farmers = useMemo(() => getVerifiedFarmers(), []);
  const buyers = useMemo(() => getBuyers(), []);

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

  const hasAnyAccounts = farmers.length > 0 || buyers.length > 0;

  return (
    <AppShell
      user={currentUser}
      navItems={navItems}
      title="Farmer map"
      subtitle="Trace every DTI-approved farmer and registered buyer across Cebu — pick a pin or a name to see their details."
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
              </p>
              <FarmerMap farmers={filteredFarmers} buyers={filteredBuyers} selectedId={selectedId} onSelectPin={setSelectedId} />
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
            </div>
          </section>
        </>
      ) : (
        <EmptyState title="No accounts yet" message="Once farmers are DTI-verified and buyers register, they'll appear here and on the map." />
      )}
    </AppShell>
  );
}
