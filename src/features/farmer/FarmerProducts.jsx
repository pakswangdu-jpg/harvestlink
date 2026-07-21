import { useEffect, useMemo, useState } from 'react';
import { Boxes, Edit3, Eye, EyeOff, Gift, Layers, PackagePlus, Search, ShoppingBag, Tag, Trash2, TriangleAlert } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import SellerProductCard from '../../components/cards/SellerProductCard';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import StatusBadge from '../../components/common/StatusBadge';
import ProductForm from '../../components/forms/ProductForm';
import { useAuth } from '../auth/AuthContext';
import {
  applyDiscount,
  createProduct,
  deleteProduct,
  getProductById,
  getProductsByFarmer,
  removeDiscount,
  setProductStatus,
  updateProduct,
} from '../../services/productService';
import { createDonation } from '../../services/donationService';
import { formatCurrency } from '../../utils/formatters';
import { isLowStock } from '../../utils/constants';
import { useCatalog } from '../../contexts/CatalogContext';
import { farmerNavItems } from './farmerNav';

// Farmer types the exact percent they want (rather than picking from presets) and sees the
// resulting price live before committing — the percent lives in this component's own state
// since it's a draft that resets once the discount is actually applied (product.discountPercent
// becomes truthy and this control is swapped for "Remove discount").
function DiscountControl({ product, onApply }) {
  const [percent, setPercent] = useState('');
  const draftPercent = Number(percent);
  const isValid = percent !== '' && Number.isFinite(draftPercent) && draftPercent > 0 && draftPercent < 100;
  const previewPrice = isValid ? Number((product.price * (1 - draftPercent / 100)).toFixed(2)) : null;

  return (
    <div className="discount-picker">
      <div className="discount-input-wrap">
        <input
          type="number"
          min="1"
          max="99"
          step="1"
          value={percent}
          onChange={(event) => setPercent(event.target.value)}
          placeholder="20"
        />
        <span>%</span>
      </div>
      {previewPrice != null ? (
        <span className="discount-preview">
          <span className="price-original">{formatCurrency(product.price)}</span>
          {' → '}
          <strong>{formatCurrency(previewPrice)}</strong>
        </span>
      ) : null}
      <Button size="sm" variant="secondary" disabled={!isValid} onClick={() => onApply(draftPercent)}>
        <Tag size={15} /> Apply discount
      </Button>
    </div>
  );
}

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Hidden' },
  { value: 'low_stock', label: 'Low stock' },
  { value: 'out_of_stock', label: 'Out of stock' },
  { value: 'discounted', label: 'Discounted' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'price_high', label: 'Price: high to low' },
  { value: 'price_low', label: 'Price: low to high' },
  { value: 'stock', label: 'Stock: high to low' },
];

function matchesStatusFilter(product, statusFilter) {
  switch (statusFilter) {
    case 'active':
      return product.status === 'active';
    case 'inactive':
      return product.status === 'inactive';
    case 'low_stock':
      return isLowStock(product.quantity);
    case 'out_of_stock':
      return Number(product.quantity) <= 0;
    case 'discounted':
      return Boolean(product.discountPercent);
    default:
      return true;
  }
}

