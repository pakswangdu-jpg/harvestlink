import { Award, MapPin, Search, Tag, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import ProductCard from '../../components/cards/ProductCard';
import EmptyState from '../../components/common/EmptyState';
import { useAuth } from '../auth/AuthContext';
import { getActiveProducts } from '../../services/productService';
import { CEBU_MUNICIPALITIES, PRODUCT_GRADES, SELLING_TYPES } from '../../utils/constants';
import { getNavItemsForRole } from '../../utils/navItemsByRole';

export default function Marketplace() {
  const { currentUser } = useAuth();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('search') || '');
  // Defaults to the signed-in account's own municipality so each buyer/farmer/partner org
  // sees their own local market first — "All locations" is one click away, never a dead end.
  const [location, setLocation] = useState(() => currentUser.municipality || '');
  const [grade, setGrade] = useState('');
  const [sellingType, setSellingType] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const products = getActiveProducts();
  const navItems = getNavItemsForRole(currentUser.role);

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesQuery = !normalized || [product.name, product.category, product.location, product.farmerName]
        .join(' ')
        .toLowerCase()
        .includes(normalized);
      const matchesLocation = !location || product.location === location;
      const matchesGrade = !grade || product.grade === grade;
      const matchesSellingType = !sellingType || product.sellingType === sellingType;
      const matchesMinPrice = !minPrice || product.price >= Number(minPrice);
      const matchesMaxPrice = !maxPrice || product.price <= Number(maxPrice);
      return matchesQuery && matchesLocation && matchesGrade && matchesSellingType && matchesMinPrice && matchesMaxPrice;
    });
  }, [products, query, location, grade, sellingType, minPrice, maxPrice]);

  const hasActiveFilters = Boolean(query || location || grade || sellingType || minPrice || maxPrice);
  const clearFilters = () => {
    setQuery('');
    setLocation('');
    setGrade('');
    setSellingType('');
    setMinPrice('');
    setMaxPrice('');
  };

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
          <label className="location-filter" htmlFor="marketplace-grade">
            <Award size={16} />
            <select id="marketplace-grade" value={grade} onChange={(event) => setGrade(event.target.value)}>
              <option value="">All grades</option>
              {PRODUCT_GRADES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="location-filter" htmlFor="marketplace-selling-type">
            <Tag size={16} />
            <select id="marketplace-selling-type" value={sellingType} onChange={(event) => setSellingType(event.target.value)}>
              <option value="">All selling types</option>
              {SELLING_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <div className="location-filter price-range-filter">
            <Wallet size={16} />
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={minPrice}
              onChange={(event) => setMinPrice(event.target.value)}
              placeholder="Min ₱"
              aria-label="Minimum price"
            />
            <span className="price-range-separator">–</span>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
              placeholder="Max ₱"
              aria-label="Maximum price"
            />
          </div>
        </div>
      </section>

      {filteredProducts.length ? (
        <section className="product-grid">
          {filteredProducts.map((product) => <ProductCard key={product.id} product={product} />)}
        </section>
      ) : (
        <EmptyState
          title="No matching products"
          message={hasActiveFilters ? 'No active listings match your filters right now.' : 'Check back when farmers add new harvests.'}
          actionLabel={hasActiveFilters ? 'Clear filters' : undefined}
          onAction={hasActiveFilters ? clearFilters : undefined}
        />
      )}
    </AppShell>
  );
}
