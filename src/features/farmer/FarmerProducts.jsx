import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Sprout } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import SellerProductCard from '../../components/cards/SellerProductCard';
import SummaryCards from '../../components/products/SummaryCards';
import ProductFilters from '../../components/products/ProductFilters';
import ProductTable from '../../components/products/ProductTable';
import ProductDrawer from '../../components/products/ProductDrawer';
import { useAuth } from '../auth/AuthContext';
import {
  applyDiscount,
  createProduct,
  deleteProduct,
  getProductsByFarmer,
  removeDiscount,
  setProductStatus,
  updateProduct,
} from '../../services/productService';
import { createDonation } from '../../services/donationService';
import { isLowStock } from '../../utils/constants';
import { useCatalog } from '../../contexts/CatalogContext';
import { farmerNavItems } from './farmerNav';

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Archived' },
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

// Fields a fresh duplicate should start clean with — never carries over another listing's
// lifecycle state (its own id/status/discount/DTI price review/timestamps).
function buildDuplicatePayload(product) {
  return {
    name: product.name,
    category: product.category,
    grade: product.grade,
    sellingType: product.sellingType,
    moq: product.sellingType === 'wholesale' ? product.moq : '',
    price: product.price,
    unit: product.unit,
    kgPerUnit: product.kgPerUnit ?? '',
    quantity: product.quantity,
    location: product.location,
    description: product.description,
    image: product.image,
    costPrice: product.costPrice ?? '',
    expirationDate: product.expirationDate || '',
    status: 'active',
    isDonation: false,
  };
}

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
  const navigate = useNavigate();
  const { categoryNames } = useCatalog();
  const [products, setProducts] = useState([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [salesTypeFilter, setSalesTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  const isVerified = currentUser.verificationStatus === 'verified';

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
      .filter((product) => matchesStatusFilter(product, statusFilter))
      .filter((product) => gradeFilter === 'all' || product.grade === gradeFilter)
      .filter((product) => salesTypeFilter === 'all' || product.sellingType === salesTypeFilter);
    return sortProducts(filtered, sortBy);
  }, [products, search, categoryFilter, statusFilter, gradeFilter, salesTypeFilter, sortBy]);

  const hasFilters = search.trim() || categoryFilter !== 'all' || statusFilter !== 'all' || gradeFilter !== 'all' || salesTypeFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setCategoryFilter('all');
    setStatusFilter('all');
    setGradeFilter('all');
    setSalesTypeFilter('all');
  };

  const openAddDrawer = () => {
    setEditingProduct(null);
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (product) => {
    setEditingProduct(product);
    setIsDrawerOpen(true);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    setEditingProduct(null);
  };

  const handleSubmit = async (values) => {
    try {
      setError('');
      if (editingProduct) {
        await updateProduct(editingProduct.id, values);
        setNotice('Product updated.');
      } else if (values.isDonation) {
        const product = await createProduct({ ...values, price: 0, sellingType: 'retail', moq: '' });
        createDonation(product, currentUser);
        setNotice(`${product.name} listed as a surplus donation for partner organizations.`);
      } else {
        await createProduct(values);
        setNotice('Product added to the marketplace.');
      }
      closeDrawer();
      reload();
    } catch (submitError) {
      setNotice('');
      setError(submitError.message || 'Something went wrong while saving this product. Please try again.');
    }
  };

  const handleDuplicate = async (product) => {
    try {
      setError('');
      const copy = await createProduct(buildDuplicatePayload(product));
      setNotice(`${copy.name} duplicated as a new listing.`);
      reload();
    } catch (duplicateError) {
      setNotice('');
      setError(duplicateError.message);
    }
  };

  const handleArchive = async (product) => {
    try {
      setError('');
      await setProductStatus(product.id, product.status === 'active' ? 'inactive' : 'active');
      setNotice(`${product.name} ${product.status === 'active' ? 'archived' : 'unarchived'}.`);
      reload();
    } catch (statusError) {
      setNotice('');
      setError(statusError.message);
    }
  };

  const handleDonate = async (product) => {
    try {
      setError('');
      createDonation(product, currentUser);
      setNotice(`${product.name} listed as a surplus donation for partner organizations.`);
      reload();
    } catch (donateError) {
      setNotice('');
      setError(donateError.message);
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteProduct(deleteTarget.id);
      setError('');
      setNotice('Product deleted.');
      setDeleteTarget(null);
      reload();
    } catch (deleteError) {
      setNotice('');
      setError(deleteError.message);
    }
  };

  const handleApplyDiscount = async (percent) => {
    try {
      await applyDiscount(editingProduct.id, percent);
      setNotice(`${editingProduct.name} discounted by ${percent}%.`);
      const refreshed = await getProductsByFarmer(currentUser.id);
      setProducts(refreshed);
      setEditingProduct(refreshed.find((item) => item.id === editingProduct.id) || null);
    } catch (discountError) {
      setNotice('');
      setError(discountError.message);
    }
  };

  const handleRemoveDiscount = async () => {
    await removeDiscount(editingProduct.id);
    setNotice(`Discount removed from ${editingProduct.name}.`);
    const refreshed = await getProductsByFarmer(currentUser.id);
    setProducts(refreshed);
    setEditingProduct(refreshed.find((item) => item.id === editingProduct.id) || null);
  };

  const canAddProducts = isVerified;

  return (
    <AppShell
      user={currentUser}
      navItems={farmerNavItems}
      title="My Products"
      subtitle="Manage your product listings, inventory, pricing, and availability."
    >
      {notice ? <div className="form-alert success">{notice}</div> : null}
      {error ? <div className="form-alert error">{error}</div> : null}

      {!isVerified ? (
        <div className={`form-alert ${currentUser.verificationStatus === 'rejected' ? 'error' : 'warning'}`}>
          {currentUser.verificationStatus === 'rejected' ? (
            <>
              <strong>Your account verification was declined.</strong>
              <p>You can&apos;t add products until an admin approves your account. Update your profile details and contact support if you believe this was a mistake.</p>
            </>
          ) : (
            <>
              <strong>Your account is pending verification.</strong>
              <p>An admin typically reviews and approves new accounts within 24 hours. You&apos;ll be able to add products once your account is verified.</p>
            </>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-4">
        <Button
          onClick={openAddDrawer}
          disabled={!canAddProducts}
          title={canAddProducts ? undefined : 'Verify your account before adding products.'}
          className="h-[42px]! gap-2"
        >
          <Plus size={18} strokeWidth={2} /> Add Product
        </Button>
      </div>

      <div className="mt-5">
        <SummaryCards summary={summary} />
      </div>

      <section className="mt-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        {products.length ? (
          <div className="mb-5">
            <ProductFilters
              search={search}
              onSearchChange={setSearch}
              categoryFilter={categoryFilter}
              onCategoryFilterChange={setCategoryFilter}
              categoryOptions={categoryOptions}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              statusOptions={STATUS_FILTERS}
              gradeFilter={gradeFilter}
              onGradeFilterChange={setGradeFilter}
              salesTypeFilter={salesTypeFilter}
              onSalesTypeFilterChange={setSalesTypeFilter}
              sortBy={sortBy}
              onSortByChange={setSortBy}
              sortOptions={SORT_OPTIONS}
            />
          </div>
        ) : null}

        {visibleProducts.length ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <div className="hidden lg:block">
              <ProductTable
                products={visibleProducts}
                onView={(product) => navigate(`/products/${product.id}`)}
                onEdit={openEditDrawer}
                onDuplicate={handleDuplicate}
                onArchive={handleArchive}
                onDonate={handleDonate}
                onDelete={setDeleteTarget}
              />
            </div>
            <div className="grid gap-4 lg:hidden">
              {visibleProducts.map((product) => (
                <SellerProductCard
                  key={product.id}
                  product={product}
                  actions={(
                    <>
                      <Button size="sm" variant="secondary" onClick={() => openEditDrawer(product)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDuplicate(product)}>Duplicate</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleArchive(product)}>
                        {product.status === 'active' ? 'Archive' : 'Unarchive'}
                      </Button>
                      {Number(product.quantity) > 0 ? (
                        <Button size="sm" variant="ghost" onClick={() => handleDonate(product)}>Donate</Button>
                      ) : null}
                      <Button size="sm" variant="danger" onClick={() => setDeleteTarget(product)}>Delete</Button>
                    </>
                  )}
                />
              ))}
            </div>
          </motion.div>
        ) : products.length ? (
          <EmptyState
            title="No matching products"
            message="Try a different search term or filter."
            actionLabel={hasFilters ? 'Clear filters' : undefined}
            onAction={clearFilters}
          />
        ) : (
          <EmptyState
            icon={Sprout}
            title="No products yet"
            message="You haven't added any products yet. Click Add Product to create your first listing."
            actionLabel={canAddProducts ? 'Add Product' : undefined}
            onAction={openAddDrawer}
          />
        )}
      </section>

      <ProductDrawer
        open={isDrawerOpen}
        product={editingProduct}
        currentUser={currentUser}
        onSubmit={handleSubmit}
        onClose={closeDrawer}
        onApplyDiscount={handleApplyDiscount}
        onRemoveDiscount={handleRemoveDiscount}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget?.name}
        message="This will permanently delete this product listing. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </AppShell>
  );
}
