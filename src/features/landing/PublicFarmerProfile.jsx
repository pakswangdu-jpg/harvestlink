import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowRight, ChevronRight, MapPin, Sprout,
} from 'lucide-react';
import verifiedIcon from '../../assets/icons/verified-farmer.png';
import ProductCard from '../../components/cards/ProductCard';
import BrandWordmark from '../../components/common/BrandWordmark';
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
            <strong><BrandWordmark /></strong>
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
              <span className="public-farmer-avatar-lg">
                {farmer.avatarUrl ? <img src={farmer.avatarUrl} alt="" /> : getInitials(farmer.name)}
              </span>
              <div className="public-farmer-info">
                <div className="public-farmer-name-row">
                  <h1>{farmer.name}</h1>
                  {/* Every profile reachable on this page is already verification_status ===
                      'verified' server-side (see getPublicFarmerProfile) — no new field,
                      just finally surfacing what the backend already guarantees. */}
                  <span className="public-farmer-verified"><img src={verifiedIcon} alt="" width={14} height={14} className="h-3.5 w-3.5 object-contain" /> Verified</span>
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
                        <Link
                          to={`/products/${product.id}`}
                          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-green-600 text-[13px] font-semibold text-white transition-colors duration-200 hover:bg-green-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 [forced-color-adjust:none]"
                        >
                          View Details <ArrowRight size={15} />
                        </Link>
                      )}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Sprout}
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
