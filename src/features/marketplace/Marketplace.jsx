import { MapPin, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import ProductCard from '../../components/cards/ProductCard';
import EmptyState from '../../components/common/EmptyState';
import { useAuth } from '../auth/AuthContext';
import { getActiveProducts } from '../../services/productService';
import { CEBU_MUNICIPALITIES } from '../../utils/constants';
import { buyerNavItems } from '../buyer/buyerNav';
import { farmerNavItems } from '../farmer/farmerNav';

export default function Marketplace() {
  const { currentUser } = useAuth();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('search') || '');
  // Defaults to the signed-in account's own municipality so each buyer/farmer sees
  // their own local market first — "All locations" is one click away, never a dead end.
  const [location, setLocation] = useState(() => currentUser.municipality || '');
  const products = getActiveProducts();
  const navItems = currentUser.role === 'farmer' ? farmerNavItems : buyerNavItems;

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesQuery = !normalized || [product.name, product.category, product.location, product.farmerName]
        .join(' ')
        .toLowerCase()
        .includes(normalized);
      const matchesLocation = !location || product.location === location;
      return matchesQuery && matchesLocation;
    });
  }, [products, query, location]);

  return (
    <AppShell
      user={currentUser}
      navItems={navItems}
      title="Marketplace"
      subtitle="Find active produce listings from Cebu farmers."
    >
      <section className="panel marketplace-toolbar">
        <div className="marketplace-filters">
          <label className="search-field" htmlFor="marketplace-search">
            <Search size={18} />
            <input
              id="marketplace-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by product, category, farmer, or location"
            />
          </label>
          <label className="location-filter" htmlFor="marketplace-location">
            <MapPin size={16} />
            <select id="marketplace-location" value={location} onChange={(event) => setLocation(event.target.value)}>
              <option value="">All locations</option>
              {CEBU_MUNICIPALITIES.map((municipality) => <option key={municipality} value={municipality}>{municipality}</option>)}
            </select>
          </label>
        </div>
      </section>

      {filteredProducts.length ? (
        <section className="product-grid">
          {filteredProducts.map((product) => <ProductCard key={product.id} product={product} />)}
        </section>
      ) : (
        <EmptyState
          title="No matching products"
          message={location ? `No active listings in ${location} right now.` : 'Try another search or check back when farmers add new harvests.'}
          actionLabel={location ? 'Show all locations' : undefined}
          onAction={location ? () => setLocation('') : undefined}
        />
      )}
    </AppShell>
  );
}
