import { Award, MapPin, Navigation, Search, Tag, Wallet, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import ProductCard from '../../components/cards/ProductCard';
import EmptyState from '../../components/common/EmptyState';
import { useAuth } from '../auth/AuthContext';
import { getActiveProducts } from '../../services/productService';
import { CEBU_MUNICIPALITIES, getMunicipalityCoords, PRODUCT_GRADES, SELLING_TYPES } from '../../utils/constants';
import { haversineKm } from '../../utils/geo';
import { getNavItemsForRole } from '../../utils/navItemsByRole';

// Straight-line distance from the buyer's own municipality, same geographic model
// deliveryFee.js/estimateDeliveryFee already use for the checkout fee estimate — a rough
// proxy for delivery cost/time, not a routed distance.
const DISTANCE_OPTIONS = [
  { value: '', label: 'Any distance' },
  { value: '10', label: 'Within 10 km' },
  { value: '25', label: 'Within 25 km' },
  { value: '50', label: 'Within 50 km' },
  { value: '100', label: 'Within 100 km' },
];

export default function Marketplace() {
  const { currentUser } = useAuth();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('search') || '');
  // Deliberately a separate, exact-match filter rather than folded into the free-text
  // search above — "View products" links from the map pass a farm's brand name (e.g.
  // "CHADS FARM"), which doesn't appear anywhere on a product (name/category/location/
  // farmerName are all the farmer's personal name, not their farm name), so text-matching
  // on it silently returned nothing. Filtering by the actual farmerId is exact and can't
  // drift out of sync with the display name used to describe it.
  const [farmerIdFilter, setFarmerIdFilter] = useState(() => searchParams.get('farmerId') || '');
  const [farmerNameLabel] = useState(() => searchParams.get('farmerName') || '');
  // Defaults to the signed-in account's own municipality so each buyer/farmer/partner org
  // sees their own local market first — "All locations" is one click away, never a dead
  // end. Skipped when arriving via a specific farmer's "View products" link, though: that
  // farmer's own municipality could easily differ from the viewer's, and defaulting to the
  // viewer's location would then silently filter out the exact products they clicked
  // through to see.
  const [location, setLocation] = useState(() => (farmerIdFilter ? '' : currentUser.municipality || ''));
  const [grade, setGrade] = useState('');
  const [sellingType, setSellingType] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [maxDistanceKm, setMaxDistanceKm] = useState('');
  const [products, setProducts] = useState([]);
  const navItems = getNavItemsForRole(currentUser.role);
  const buyerCoords = useMemo(() => getMunicipalityCoords(currentUser.municipality), [currentUser.municipality]);

  useEffect(() => {
    getActiveProducts().then(setProducts);
  }, []);

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
      const matchesDistance = !maxDistanceKm
        || haversineKm(buyerCoords, getMunicipalityCoords(product.location)) <= Number(maxDistanceKm);
      const matchesFarmer = !farmerIdFilter || product.farmerId === farmerIdFilter;
      return matchesQuery && matchesLocation && matchesGrade && matchesSellingType && matchesMinPrice
        && matchesMaxPrice && matchesDistance && matchesFarmer;
    });
  }, [products, query, location, grade, sellingType, minPrice, maxPrice, maxDistanceKm, buyerCoords, farmerIdFilter]);

  const hasActiveFilters = Boolean(
    query || location || grade || sellingType || minPrice || maxPrice || maxDistanceKm || farmerIdFilter,
  );
  const clearFilters = () => {
    setQuery('');
    setLocation('');
    setGrade('');
    setSellingType('');
    setMinPrice('');
    setMaxPrice('');
    setMaxDistanceKm('');
    setFarmerIdFilter('');
  };

  return (
    <AppShell
      user={currentUser}
      navItems={navItems}
      title="Marketplace"
      subtitle="Find active produce listings from Cebu farmers."
    >
      {farmerIdFilter ? (
        <div className="form-alert info farmer-filter-banner">
          <span>Showing products from <strong>{farmerNameLabel || 'this farmer'}</strong></span>
          <button type="button" className="farmer-filter-clear" onClick={() => setFarmerIdFilter('')}>
            <X size={14} /> View all products
          </button>
        </div>
      ) : null}

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
          <label className="location-filter" htmlFor="marketplace-distance">
            <Navigation size={16} />
            <select id="marketplace-distance" value={maxDistanceKm} onChange={(event) => setMaxDistanceKm(event.target.value)}>
              {DISTANCE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
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
          message={hasActiveFilters ? 'No active listings match your filters right now.' : 'Check back when farmers add new harvests.'}
          actionLabel={hasActiveFilters ? 'Clear filters' : undefined}
          onAction={hasActiveFilters ? clearFilters : undefined}
        />
      )}
    </AppShell>
  );
}
