import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Gift,
  HeartHandshake,
  LayoutDashboard,
  Mail,
  MapPin,
  Menu,
  Phone,
  Search,
  ShieldCheck,
  Truck,
  X,
} from 'lucide-react';
import StarRating from '../../components/common/StarRating';
import { getTopRatedFarmers } from '../../services/authService';
import { getInitials } from '../../utils/formatters';
import logo from '../../assets/logo.png';

const FEATURES = [
  { icon: Search, title: 'Direct farmer-to-buyer trading', text: 'Farmers list produce, buyers search and filter by product, location, price, and availability — no middlemen.' },
  { icon: CreditCard, title: 'Secure multi-payment checkout', text: 'Buyers check out with cash on delivery, GCash, Maya, card, or bank transfer.' },
  { icon: Truck, title: 'Delivery & real-time order tracking', text: 'Every order moves through a visible pipeline — confirmed, preparing, packed, out for delivery or pickup, delivered.' },
  { icon: Gift, title: 'Surplus discount & donation program', text: 'Farmers discount aging stock or donate it to partner orphanages, elder-care homes, NGOs, and food banks instead of wasting it.' },
  { icon: LayoutDashboard, title: 'Role-based dashboards', text: 'Purpose-built workspaces for farmers, buyers, partner organizations, and DTI admins.' },
  { icon: ShieldCheck, title: 'Admin oversight', text: 'Admins monitor users, listings, orders, payments, deliveries, and donation activity in one place.' },
];

