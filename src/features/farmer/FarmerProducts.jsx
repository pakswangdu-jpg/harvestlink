import { useEffect, useState } from 'react';
import { Edit3, Gift, PackagePlus, Tag, Trash2 } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import ProductCard from '../../components/cards/ProductCard';
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
import { DISCOUNT_OPTIONS } from '../../utils/constants';
import { farmerNavItems } from './farmerNav';

export default function FarmerProducts() {
  const { currentUser } = useAuth();
  const [products, setProducts] = useState([]);
  const [editingProduct, setEditingProduct] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [discountDraft, setDiscountDraft] = useState({});

  const reload = () => getProductsByFarmer(currentUser.id).then(setProducts);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const handleSubmit = async (values) => {
    try {
      setError('');
      if (editingProduct) {
        await updateProduct(editingProduct.id, values);
        setEditingProduct(null);
        setNotice('Product updated.');
      } else if (values.isDonation) {
        const product = await createProduct({ ...values, price: 0, sellingType: 'retail', bulkMinQuantity: '' });
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
    await deleteProduct(id);
    setNotice('Product deleted.');
    reload();
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

  const handleApplyDiscount = async (product) => {
    const percent = Number(discountDraft[product.id] || DISCOUNT_OPTIONS[0]);
    await applyDiscount(product.id, percent);
    setNotice(`${product.name} discounted by ${percent}%.`);
    reload();
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

  return (
    <AppShell
      user={currentUser}
      navItems={farmerNavItems}
      title="My products"
      subtitle="Add, edit, delete, discount, or donate your produce listings."
    >
      {notice ? <div className="form-alert success">{notice}</div> : null}
      {error ? <div className="form-alert error">{error}</div> : null}
      <section className="content-grid two uneven">
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

        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Inventory</p>
              <h2>Your listings</h2>
            </div>
          </div>

          {products.length ? (
            <div className="product-grid compact">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  showStatus
                  actions={(
                    <div className="card-actions surplus-actions">
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
                        <div className="discount-picker">
                          <select
                            value={discountDraft[product.id] || DISCOUNT_OPTIONS[0]}
                            onChange={(event) => setDiscountDraft((previous) => ({ ...previous, [product.id]: event.target.value }))}
                          >
                            {DISCOUNT_OPTIONS.map((percent) => (
                              <option key={percent} value={percent}>{percent}% off</option>
                            ))}
                          </select>
                          <Button size="sm" variant="secondary" onClick={() => handleApplyDiscount(product)}>
                            <Tag size={15} /> Discount
                          </Button>
                        </div>
                      )}

                      {Number(product.quantity) > 0 ? (
                        <Button size="sm" variant="ghost" onClick={() => handleDonate(product)}>
                          <Gift size={15} /> Donate remaining stock
                        </Button>
                      ) : null}
                    </div>
                  )}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="No listings yet" message="Use the form to add the first product buyers will see." />
          )}
        </div>
      </section>
    </AppShell>
  );
}