function sortProducts(list, sortBy) {
  const sorted = [...list];
  switch (sortBy) {
    case 'oldest':
      return sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    case 'price_high':
      return sorted.sort((a, b) => Number(b.price) - Number(a.price));
    case 'price_low':
      return sorted.sort((a, b) => Number(a.price) - Number(b.price));
    case 'stock':
      return sorted.sort((a, b) => Number(b.quantity) - Number(a.quantity));
    case 'newest':
    default:
      return sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
}

export default function FarmerProducts() {
  const { currentUser } = useAuth();
  const { categoryNames } = useCatalog();
  const [products, setProducts] = useState([]);
  const [editingProduct, setEditingProduct] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  const reload = () => getProductsByFarmer(currentUser.id).then(setProducts);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const summary = useMemo(() => ({
    total: products.length,
    active: products.filter((product) => product.status === 'active').length,
    lowStock: products.filter((product) => isLowStock(product.quantity)).length,
    totalInventory: products.reduce((sum, product) => sum + Number(product.quantity || 0), 0),
  }), [products]);

  // Includes any category value already on one of this farmer's own listings even if it's
  // no longer part of the canonical list (e.g. renamed/deactivated since the listing was
  // created) — otherwise that product would become impossible to find via this filter.
  const categoryOptions = useMemo(() => {
    const extra = products
      .map((product) => product.category)
      .filter((category) => category && !categoryNames.includes(category));
    return [...categoryNames, ...new Set(extra)];
  }, [products, categoryNames]);

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = products
      .filter((product) => !query || product.name.toLowerCase().includes(query))
      .filter((product) => categoryFilter === 'all' || product.category === categoryFilter)
      .filter((product) => matchesStatusFilter(product, statusFilter));
    return sortProducts(filtered, sortBy);
  }, [products, search, categoryFilter, statusFilter, sortBy]);

  const handleSubmit = async (values) => {
    try {
      setError('');
      if (editingProduct) {
        await updateProduct(editingProduct.id, values);
        setEditingProduct(null);
        setNotice('Product updated.');
      } else if (values.isDonation) {
        const product = await createProduct({ ...values, price: 0, sellingType: 'retail', moq: '' });
        createDonation(product, currentUser);
        setNotice(`${product.name} listed as a surplus donation for partner organizations.`);
      } else {
        await createProduct(values);
        setNotice('Product added to the marketplace.');
      }
      reload();
    } catch (submitError) {
      setNotice('');
      setError(submitError.message || 'Something went wrong while saving this product. Please try again.');
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteProduct(id);
      setError('');
      setNotice('Product deleted.');
      reload();
    } catch (deleteError) {
      setNotice('');
      setError(deleteError.message);
    }
  };

  const handleStatus = async (product) => {
    try {
      await setProductStatus(product.id, product.status === 'active' ? 'inactive' : 'active');
      setError('');
      setNotice(`Product marked ${product.status === 'active' ? 'inactive' : 'active'}.`);
    } catch (statusError) {
      setNotice('');
      setError(statusError.message);
    }
    reload();
  };

  const handleApplyDiscount = async (product, percent) => {
    try {
      await applyDiscount(product.id, percent);
      setError('');
      setNotice(`${product.name} discounted by ${percent}%.`);
      reload();
    } catch (discountError) {
      setNotice('');
      setError(discountError.message);
    }
  };

  const handleRemoveDiscount = async (product) => {
    await removeDiscount(product.id);
    setNotice(`Discount removed from ${product.name}.`);
    reload();
  };

  const handleDonate = async (product) => {
    try {
      // Re-fetch the current record rather than using this component's possibly-stale
      // state — another tab could have changed the product's quantity or other fields
      // since this page last reloaded.
      const freshProduct = await getProductById(product.id);
      if (!freshProduct) throw new Error('This product no longer exists.');
      createDonation(freshProduct, currentUser);
      setError('');
      setNotice(`${freshProduct.name} listed as a surplus donation for partner organizations.`);
      reload();
    } catch (donateError) {
      setNotice('');
      setError(donateError.message);
    }
  };

  const hasFilters = search.trim() || categoryFilter !== 'all' || statusFilter !== 'all';

  return (
    <AppShell
      user={currentUser}
      navItems={farmerNavItems}
      title="My products"
      subtitle="Add, edit, delete, discount, or donate your produce listings."
    >
      {notice ? <div className="form-alert success">{notice}</div> : null}
      {error ? <div className="form-alert error">{error}</div> : null}

      <section className="farmer-products-layout">
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Listing form</p>
              <h2>{editingProduct ? 'Edit product' : 'Add produce'}</h2>
            </div>
            <PackagePlus size={24} />
          </div>
          {currentUser.verificationStatus === 'verified' || editingProduct ? (
            <ProductForm
              key={editingProduct?.id || 'new-product'}
              product={editingProduct}
              currentUser={currentUser}
              onSubmit={handleSubmit}
              onCancel={editingProduct ? () => setEditingProduct(null) : undefined}
            />
          ) : currentUser.verificationStatus === 'rejected' ? (
            <div className="form-alert error">
              <strong>Your account verification was declined.</strong>
              <p>You can&apos;t add products until an admin approves your account. Update your profile details and contact support if you believe this was a mistake.</p>
            </div>
          ) : (
            <div className="form-alert warning">
              <strong>Your account is pending verification.</strong>
              <p>An admin typically reviews and approves new accounts within 24 hours. You&apos;ll be able to add products once your account is verified.</p>
            </div>
          )}
        </div>

        <div className="farmer-products-listings">
          <div className="seller-summary-grid">
            <div className="stat-card">
              <span className="stat-icon"><ShoppingBag size={20} /></span>
              <div>
                <p>Total products</p>
                <strong>{summary.total}</strong>
              </div>
            </div>
            <div className="stat-card">
              <span className="stat-icon"><Eye size={20} /></span>
              <div>
                <p>Active listings</p>
                <strong>{summary.active}</strong>
              </div>
            </div>
            <div className="stat-card">
              <span className="stat-icon"><TriangleAlert size={20} /></span>
              <div>
                <p>Low stock</p>
                <strong>{summary.lowStock}</strong>
              </div>
            </div>
            <div className="stat-card">
              <span className="stat-icon"><Boxes size={20} /></span>
              <div>
                <p>Total inventory</p>
                <strong>{summary.totalInventory}</strong>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Inventory</p>
                <h2>Your listings</h2>
              </div>
              <Layers size={22} />
            </div>

            {products.length ? (
              <div className="seller-toolbar">
                <label className="search-field" htmlFor="product-search">
                  <Search size={16} />
                  <input
                    id="product-search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search your listings"
                  />
                </label>
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filter by category">
                  <option value="all">All categories</option>
                  {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
                  {STATUS_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort listings">
                  {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            ) : null}

            {visibleProducts.length ? (
              <div className="seller-product-list">
                {visibleProducts.map((product) => (
                  <SellerProductCard
                    key={product.id}
                    product={product}
                    actions={(
                      <>
                        {product.priceReview ? (
                          <div className={`price-review-note ${product.priceReview.status}`}>
                            <StatusBadge value={product.priceReview.status} type="priceReview" />
                            <p>{product.priceReview.reason}</p>
                          </div>
                        ) : null}
                        <Button size="sm" variant="secondary" onClick={() => setEditingProduct(product)}>
                          <Edit3 size={15} /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={product.status !== 'active' && (Number(product.quantity) <= 0 || product.priceReview?.status === 'declined')}
                          title={
                            product.status === 'active'
                              ? undefined
                              : Number(product.quantity) <= 0
                                ? 'Add stock before activating this listing.'
                                : product.priceReview?.status === 'declined'
                                  ? 'Edit the price before re-activating — DTI declined the last one.'
                                  : undefined
                          }
                          onClick={() => handleStatus(product)}
                        >
                          {product.status === 'active' ? <EyeOff size={15} /> : <Eye size={15} />}
                          {product.status === 'active' ? 'Hide' : 'Activate'}
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => handleDelete(product.id)}>
                          <Trash2 size={15} />
                        </Button>

                        {product.discountPercent ? (
                          <Button size="sm" variant="ghost" onClick={() => handleRemoveDiscount(product)}>
                            Remove discount
                          </Button>
                        ) : (
                          <DiscountControl product={product} onApply={(percent) => handleApplyDiscount(product, percent)} />
                        )}

                        {Number(product.quantity) > 0 ? (
                          <Button size="sm" variant="ghost" onClick={() => handleDonate(product)}>
                            <Gift size={15} /> Donate remaining stock
                          </Button>
                        ) : null}
                      </>
                    )}
                  />
                ))}
              </div>
            ) : products.length ? (
              <EmptyState
                title="No matching products"
                message="Try a different search term or filter."
                actionLabel={hasFilters ? 'Clear filters' : undefined}
                onAction={() => {
                  setSearch('');
                  setCategoryFilter('all');
                  setStatusFilter('all');
                }}
              />
            ) : (
              <EmptyState title="No listings yet" message="Use the form to add the first product buyers will see." />
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
