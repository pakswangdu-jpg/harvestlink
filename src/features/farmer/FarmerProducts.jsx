import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, SearchX } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import Button from '../../components/common/Button';
import EditSquareIcon from '../../components/icons/EditSquareIcon';
import EmptyState from '../../components/common/EmptyState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import SellerProductCard from '../../components/cards/SellerProductCard';
import SummaryCards from '../../components/products/SummaryCards';
import ProductFilters from '../../components/products/ProductFilters';
import ProductTable, { ProductTableSkeleton } from '../../components/products/ProductTable';
import ProductDrawer from '../../components/products/ProductDrawer';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../../contexts/ToastContext';
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
import { getProductStatusInfo } from '../../utils/constants';
import { farmerNavItems } from './farmerNav';

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'low-stock', label: 'Low Stock' },
  { value: 'out-of-stock', label: 'Out of Stock' },
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
    // Opts out of the backend's restock merge (see createProduct in
    // products.controller.js) — this payload matches an existing listing on every merge-key
    // field by definition, so without this "Duplicate" would just fold back into the
    // original and appear to do nothing.
    allowDuplicate: true,
  };
}

export default function FarmerProducts() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const isVerified = currentUser.verificationStatus === 'verified';

  const reload = () => getProductsByFarmer(currentUser.id)
    .then((result) => {
      setProducts(result);
      setLoadError(false);
      setIsLoading(false);
    })
    .catch(() => {
      setLoadError(true);
      setIsLoading(false);
    });

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const summary = useMemo(() => {
    const counts = { total: products.length, active: 0, lowStock: 0, totalInventory: 0 };
    products.forEach((product) => {
      const status = getProductStatusInfo(product).value;
      if (status === 'active') counts.active += 1;
      if (status === 'low-stock') counts.lowStock += 1;
      counts.totalInventory += Number(product.quantity || 0);
    });
    return counts;
  }, [products]);

  const statusTabs = useMemo(() => {
    const counts = { all: products.length, active: 0, 'low-stock': 0, 'out-of-stock': 0 };
    products.forEach((product) => {
      const status = getProductStatusInfo(product).value;
      if (status in counts) counts[status] += 1;
    });
    return STATUS_TABS.map((tab) => ({ ...tab, count: counts[tab.value] || 0 }));
  }, [products]);

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products
      .filter((product) => !query || product.name.toLowerCase().includes(query))
      .filter((product) => statusFilter === 'all' || getProductStatusInfo(product).value === statusFilter)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [products, search, statusFilter]);

  const hasFilters = Boolean(search.trim()) || statusFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
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
      if (editingProduct) {
        await updateProduct(editingProduct.id, values);
        showToast({ type: 'success', message: 'Product updated successfully.' });
        closeDrawer();
      } else if (values.isDonation) {
        // allowDuplicate: a donation posts price 0 — folding it into an existing listing for
        // the same crop would silently reprice that listing to free (see createProduct).
        const created = await createProduct({
          ...values, price: 0, sellingType: 'retail', moq: '', allowDuplicate: true,
        });
        createDonation(created, currentUser);
        showToast({ type: 'success', message: `${created.name} listed as a surplus donation for partner organizations.` });
        closeDrawer();
      } else {
        const created = await createProduct(values);
        showToast({
          type: 'success',
          message: created.merged
            ? `Added ${created.addedQuantity} ${created.unit} to your existing ${created.name} listing.`
            : 'Product added successfully.',
        });
        // Keep the drawer open, now switched into edit mode for the product that was just
        // created (ProductForm's Discount section only ever renders once a product exists),
        // so a farmer can apply a discount right away instead of closing the drawer and
        // having to find and reopen this same listing from the list to do it.
        setEditingProduct(created);
      }
      reload();
    } catch (submitError) {
      showToast({ type: 'error', message: submitError.message || 'Something went wrong while saving this product. Please try again.' });
    }
  };

  const handleDuplicate = async (product) => {
    try {
      const copy = await createProduct(buildDuplicatePayload(product));
      showToast({ type: 'success', message: `${copy.name} duplicated as a new listing.` });
      reload();
    } catch (duplicateError) {
      showToast({ type: 'error', message: duplicateError.message });
    }
  };

  const handleConfirmArchive = async () => {
    if (!archiveTarget) return;
    const product = archiveTarget;
    try {
      await setProductStatus(product.id, product.status === 'active' ? 'inactive' : 'active');
      showToast({ type: 'success', message: `${product.name} ${product.status === 'active' ? 'deactivated' : 'reactivated'}.` });
      reload();
    } catch (statusError) {
      showToast({ type: 'error', message: statusError.message });
    }
    setArchiveTarget(null);
  };

  const handleDonate = async (product) => {
    try {
      createDonation(product, currentUser);
      showToast({ type: 'success', message: `${product.name} listed as a surplus donation for partner organizations.` });
      reload();
    } catch (donateError) {
      showToast({ type: 'error', message: donateError.message });
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteProduct(deleteTarget.id);
      showToast({ type: 'success', message: 'Product deleted.' });
      setDeleteTarget(null);
      reload();
    } catch (deleteError) {
      showToast({ type: 'error', message: deleteError.message });
    }
  };

  const handleApplyDiscount = async (percent) => {
    try {
      await applyDiscount(editingProduct.id, percent);
      showToast({ type: 'success', message: `${editingProduct.name} discounted by ${percent}%.` });
      const refreshed = await getProductsByFarmer(currentUser.id);
      setProducts(refreshed);
      setEditingProduct(refreshed.find((item) => item.id === editingProduct.id) || null);
    } catch (discountError) {
      showToast({ type: 'error', message: discountError.message });
    }
  };

  const handleRemoveDiscount = async () => {
    await removeDiscount(editingProduct.id);
    showToast({ type: 'success', message: `Discount removed from ${editingProduct.name}.` });
    const refreshed = await getProductsByFarmer(currentUser.id);
    setProducts(refreshed);
    setEditingProduct(refreshed.find((item) => item.id === editingProduct.id) || null);
  };

  const canAddProducts = isVerified;

  return (
    <AppShell
      user={currentUser}
      navItems={farmerNavItems}
      eyebrow="Product Management"
      title="My Products"
      subtitle="Manage your product listings, inventory, pricing, and availability."
      pageClassName="farmer-products-page"
      headerActions={(
        <Button
          onClick={openAddDrawer}
          disabled={!canAddProducts}
          title={canAddProducts ? undefined : 'Verify your account before adding products.'}
          className="add-product-button"
        >
          <Plus size={16} strokeWidth={2} aria-hidden="true" /> Add Product
        </Button>
      )}
    >
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

      <SummaryCards summary={summary} />

      <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[var(--text)]">Your Products</h2>
        </div>

        {!isLoading && !loadError && products.length ? (
          <div className="mb-3">
            <ProductFilters
              search={search}
              onSearchChange={setSearch}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              statusTabs={statusTabs}
            />
          </div>
        ) : null}

        {isLoading ? (
          <>
            <div className="hidden lg:block"><ProductTableSkeleton /></div>
            <div className="grid gap-2.5 lg:hidden">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={`product-skeleton-${index}`} className="product-mobile-card">
                  <div className="product-skeleton-block h-10 w-10 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="product-skeleton-block h-3.5 w-2/5" />
                    <div className="product-skeleton-block mt-2 h-3 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : loadError ? (
          <EmptyState
            compact
            title="Products couldn't be loaded"
            message="Something went wrong while loading your products."
            actionLabel="Try Again"
            onAction={reload}
          />
        ) : visibleProducts.length ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
            <div className="hidden lg:block">
              <ProductTable
                products={visibleProducts}
                onView={(product) => navigate(`/products/${product.id}`)}
                onEdit={openEditDrawer}
                onDuplicate={handleDuplicate}
                onArchive={setArchiveTarget}
                onDonate={handleDonate}
                onDelete={setDeleteTarget}
              />
            </div>
            <div className="lg:hidden">
              {visibleProducts.map((product) => (
                <SellerProductCard
                  key={product.id}
                  product={product}
                  actions={(
                    <Button size="sm" variant="secondary" className="btn-icon-only" onClick={() => openEditDrawer(product)} aria-label="Edit product" title="Edit product">
                      <EditSquareIcon size={20} />
                    </Button>
                  )}
                />
              ))}
            </div>
          </motion.div>
        ) : products.length ? (
          <EmptyState
            compact
            className="empty-state-transparent-icon"
            icon={SearchX}
            title="No matching products"
            message="Try a different search term or filter."
            actionLabel={hasFilters ? 'Clear filters' : undefined}
            onAction={clearFilters}
          />
        ) : (
          <EmptyState
            compact
            title="No products listed yet"
            message="Your products will appear here once you create a listing."
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
        open={Boolean(archiveTarget)}
        title={archiveTarget?.status === 'active' ? 'Deactivate product?' : 'Reactivate product?'}
        message={archiveTarget?.status === 'active'
          ? 'This product will no longer be visible to buyers.'
          : 'This product will become visible to buyers again.'}
        confirmLabel={archiveTarget?.status === 'active' ? 'Deactivate' : 'Reactivate'}
        onConfirm={handleConfirmArchive}
        onCancel={() => setArchiveTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete product?"
        message="This action cannot be undone."
        confirmLabel="Delete Product"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </AppShell>
  );
}
