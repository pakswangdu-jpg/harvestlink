import { MessageCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import CheckoutForm from '../../components/forms/CheckoutForm';
import Button from '../../components/common/Button';
import { useAuth } from '../auth/AuthContext';
import { getProductById } from '../../services/productService';
import { createOrder } from '../../services/orderService';
import { ORDERING_ROLES } from '../../utils/constants';
import { getNavItemsForRole } from '../../utils/navItemsByRole';
import { useCart } from '../../contexts/CartContext';
import { useAdminMarketReferences } from '../../hooks/useAdminMarketReferences';
import { matchCommodity } from '../../services/marketPriceService';
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency } from '../../utils/formatters';
import AdminReferenceNotice from '../../components/market/AdminReferenceNotice';
import ProductReviewsFeed from '../../components/products/ProductReviewsFeed';
import ProductImageGallery from '../../components/products/ProductImageGallery';
import { useToast } from '../../contexts/ToastContext';

const PRODUCT_MESSAGE_SUGGESTIONS = [
  'Hi! Is this product still available?',
  'How many units are currently available?',
  'Can I order this quantity?',
  'Do you offer bulk pricing?',
  'Do you offer delivery?',
  'Can you provide more information about the product quality?',
];

function getFarmerInquirySnapshot(context, id, currentUser) {
  if (currentUser.role !== 'farmer' || context?.productId !== id || context.farmerId !== currentUser.id) return null;
  return {
    id: context.productId,
    farmerId: context.farmerId,
    farmerName: context.farmerName,
    name: context.productName,
    image: context.imageUrl || '',
    category: context.category || '',
    price: context.price,
    quantity: context.availableQuantity,
    unit: context.unit,
    status: context.status,
    description: context.description || '',
    isInquirySnapshot: true,
  };
}

