import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin } from 'lucide-react';
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
        <Link className="public-farmer-back" to="/">
          <ArrowLeft size={16} /> Back to home
        </Link>

        {notFound || !farmer ? (
          <section className="panel">
            <EmptyState
              title="Farmer not found"
              message="This farmer profile isn't available anymore."
            />
          </section>
        ) : (
          <>
            <section className="panel public-farmer-header">
              <span className="top-farmer-avatar public-farmer-avatar-lg">
                {farmer.avatarUrl ? <img src={farmer.avatarUrl} alt="" /> : getInitials(farmer.name)}
              </span>
              <div>
                <h1>{farmer.name}</h1>
                {farmer.farmName ? <p className="public-farmer-farm">{farmer.farmName}</p> : null}
                <p className="top-farmer-location"><MapPin size={14} /> {farmer.municipality}</p>
                <div className="public-farmer-rating">
                  <StarRating value={farmer.avgRating} size={18} />
                  <span>{farmer.ratingCount} rating{farmer.ratingCount === 1 ? '' : 's'}</span>
                </div>
              </div>
            </section>

            <section className="public-farmer-products">
              <div className="landing-section-heading">
                <p className="eyebrow">Marketplace</p>
                <h2>Available produce</h2>
              </div>
              {products.length ? (
                <div className="product-grid">
                  {products.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No active listings"
                  message="This farmer doesn't have any produce available right now — check back soon."
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
