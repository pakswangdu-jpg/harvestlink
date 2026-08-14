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
import { CEBU_MUNICIPALITIES, PRODUCT_GRADES, SALES_TYPES } from '../../utils/constants';
import { getNavItemsForRole } from '../../utils/navItemsByRole';

// The classic dual-range-slider-from-two-native-inputs trick: both <input type="range">
// sit stacked exactly on top of each other, each with a transparent, click-through track
// (pointer-events: none on the whole input) and only its own thumb re-enabled for pointer
// events (see .price-range-input::-webkit-slider-thumb in globals.css) — so either handle
// is independently draggable even though the inputs visually overlap 100%. The green
// "active range" bar underneath is a separate absolutely-positioned div, not part of either
// input, since a native range input can't paint a two-sided fill on its own.
function PriceRangeSlider({ minPrice, maxPrice, bounds, onCommit }) {
  const [sliderMin, sliderMax] = bounds;
  const [draftMin, setDraftMin] = useState(minPrice === '' ? sliderMin : Number(minPrice));
  const [draftMax, setDraftMax] = useState(maxPrice === '' ? sliderMax : Number(maxPrice));
  // What the number inputs actually display — deliberately NOT the same thing as draftMin/
  // draftMax above. Those two always hold a real number (needed to position the slider
  // thumbs/track even when unconstrained), but pre-filling the input with "0"/"200" makes it
  // look like the customer already chose that price and has to notice + overwrite it. Blank
  // means "no limit set" the way an empty filter field normally does; the actual bound only
  // shows as a placeholder (grayed out, not a real value) until they type their own.
  const [minText, setMinText] = useState(minPrice === '' ? '' : String(minPrice));
  const [maxText, setMaxText] = useState(maxPrice === '' ? '' : String(maxPrice));
  // Tracks the last props this render loop has already adjusted for, so the "sync from
  // outside" branch below only fires once per real external change — either the committed
  // filter (e.g. the empty-state's "Clear filters" button) or the bounds themselves, which
  // shift once the real product list loads in (see priceBounds in Marketplace) — not on
  // every render.
  const syncKey = `${minPrice}|${maxPrice}|${sliderMin}|${sliderMax}`;
  const [syncedKey, setSyncedKey] = useState(syncKey);

  // React's documented "adjust state when a prop changes" pattern (setState during render,
  // guarded by a comparison) rather than an effect — keeps the slider in sync with external
  // changes without the extra render pass/lint warning an effect-based sync would cause,
  // and without ever fighting the live drag state while dragging (draftMin/draftMax only
  // change here when the sync key itself changes).
  if (syncKey !== syncedKey) {
    setSyncedKey(syncKey);
    setDraftMin(minPrice === '' ? sliderMin : Number(minPrice));
    setDraftMax(maxPrice === '' ? sliderMax : Number(maxPrice));
    setMinText(minPrice === '' ? '' : String(minPrice));
    setMaxText(maxPrice === '' ? '' : String(maxPrice));
  }

  // The catalog-derived ceiling (bounds[1]) is a starting point, not a hard cap — someone
  // filtering "up to ₱500" should be able to type that even if nothing's listed above ₱200
  // right now, so the track/thumb extend to whatever's actually been typed instead of
  // silently clamping it back down to today's highest listing.
  const effectiveMax = Math.max(sliderMax, draftMax);
  const range = effectiveMax - sliderMin || 1;
  const minPct = ((draftMin - sliderMin) / range) * 100;
  const maxPct = ((draftMax - sliderMin) / range) * 100;

  // Resting exactly at the catalog's own bound means "no constraint on that end" — committed
  // as '' rather than the numeric edge, so it behaves identically to the old blank Min/Max
  // inputs (and doesn't fool hasActiveFilters into thinking a filter is on when the handles
  // are just resting at the full range). Strict equality, not >=/<=: once a typed max can
  // exceed sliderMax, ">= sliderMax" would wrongly treat every extended value as "no limit"
  // instead of the real constraint it is. Also resets the input's displayed text back to
  // blank at that same moment, same as clearing the field by hand — takes explicit values
  // (rather than always reading draftMin/draftMax) so the drag/blur handlers below can commit
  // the value they just settled on without waiting on a re-render to land in state first.
  const commit = (nextMin = draftMin, nextMax = draftMax) => {
    setMinText(nextMin === sliderMin ? '' : String(nextMin));
    setMaxText(nextMax === sliderMax ? '' : String(nextMax));
    onCommit(
      nextMin === sliderMin ? '' : String(nextMin),
      nextMax === sliderMax ? '' : String(nextMax),
    );
  };

  // The min field still clamps to the catalog bounds while typing (going below ₱0 or above
  // today's highest listing isn't a meaningful floor). The max field doesn't clamp upward —
  // that's the whole point of letting someone type a ceiling the catalog hasn't reached yet.
  // Neither clamps against the *other* handle mid-keystroke — that would fight someone typing
  // a multi-digit value one digit at a time. The min<max ordering is only enforced once they
  // leave the field (handleMin/MaxInputBlur below), same moment the slider's drag already
  // commits on release. minText/maxText track the raw typed characters (including a
  // momentarily-empty field mid-edit) separately from draftMin/draftMax, which the slider
  // still needs as real numbers to position its thumbs while typing is in progress.
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
  const [category, setCategory] = useState('');
  const [grade, setGrade] = useState('');
  const [sellingType, setSellingType] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [products, setProducts] = useState([]);
  const navItems = getNavItemsForRole(currentUser.role);
  // Includes any category value already carried by a currently-listed product even if it's
  // no longer part of the canonical list — otherwise a legacy/renamed category's listings
  // would become impossible to isolate via this filter (they're still findable via search).
  const categoryOptions = useMemo(() => {
    const extra = products
      .map((product) => product.category)
      .filter((value) => value && !categoryNames.includes(value));
    return [...categoryNames, ...new Set(extra)];
  }, [products, categoryNames]);
  // Catalog-aware slider ceiling (rounded up to the nearest ₱100) instead of a fixed
  // guess — so it stays meaningful whether today's listings top out at ₱200 or ₱20,000.
  const priceBounds = useMemo(() => {
    const highest = products.reduce((max, product) => Math.max(max, Number(product.price) || 0), 0);
    return [0, Math.max(100, Math.ceil((highest || 100) / 100) * 100)];
  }, [products]);

  // Polled every 4s, same as every other list page in the app (FarmerDashboard,
  // BuyerDashboard, OrderTracking, ...) — without this, a buyer already sitting on the
  // marketplace would never see a farmer's newly-added product until they left and came
  // back, since the original one-shot fetch on mount never ran again.
  useEffect(() => {
    const reload = () => getActiveProducts().then(setProducts);
    reload();
    const interval = setInterval(reload, 4000);
    return () => clearInterval(interval);
  }, []);

  const filteredProducts = useMemo(() => {
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
      const matchesFarmer = !farmerIdFilter || product.farmerId === farmerIdFilter;
      return matchesQuery && matchesLocation && matchesCategory && matchesGrade && matchesSellingType
        && matchesMinPrice && matchesMaxPrice && matchesFarmer;
    });
  }, [products, query, location, category, grade, sellingType, minPrice, maxPrice, farmerIdFilter]);

  const hasActiveFilters = Boolean(
    query || location || category || grade || sellingType || minPrice || maxPrice || farmerIdFilter,
  );
  const clearFilters = () => {
    setQuery('');
    setLocation('');
    setCategory('');
    setGrade('');
    setSellingType('');
    setMinPrice('');
    setMaxPrice('');
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

      {filteredProducts.length ? (
        <section className="product-grid">
          {filteredProducts.map((product) => <ProductCard key={product.id} product={product} />)}
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