export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const { removeItem } = useCart();
  const { showToast } = useToast();
  const [product, setProduct] = useState(() => getFarmerInquirySnapshot(location.state?.productContext, id, currentUser));
  const [loadedId, setLoadedId] = useState(() => (
    getFarmerInquirySnapshot(location.state?.productContext, id, currentUser) ? id : null
  ));
  const [loadError, setLoadError] = useState('');
  const [liveListingUnavailable, setLiveListingUnavailable] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [stockConflict, setStockConflict] = useState(null);
  const [isRefreshingProduct, setIsRefreshingProduct] = useState(false);
  const [stockRefreshError, setStockRefreshError] = useState('');
  const { references, referenceError } = useAdminMarketReferences();

  useEffect(() => {
    let cancelled = false;
    const snapshot = getFarmerInquirySnapshot(location.state?.productContext, id, currentUser);
    if (snapshot) {
      setProduct(snapshot);
      setLoadedId(id);
    } else {
      setProduct(null);
      setLoadedId(null);
    }
    setLoadError('');
    setLiveListingUnavailable(false);
    getProductById(id)
      .then((result) => {
        if (cancelled) return;
        if (!result) throw new Error('The product listing could not be found.');
        setProduct(result);
        setLoadedId(id);
      }).catch((error) => {
        if (cancelled) return;
        if (snapshot) {
          setProduct(snapshot);
          setLiveListingUnavailable(true);
          setLoadedId(id);
          return;
        }
        setProduct(null);
        setLoadError(error instanceof Error ? error.message : 'Unable to load this product listing.');
        setLoadedId(id);
      });
    return () => {
      cancelled = true;
    };
  }, [id, loadAttempt, currentUser.id, currentUser.role, location.state]);

  useEffect(() => {
    if (loadedId !== id) return undefined;
    let cancelled = false;
    const refresh = () => getProductById(id, { fresh: true })
      .then((latestProduct) => {
        if (cancelled || !latestProduct) return;
        setProduct(latestProduct);
        setStockRefreshError('');
      })
      .catch((error) => {
        if (!cancelled) setStockRefreshError(error.message || 'Unable to refresh this listing right now.');
      });
    const channel = supabase
      .channel(`product-inventory-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'product_inventory_events',
          filter: `product_id=eq.${id}`,
        },
        refresh,
      )
      .subscribe((status) => {
        if (!cancelled && ['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) {
          setStockRefreshError('Live stock updates are unavailable. We will keep checking this listing.');
        }
      });
    const interval = setInterval(refresh, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [id, loadedId]);

  const refreshProduct = useCallback(async () => {
    setIsRefreshingProduct(true);
    setStockRefreshError('');
    try {
      const latestProduct = await getProductById(id, { fresh: true });
      if (!latestProduct) throw new Error('The product listing could not be found.');
      setProduct(latestProduct);
      return latestProduct;
    } catch (error) {
      setStockRefreshError(error.message || 'Unable to refresh this listing right now.');
      throw error;
    } finally {
      setIsRefreshingProduct(false);
    }
  }, [id]);

  const navItems = getNavItemsForRole(currentUser.role);
  if (loadedId !== id) {
    return (
      <AppShell user={currentUser} navItems={navItems} title="Product listing" subtitle="Loading listing details…" pageClassName="checkout-page">
        <div className="panel flex min-h-40 items-center justify-center" role="status" aria-live="polite">
          <p className="text-sm text-[var(--text-secondary)]">Loading product listing…</p>
        </div>
      </AppShell>
    );
  }
  if (!product) {
    return (
      <AppShell user={currentUser} navItems={navItems} title="Product listing" subtitle="We couldn’t open this listing." pageClassName="checkout-page">
        <div className="panel">
          <div className="empty-state compact">
            <h2>Unable to view product</h2>
            <p role="alert">{loadError || 'This product may have been removed or is temporarily unavailable.'}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button variant="secondary" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</Button>
              <Button variant="ghost" onClick={() => navigate(-1)}>Back to conversation</Button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const adminReference = references.find((reference) => reference.commodityId === matchCommodity(product.name)?.id);
  const isFarmerOwner = currentUser.role === 'farmer' && currentUser.id === product.farmerId;
  const isPendingReview = product.priceReview?.status === 'pending';
  const isOutOfStock = !(Number(product.quantity) > 0);
  const canRequest = ORDERING_ROLES.includes(currentUser.role)
    && currentUser.id !== product.farmerId
    && product.status === 'active'
    && !isPendingReview
    && !isOutOfStock;
  const canMessageFarmer = ['buyer', 'stakeholder'].includes(currentUser.role)
    && currentUser.id !== product.farmerId
    && product.status === 'active'
    && Number(product.quantity) > 0;

  const openFarmerConversation = () => {
    navigate(`/messages/direct/${product.farmerId}`, {
      state: {
        productContext: {
          productId: product.id,
          productName: product.name,
          imageUrl: product.image,
          category: product.category,
          farmerId: product.farmerId,
          farmerName: product.farmerName,
          availableQuantity: Number(product.quantity),
          status: product.status,
          unit: product.unit,
          price: product.price,
        },
        initialMessage: '',
        suggestedMessages: PRODUCT_MESSAGE_SUGGESTIONS,
      },
    });
  };

  const messageFarmerAction = canMessageFarmer ? (
    <Button variant="secondary" onClick={openFarmerConversation}>
      <MessageCircle size={16} aria-hidden="true" /> Message farmer
    </Button>
  ) : null;

  const handleOrder = async (values) => {
    let order;
    try {
      order = await createOrder({ ...values, productId: product.id });
    } catch (error) {
      if (['PRODUCT_OUT_OF_STOCK', 'INSUFFICIENT_STOCK'].includes(error.code)) {
        setStockConflict(error);
        if (error.code === 'PRODUCT_OUT_OF_STOCK') {
          showToast({
            type: 'error',
            title: 'Product Out of Stock',
            message: error.message,
          });
        }
      }
      throw error;
    }


    removeItem(product.id);
    navigate(order.paymentMethod === 'gcash'
      ? `/orders/${order.id}/pay/gcash`
      : `/orders/${order.id}/pay/cod`, {
        state: { checkoutPath: `/products/${product.id}` },
      });
  };

  return (
    <AppShell
      user={currentUser}
      navItems={navItems}
      title={isFarmerOwner ? 'Your product listing' : isPendingReview ? 'Product details' : 'Checkout'}
      subtitle={isFarmerOwner
        ? 'Review your listing details and customer feedback.'
        : isPendingReview ? 'This listing is visible while its price is under review.' : 'Review your order before placing it.'}
      headerActions={messageFarmerAction}
      pageClassName="checkout-page"
    >
      {referenceError ? <p className="muted" role="status">{referenceError}</p> : null}
      {stockRefreshError ? <p className="form-alert error" role="alert">{stockRefreshError}</p> : null}
      {!canRequest && stockConflict?.code === 'PRODUCT_OUT_OF_STOCK' ? (
        <div className="form-alert error" role="alert">
          <strong className="form-alert-title">Product Out of Stock</strong>
          <span>{stockConflict.message}</span>
          <Button variant="secondary" disabled={isRefreshingProduct} onClick={refreshProduct}>
            {isRefreshingProduct ? 'Refreshing…' : 'Refresh Product'}
          </Button>
        </div>
      ) : null}
      {adminReference ? <AdminReferenceNotice reference={adminReference} /> : null}
      {isFarmerOwner ? (
        <section className="panel" aria-labelledby="own-product-listing-title">
          {liveListingUnavailable ? (
            <p className="mb-4 rounded-lg border border-[var(--line)] bg-[var(--soft)] px-3 py-2 text-sm text-[var(--text-secondary)]" role="status">
              Showing the listing details saved when the buyer sent the inquiry. Live listing details are currently unavailable.
            </p>
          ) : null}
          <div className="grid min-w-0 gap-5 sm:grid-cols-[minmax(160px,240px)_minmax(0,1fr)]">
            <div className="min-w-0">
              <ProductImageGallery product={product} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="eyebrow">Your listing</p>
                  <h2 id="own-product-listing-title" className="text-xl font-medium text-[var(--text)]">{product.name}</h2>
                </div>
                <span className="rounded-full bg-[var(--soft)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                  {product.status || 'Status unavailable'}
                </span>
              </div>
              {product.description ? (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">{product.description}</p>
              ) : null}
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-[var(--muted)]">Price</dt>
                  <dd className="mt-0.5 font-medium text-[var(--text)]">{formatCurrency(product.price)} / {product.unit || 'unit'}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Available quantity</dt>
                  <dd className="mt-0.5 font-medium text-[var(--text)]">{product.quantity} {product.unit || 'units'}</dd>
                </div>
                {product.category ? (
                  <div>
                    <dt className="text-[var(--muted)]">Category</dt>
                    <dd className="mt-0.5 font-medium text-[var(--text)]">{product.category}</dd>
                  </div>
                ) : null}
                {product.location ? (
                  <div>
                    <dt className="text-[var(--muted)]">Location</dt>
                    <dd className="mt-0.5 font-medium text-[var(--text)]">{product.location}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </div>
        </section>
      ) : canRequest ? (
        <CheckoutForm
          product={product}
          currentUser={currentUser}
          onSubmit={handleOrder}
          onProductRefresh={refreshProduct}
          onStockConflict={setStockConflict}
          initialQuantity={location.state?.quantity ? String(location.state.quantity) : ''}
        />
      ) : (
        <div className="panel">
          <div className="empty-state compact">
            <h3>Order unavailable</h3>
            <p>
              {!ORDERING_ROLES.includes(currentUser.role)
                ? 'Only buyer or partner organization accounts can place orders.'
                : isPendingReview
                  ? 'This listing’s price is still awaiting DTI review and can’t be ordered yet.'
                  : isOutOfStock
                    ? 'This listing is currently out of stock.'
                    : 'You cannot order your own product or an inactive listing.'}
            </p>
            <Link className="btn btn-secondary btn-md" to="/marketplace">Back to marketplace</Link>
          </div>
        </div>
      )}
      <ProductReviewsFeed productId={product.id} productName={product.name} className="panel" />
      <Button variant="ghost" onClick={() => navigate(-1)}>Back</Button>
    </AppShell>
  );
}
