import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { MapPin, Package } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import CheckoutForm from '../../components/forms/CheckoutForm';
import StatusBadge from '../../components/common/StatusBadge';
import Button from '../../components/common/Button';
import { useAuth } from '../auth/AuthContext';
import { getProductById } from '../../services/productService';
import { createOrder } from '../../services/orderService';
import { isLowStock } from '../../utils/constants';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { getNavItemsForRole } from '../../utils/navItemsByRole';

const ORDERING_ROLES = ['buyer', 'stakeholder'];

export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [product, setProduct] = useState(null);
  const [loadedId, setLoadedId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getProductById(id)
      .then((result) => {
        if (cancelled) return;
        setProduct(result);
        setLoadedId(id);
      })
      .catch(() => {
        if (cancelled) return;
        setProduct(null);
        setLoadedId(id);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loadedId !== id) return null;
  if (!product) return <Navigate to="/marketplace" replace />;

  const navItems = getNavItemsForRole(currentUser.role);
  const isPendingReview = product.priceReview?.status === 'pending';
  const canRequest = ORDERING_ROLES.includes(currentUser.role)
    && currentUser.id !== product.farmerId
    && product.status === 'active'
    && !isPendingReview;

  const handleOrder = async (values) => {
    const order = await createOrder({ ...values, productId: product.id });
    // GCash orders are created pending, same as COD — the demo GCash payment module
    // (src/features/payments/GcashPaymentPage.jsx) is what actually collects "payment" and
    // marks this same order paid, so route there instead of straight to tracking.
    if (order.paymentMethod === 'gcash') {
      navigate(`/orders/${order.id}/pay/gcash`);
      return;
    }
    navigate(`/orders/${order.id}`, { state: { notice: 'Order placed. Track its progress below.' } });
  };

  return (
    <AppShell
      user={currentUser}
      navItems={navItems}
      title={product.name}
      subtitle={`${product.farmerName} • ${product.location}`}
    >
      <section className="content-grid two uneven">
        <article className="panel product-detail">
          <div className="detail-image">
            {product.image ? <img src={product.image} alt={product.name} /> : <Package size={64} />}
          </div>
          <div className="detail-content">
            <div className="product-card-top">
              <span className="category-pill">{product.category}</span>
              <span className={`badge badge-grade-${(product.grade || 'A').toLowerCase()}`}>Grade {product.grade || 'A'}</span>
              {product.sellingType === 'wholesale' ? <span className="badge badge-wholesale">Wholesale</span> : null}
              {product.discountPercent ? <span className="badge badge-sale">-{product.discountPercent}%</span> : null}
              {isLowStock(product.quantity) ? <span className="badge badge-low-stock">Only {product.quantity} left</span> : null}
              <StatusBadge value={product.status} />
            </div>
            <h2>{product.name}</h2>
            <p>{product.description}</p>
            <div className="detail-list">
              <div>
                <span>Price</span>
                <strong>
                  {product.discountPercent ? <small className="price-original">{formatCurrency(product.originalPrice)}</small> : null}
                  {' '}{formatCurrency(product.price)} / {product.unit}
                </strong>
              </div>
              <div><span>Available</span><strong>{product.quantity} {product.unit}</strong></div>
              <div><span>Sales type</span><strong>{product.sellingType === 'wholesale' ? 'Wholesale' : 'Retail'}</strong></div>
              {product.sellingType === 'wholesale' && product.moq ? (
                <div><span>Minimum order (MOQ)</span><strong>{product.moq} {product.unit}</strong></div>
              ) : null}
              <div><span>Location</span><strong><MapPin size={15} /> {product.location}</strong></div>
              <div><span>Farmer</span><strong>{product.farmerName}</strong></div>
              <div><span>Listed</span><strong>{formatDate(product.createdAt)}</strong></div>
            </div>
          </div>
        </article>

        <aside className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Checkout</p>
              <h2>Order this product</h2>
            </div>
          </div>
          {canRequest ? (
            <CheckoutForm product={product} currentUser={currentUser} onSubmit={handleOrder} />
          ) : (
            <div className="empty-state compact">
              <h3>Order unavailable</h3>
              <p>
                {!ORDERING_ROLES.includes(currentUser.role)
                  ? 'Only buyer or partner organization accounts can place orders.'
                  : isPendingReview
                    ? 'This listing’s price is still awaiting DTI review and can’t be ordered yet.'
                    : 'You cannot order your own product or an inactive listing.'}
              </p>
              <Link className="btn btn-secondary btn-md" to="/marketplace">Back to marketplace</Link>
            </div>
          )}
        </aside>
      </section>
      <Button variant="ghost" onClick={() => navigate(-1)}>Back</Button>
    </AppShell>
  );
}