const STEPS = [
  { title: 'Register & verify', text: 'Farmers, buyers, and partner organizations create an account for their role.' },
  { title: 'List or browse produce', text: 'Farmers list fresh harvests; buyers search and filter the marketplace.' },
  { title: 'Order & pay', text: 'Buyers choose a delivery method and pay by COD, GCash, Maya, card, or bank transfer.' },
  { title: 'Prepare & deliver', text: 'Farmers confirm the order and move it through preparing, packed, and delivery or pickup.' },
  { title: 'Track & receive', text: 'Buyers track every step in real time until the order is delivered.' },
  { title: 'Discount or donate surplus', text: 'Unsold aging stock can be discounted for buyers or donated to a partner organization instead of wasted.' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef(null);

  // Same click-outside-to-close pattern used by NotificationBell/the profile avatar menu.
  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;
    const handleClickOutside = (event) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target)) setIsMobileMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobileMenuOpen]);

  const [topFarmers, setTopFarmers] = useState([]);
  // Distinguishes "haven't fetched yet" from "fetched, zero qualify" — without this, the
  // empty-state message would flash for a moment on every page load before real farmers
  // (if any) show up.
  const [isLoadingFarmers, setIsLoadingFarmers] = useState(true);

  // Public endpoint (no login needed) — a showcase for signed-out visitors, so a failure
  // here should never crash the rest of the landing page, just fall back to the empty state.
  useEffect(() => {
    getTopRatedFarmers()
      .then(setTopFarmers)
      .catch(() => setTopFarmers([]))
      .finally(() => setIsLoadingFarmers(false));
  }, []);

  // Arrow-navigated carousel instead of a growing multi-row grid — with more than a
  // handful of 5-star farmers, the section stays a clean single row and the arrows page
  // through the rest, rather than the page getting taller with every extra farmer.
  const farmerTrackRef = useRef(null);
  const [canScrollFarmersLeft, setCanScrollFarmersLeft] = useState(false);
  const [canScrollFarmersRight, setCanScrollFarmersRight] = useState(false);

  const updateFarmerScrollButtons = () => {
    const track = farmerTrackRef.current;
    if (!track) return;
    setCanScrollFarmersLeft(track.scrollLeft > 4);
    setCanScrollFarmersRight(track.scrollLeft + track.clientWidth < track.scrollWidth - 4);
  };

  // Re-check once the farmers are in (a fresh scrollWidth to measure) and on resize, since
  // how many cards fit per view — and therefore whether there's anything left to scroll to
  // — depends on viewport width.
  useEffect(() => {
    updateFarmerScrollButtons();
    window.addEventListener('resize', updateFarmerScrollButtons);
    return () => window.removeEventListener('resize', updateFarmerScrollButtons);
  }, [topFarmers]);

  const scrollFarmers = (direction) => {
    const track = farmerTrackRef.current;
    if (!track) return;
    const cardWidth = track.firstElementChild?.getBoundingClientRect().width || 260;
    track.scrollBy({ left: direction * (cardWidth + 16), behavior: 'smooth' });
  };

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
        <div className="landing-links">
          <a href="#features">Features</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#about">About</a>
          <a href="#contact">Contact</a>
        </div>
        <div className="landing-actions">
          <Link className="btn btn-secondary btn-md" to="/login">Login</Link>
          <Link className="btn btn-primary btn-md" to="/register">Register</Link>
        </div>
        <div className="landing-mobile-menu" ref={mobileMenuRef}>
          <button
            type="button"
            className="landing-mobile-menu-toggle"
            aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setIsMobileMenuOpen((previous) => !previous)}
          >
            {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          {isMobileMenuOpen ? (
            <div className="landing-mobile-menu-panel">
              <a href="#features" onClick={() => setIsMobileMenuOpen(false)}>Features</a>
              <a href="#how-it-works" onClick={() => setIsMobileMenuOpen(false)}>How It Works</a>
              <a href="#about" onClick={() => setIsMobileMenuOpen(false)}>About</a>
              <a href="#contact" onClick={() => setIsMobileMenuOpen(false)}>Contact</a>
              <div className="landing-mobile-menu-actions">
                <Link className="btn btn-secondary btn-md" to="/login">Login</Link>
                <Link className="btn btn-primary btn-md" to="/register">Register</Link>
              </div>
            </div>
          ) : null}
        </div>
      </nav>

      <section id="home" className="landing-hero">
        <div className="hero-copy-block">
          <p className="eyebrow">AI-assisted farm-to-market platform</p>
          <h1>Connect Cebu farmers and buyers with payments, delivery tracking, and surplus donation.</h1>
          <p>
            HarvestLink lets farmers sell directly to buyers with secure checkout and real-time delivery
            tracking, while unsold produce gets a second life — discounted for buyers or donated to partner
            orphanages, elder-care homes, NGOs, and food banks.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary btn-lg" to="/register">
              Start trading <ArrowRight size={18} />
            </Link>
            <Link className="btn btn-secondary btn-lg" to="/login">Sign in</Link>
          </div>
        </div>

        <div className="market-preview" aria-label="HarvestLink marketplace preview">
          <div className="preview-photo">
            <img
              src="https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=900&q=80"
              alt="Green farm rows under morning light"
            />
          </div>
          <div className="preview-card">
            <span className="category-pill">Vegetables</span>
            <h2>Fresh cabbage</h2>
            <p>Carcar City, Cebu • 120 kg available</p>
            <strong>PHP 55.00 / kg</strong>
          </div>
        </div>
      </section>

      <section id="features" className="landing-feature-grid">
        {FEATURES.map((item) => (
          <article key={item.title} className="feature-tile">
            <item.icon size={22} />
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </section>

      {isLoadingFarmers ? null : (
        <section className="landing-top-farmers">
          <div className="landing-section-heading">
            <p className="eyebrow">Trusted by buyers</p>
            <h2>5-star rated farmers</h2>
          </div>
          {topFarmers.length === 0 ? (
            <p className="top-farmer-empty">No rated farmers yet — check back soon.</p>
          ) : (
          <div className="top-farmer-carousel">
            {canScrollFarmersLeft ? (
              <button
                type="button"
                className="top-farmer-arrow left"
                onClick={() => scrollFarmers(-1)}
                aria-label="Show previous farmers"
              >
                <ChevronLeft size={20} />
              </button>
            ) : null}

            <div className="top-farmer-track" ref={farmerTrackRef} onScroll={updateFarmerScrollButtons}>
              {topFarmers.map((farmer) => (
                // Not a <Link> — StarRating renders disabled <button> stars even in read-only
                // mode, and nesting those inside an <a> is invalid HTML that leaves a dead
                // click zone right over the stars (disabled buttons don't emit clicks that
                // bubble). A click/keyboard-activatable div sidesteps that entirely.
                <article
                  key={farmer.id}
                  className="top-farmer-card"
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(`/farmers/${farmer.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') navigate(`/farmers/${farmer.id}`);
                  }}
                >
                  <span className="top-farmer-avatar">
                    {farmer.avatarUrl ? <img src={farmer.avatarUrl} alt="" /> : getInitials(farmer.name)}
                  </span>
                  <h3>{farmer.name}</h3>
                  {farmer.farmName ? <p className="top-farmer-farm">{farmer.farmName}</p> : null}
                  <p className="top-farmer-location"><MapPin size={14} /> {farmer.municipality}</p>
                  <StarRating value={farmer.avgRating} size={16} />
                  <span className="top-farmer-rating-count">
                    {farmer.ratingCount} rating{farmer.ratingCount === 1 ? '' : 's'}
                  </span>
                </article>
              ))}
            </div>

            {canScrollFarmersRight ? (
              <button
                type="button"
                className="top-farmer-arrow right"
                onClick={() => scrollFarmers(1)}
                aria-label="Show more farmers"
              >
                <ChevronRight size={20} />
              </button>
            ) : null}
          </div>
          )}
        </section>
      )}

      <section id="how-it-works" className="landing-steps">
        <div className="landing-section-heading">
          <p className="eyebrow">Process</p>
          <h2>How HarvestLink works</h2>
        </div>
        <ol className="step-grid">
          {STEPS.map((step, index) => (
            <li key={step.title} className="step-tile">
              <span className="step-number">{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="stakeholder-banner">
        <HeartHandshake size={32} />
        <div>
          <h2>Are you an orphanage, elder-care home, feeding program, or NGO?</h2>
          <p>Register as a partner organization to request surplus produce donations from Cebu farmers.</p>
        </div>
        <Link className="btn btn-primary btn-md" to="/register?role=stakeholder">
          Register as a partner
        </Link>
      </section>

      <section id="about" className="landing-about">
        <div className="landing-section-heading">
          <p className="eyebrow">About</p>
          <h2>Built for Cebu's farm-to-market community</h2>
        </div>
        <p>
          HarvestLink is a capstone platform connecting Cebu farmers directly with buyers, cutting out
          middlemen and giving farmers fairer, more transparent trade. Beyond the marketplace, HarvestLink
          reduces food waste by giving farmers a way to discount or donate produce that would otherwise go
          unsold — turning surplus harvests into support for local community organizations.
        </p>
      </section>

      <section id="contact" className="landing-contact">
        <div className="landing-section-heading">
          <p className="eyebrow">Contact</p>
          <h2>Get in touch</h2>
        </div>
        <div className="contact-grid">
          <a className="contact-item" href="mailto:hello@harvestlink.ph">
            <Mail size={18} /> hello@harvestlink.ph
          </a>
          <a className="contact-item" href="tel:+639170000000">
            <Phone size={18} /> +63 917 000 0000
          </a>
        </div>
      </section>
    </main>
  );
}
