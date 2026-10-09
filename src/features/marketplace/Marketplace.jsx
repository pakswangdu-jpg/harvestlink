import { Award, Layers, MapPin, Search, Tag, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import walletIcon from '../../assets/icons/marketplace-price-range.png';
import { useSearchParams } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import ProductCard from '../../components/cards/ProductCard';
import EmptyState from '../../components/common/EmptyState';
import { useAuth } from '../auth/AuthContext';
import { useCatalog } from '../../contexts/CatalogContext';
import { getActiveProducts } from '../../services/productService';
import { matchCommodity } from '../../services/marketPriceService';
import { useAdminMarketReferences } from '../../hooks/useAdminMarketReferences';
import { CEBU_MUNICIPALITIES, getExpiryStatus, PRODUCT_GRADES, SALES_TYPES } from '../../utils/constants';
import { getNavItemsForRole } from '../../utils/navItemsByRole';








function PriceRangeSlider({ minPrice, maxPrice, bounds, onCommit }) {
  const [sliderMin, sliderMax] = bounds;
  const [draftMin, setDraftMin] = useState(minPrice === '' ? sliderMin : Number(minPrice));
  const [draftMax, setDraftMax] = useState(maxPrice === '' ? sliderMax : Number(maxPrice));






  const [minText, setMinText] = useState(minPrice === '' ? '' : String(minPrice));
  const [maxText, setMaxText] = useState(maxPrice === '' ? '' : String(maxPrice));





  const syncKey = `${minPrice}|${maxPrice}|${sliderMin}|${sliderMax}`;
  const [syncedKey, setSyncedKey] = useState(syncKey);






  if (syncKey !== syncedKey) {
    setSyncedKey(syncKey);
    setDraftMin(minPrice === '' ? sliderMin : Number(minPrice));
    setDraftMax(maxPrice === '' ? sliderMax : Number(maxPrice));
    setMinText(minPrice === '' ? '' : String(minPrice));
    setMaxText(maxPrice === '' ? '' : String(maxPrice));
  }





  const effectiveMax = Math.max(sliderMax, draftMax);
  const range = effectiveMax - sliderMin || 1;
  const minPct = ((draftMin - sliderMin) / range) * 100;
  const maxPct = ((draftMax - sliderMin) / range) * 100;










  const commit = (nextMin = draftMin, nextMax = draftMax) => {
    setMinText(nextMin === sliderMin ? '' : String(nextMin));
    setMaxText(nextMax === sliderMax ? '' : String(nextMax));
    onCommit(
      nextMin === sliderMin ? '' : String(nextMin),
      nextMax === sliderMax ? '' : String(nextMax),
    );
  };










  const handleMinInputChange = (event) => {
    const raw = event.target.value;
    setMinText(raw);
    if (raw === '') { setDraftMin(sliderMin); return; }
    setDraftMin(Math.min(Math.max(Number(raw), sliderMin), sliderMax));
  };
  const handleMaxInputChange = (event) => {
    const raw = event.target.value;
    setMaxText(raw);
    if (raw === '') { setDraftMax(sliderMax); return; }
    setDraftMax(Math.max(Number(raw), sliderMin));
  };
  const handleMinInputBlur = () => {
    const clamped = Math.min(draftMin, draftMax - 1);
    setDraftMin(clamped);
    commit(clamped, draftMax);
  };
  const handleMaxInputBlur = () => {
    const clamped = Math.max(draftMax, draftMin + 1);
    setDraftMax(clamped);
    commit(draftMin, clamped);
  };
  const blurOnEnter = (event) => { if (event.key === 'Enter') event.currentTarget.blur(); };

  return (
    <div className="price-range-filter">
      <div className="price-range-header">
        <img src={walletIcon} alt="" width={16} height={16} /> <span>Price Range</span>
      </div>
      <div className="price-range-slider">
        <div className="price-range-track">
          <div className="price-range-track-active" style={{ left: `${minPct}%`, width: `${Math.max(0, maxPct - minPct)}%` }} />
        </div>
        <input
          type="range"
          className="price-range-input"
          min={sliderMin}
          max={effectiveMax}
          value={draftMin}
          onChange={(event) => {
            const next = Math.min(Number(event.target.value), draftMax - 1);
            setDraftMin(next);
            setMinText(String(next));
          }}
          onMouseUp={() => commit()}
          onTouchEnd={() => commit()}
          onKeyUp={() => commit()}
          aria-label="Minimum price"
        />
        <input
          type="range"
          className="price-range-input"
          min={sliderMin}
          max={effectiveMax}
          value={draftMax}
          onChange={(event) => {
            const next = Math.max(Number(event.target.value), draftMin + 1);
            setDraftMax(next);
            setMaxText(String(next));
          }}
          onMouseUp={() => commit()}
          onTouchEnd={() => commit()}
          onKeyUp={() => commit()}
          aria-label="Maximum price"
        />
      </div>
      <div className="price-range-values">
        <label className="price-range-value-input">
          <span>₱</span>
          <input
            type="number"
            inputMode="numeric"
            min={sliderMin}
            max={sliderMax}
            value={minText}
            placeholder={String(sliderMin)}
            onChange={handleMinInputChange}
            onBlur={handleMinInputBlur}
            onKeyDown={blurOnEnter}
            aria-label="Minimum price"
          />
        </label>
        <label className="price-range-value-input">
          <span>₱</span>
          <input
            type="number"
            inputMode="numeric"
            min={sliderMin}
            value={maxText}
            placeholder={String(sliderMax)}
            onChange={handleMaxInputChange}
            onBlur={handleMaxInputBlur}
            onKeyDown={blurOnEnter}
            aria-label="Maximum price"
          />
        </label>
      </div>
    </div>
  );
}

export default function Marketplace() {
  const { currentUser } = useAuth();
  const { categoryNames } = useCatalog();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('search') || '');






  const farmerIdFilter = searchParams.get('farmerId') || '';
  const farmerNameLabel = searchParams.get('farmerName') || '';






  const [location, setLocation] = useState(() => (farmerIdFilter ? '' : currentUser.municipality || ''));
  const [category, setCategory] = useState('');
  const [grade, setGrade] = useState('');
  const [sellingType, setSellingType] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [products, setProducts] = useState([]);
  const { references, referenceError } = useAdminMarketReferences();
  const navItems = getNavItemsForRole(currentUser.role);




  const categoryOptions = useMemo(() => {
    const extra = products
      .map((product) => product.category)
      .filter((value) => value && !categoryNames.includes(value));
    return [...categoryNames, ...new Set(extra)];
  }, [products, categoryNames]);


  const priceBounds = useMemo(() => {
    const highest = products.reduce((max, product) => Math.max(max, Number(product.price) || 0), 0);
    return [0, Math.max(100, Math.ceil((highest || 100) / 100) * 100)];
  }, [products]);





  useEffect(() => {
    const reload = () => getActiveProducts()
      .then((items) => setProducts(items.filter((product) => getExpiryStatus(product.expirationDate) !== 'expired')));
    reload();
    const interval = setInterval(reload, 4000);
    return () => clearInterval(interval);
  }, []);

  const referencesByCommodity = useMemo(() => new Map(references.map((reference) => [reference.commodityId, reference])), [references]);

  const filteredProducts = useMemo(() => {
    if (farmerIdFilter) {
      return products.filter((product) => product.farmerId === farmerIdFilter);
    }
    const normalized = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesQuery = !normalized || [product.name, product.category, product.location, product.farmerName]
        .join(' ')
        .toLowerCase()
        .includes(normalized);
      const matchesLocation = !location || product.location === location;
      const matchesCategory = !category || product.category === category;
      const matchesGrade = !grade || product.grade === grade;
      const matchesSellingType = !sellingType || product.sellingType === sellingType;
      const matchesMinPrice = !minPrice || product.price >= Number(minPrice);
      const matchesMaxPrice = !maxPrice || product.price <= Number(maxPrice);
      return matchesQuery && matchesLocation && matchesCategory && matchesGrade && matchesSellingType
        && matchesMinPrice && matchesMaxPrice;
    });
  }, [products, query, location, category, grade, sellingType, minPrice, maxPrice, farmerIdFilter]);

  const hasActiveFilters = Boolean(
    query || location || category || grade || sellingType || minPrice || maxPrice || farmerIdFilter,
  );
  const clearFarmerFilter = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('farmerId');
    nextParams.delete('farmerName');
    setSearchParams(nextParams, { replace: true });
  };
  const clearFilters = () => {
    setQuery('');
    setLocation('');
    setCategory('');
    setGrade('');
    setSellingType('');
    setMinPrice('');
    setMaxPrice('');
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('farmerId');
    nextParams.delete('farmerName');
    nextParams.delete('search');
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <AppShell
      user={currentUser}
      navItems={navItems}
      title="Marketplace"
      subtitle="Find active produce listings from Cebu farmers."
      pageClassName="marketplace-page"
    >
      {farmerIdFilter ? (
        <div className="form-alert info farmer-filter-banner">
          <span>Showing products from <strong>{farmerNameLabel || 'this farmer'}</strong></span>
          <button type="button" className="farmer-filter-clear" onClick={clearFarmerFilter}>
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
          <label className="location-filter" htmlFor="marketplace-category">
            <Layers size={16} />
            <select id="marketplace-category" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">All categories</option>
              {categoryOptions.map((item) => <option key={item} value={item}>{item}</option>)}
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
              <option value="">All sales types</option>
              {SALES_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <PriceRangeSlider
            minPrice={minPrice}
            maxPrice={maxPrice}
            bounds={priceBounds}
            onCommit={(nextMin, nextMax) => {
              setMinPrice(nextMin);
              setMaxPrice(nextMax);
            }}
          />
        </div>
      </section>

      {referenceError ? <p className="muted" role="status">{referenceError}</p> : null}
      {filteredProducts.length ? (
        <section className="product-grid">
          {filteredProducts.map((product) => <ProductCard key={product.id} product={product} className="marketplace-product-card" marketReference={referencesByCommodity.get(matchCommodity(product.name)?.id)} />)}
        </section>
      ) : (
        <EmptyState
          className="empty-state-transparent-icon"
          title="No matching products"
          message={hasActiveFilters ? 'No active listings match your filters right now.' : 'Check back when farmers add new harvests.'}
          actionLabel={hasActiveFilters ? 'Clear filters' : undefined}
          onAction={hasActiveFilters ? clearFilters : undefined}
        />
      )}
    </AppShell>
  );
}
