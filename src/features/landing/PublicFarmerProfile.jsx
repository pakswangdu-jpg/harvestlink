import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BadgeCheck, ChevronRight, MapPin } from 'lucide-react';
import ProductCard from '../../components/cards/ProductCard';
import EmptyState from '../../components/common/EmptyState';
import StarRating from '../../components/common/StarRating';
import { getPublicFarmerProfile } from '../../services/authService';
import { getPublicFarmerProducts } from '../../services/productService';
import { getInitials } from '../../utils/formatters';
import logo from '../../assets/logo.png';

// Public, no login required — reached by clicking a farmer card in the landing page's
// 5-star showcase. Browsing is open to everyone; ProductCard's "View" link points at
// /products/:id, which IS behind ProtectedRoute, so an anonymous visitor who tries to
// actually order gets bounced to /login (and back here after signing in) automatically —
// no custom auth-gating needed on this page itself.
export default function PublicFarmerProfile() {
  const { id } = useParams();
  const [farmer, setFarmer] = useState(null);
  const [products, setProducts] = useState([]);
  const [loadedId, setLoadedId] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getPublicFarmerProfile(id), getPublicFarmerProducts(id)])
      .then(([farmerResult, productsResult]) => {
        if (cancelled) return;
        setFarmer(farmerResult);
        setProducts(productsResult);
        setNotFound(false);
        setLoadedId(id);
      })
      .catch(() => {
        if (cancelled) return;
        setNotFound(true);
        setLoadedId(id);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loadedId !== id) return null;

  return (
    <main className="landing-page">
      <nav className="landing-nav">
        <Link className="brand" to="/">
          <span className="brand-mark"><img src={logo} alt="" /></span>
          <span>
            <strong>HarvestLink</strong>
            <small>Cebu farm-to-market</small>
          </span>
        </Link>
        <div className="landing-actions">
          <Link className="btn btn-secondary btn-md" to="/login">Login</Link>
          <Link className="btn btn-primary btn-md" to="/register">Register</Link>
        </div>
      </nav>

      <div className="public-farmer-page">
        <nav className="public-farmer-breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <ChevronRight size={13} aria-hidden="true" />
          <Link to="/marketplace">Marketplace</Link>
          <ChevronRight size={13} aria-hidden="true" />
          <span aria-current="page">{farmer ? (farmer.farmName || farmer.name) : 'Farmer profile'}</span>
        </nav>

        {notFound || !farmer ? (
          <section className="panel">
            <EmptyState
              title="Farmer not found"
              message="This farmer profile isn't available anymore."
            />
          </section>
        ) : (
          <>
            <section className="public-farmer-header">
              <span className="top-farmer-avatar public-farmer-avatar-lg">
                {farmer.avatarUrl ? <img src={farmer.avatarUrl} alt="" /> : getInitials(farmer.name)}
              </span>
              <div className="public-farmer-info">
                <div className="public-farmer-name-row">
                  <h1>{farmer.name}</h1>
                  {/* Every profile reachable on this page is already verification_status ===
                      'verified' server-side (see getPublicFarmerProfile) — no new field,
                      just finally surfacing what the backend already guarantees. */}
                  <span className="public-farmer-verified"><BadgeCheck size={14} /> Verified</span>
                </div>
                {farmer.farmName ? <p className="public-farmer-farm">{farmer.farmName}</p> : null}
                <p className="top-farmer-location"><MapPin size={14} /> {farmer.municipality}</p>
                <div className="public-farmer-rating">
                  <StarRating value={farmer.avgRating} size={17} />
                  <strong>{farmer.avgRating.toFixed(1)}</strong>
                  <span>({farmer.ratingCount} rating{farmer.ratingCount === 1 ? '' : 's'})</span>
                </div>
              </div>
              <div className="public-farmer-stats">
                <div className="public-farmer-stat">
                  <strong>{products.length}</strong>
                  <span>{products.length === 1 ? 'Product' : 'Products'}</span>
                </div>
              </div>
            </section>

            <section className="public-farmer-products">
              <div className="landing-section-heading">
                <p className="eyebrow">Marketplace</p>
                <h2>Available produce</h2>
              </div>
              {products.length ? (
                <div className="product-grid public-farmer-product-grid">
                  {products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      actions={(
                        <Link className="btn btn-primary btn-md" to={`/products/${product.id}`}>
                          View Details
                        </Link>
                      )}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No produce available"
                  message="No produce is currently available from this farmer right now — check back soon."
                />
              )}
              <p className="public-farmer-signin-note">
                <Link to="/register">Create a free account</Link> or <Link to="/login">sign in</Link> to place an order.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
