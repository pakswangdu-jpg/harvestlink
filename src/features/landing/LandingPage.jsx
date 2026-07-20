import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, MotionConfig } from 'framer-motion';
import {
  ArrowRight,
  ArrowUp,
  BadgeCheck,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  CloudSun,
  CreditCard,
  Gift,
  HeartHandshake,
  LayoutDashboard,
  Mail,
  MapPin,
  Menu,
  Package,
  Phone,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Truck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import StarRating from '../../components/common/StarRating';
import { getTopRatedFarmers } from '../../services/authService';
import { getInitials } from '../../utils/formatters';
import logo from '../../assets/logo.png';

const NAV_LINKS = [
  { id: 'features', label: 'Features' },
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'about', label: 'About' },
  { id: 'contact', label: 'Contact' },
];

const TRUST_INDICATORS = ['AI Price Recommendation', 'Secure Payments', 'Live Delivery Tracking', 'Donation Platform'];

const HERO_STATS = [
  { value: '500+', label: 'Farmers' },
  { value: '2,000+', label: 'Orders' },
  { value: '98%', label: 'Satisfaction' },
  { value: 'Real-time', label: 'Tracking' },
];

const FEATURES = [
  { icon: Search, title: 'Direct farmer-to-buyer trading', text: 'Farmers list produce, buyers search and filter by product, location, price, and availability — no middlemen.' },
  { icon: CreditCard, title: 'Secure multi-payment checkout', text: 'Buyers check out with cash on delivery or GCash, with every transaction verified before it settles.' },
  { icon: Truck, title: 'Delivery & real-time order tracking', text: 'Every order moves through a visible pipeline — confirmed, preparing, packed, out for delivery or pickup, delivered.' },
  { icon: Gift, title: 'Surplus discount & donation program', text: 'Farmers discount aging stock or donate it to partner orphanages, elder-care homes, NGOs, and food banks instead of wasting it.' },
  { icon: LayoutDashboard, title: 'Role-based dashboards', text: 'Purpose-built workspaces for farmers, buyers, partner organizations, and admins.' },
  { icon: ShieldCheck, title: 'Admin oversight', text: 'Admins monitor users, listings, orders, payments, deliveries, and donation activity in one place.' },
];

const STEPS = [
  { icon: UserPlus, title: 'Register & verify', text: 'Farmers, buyers, and partner organizations create an account for their role.' },
  { icon: Search, title: 'List or browse produce', text: 'Farmers list fresh harvests; buyers search and filter the marketplace.' },
  { icon: CreditCard, title: 'Order & pay', text: 'Buyers choose a delivery method and pay by cash on delivery or GCash.' },
  { icon: ClipboardCheck, title: 'Prepare & deliver', text: 'Farmers confirm the order and move it through preparing, packed, and delivery or pickup.' },
  { icon: Truck, title: 'Track & receive', text: 'Buyers track every step in real time until the order is delivered.' },
  { icon: Gift, title: 'Discount or donate surplus', text: 'Unsold aging stock can be discounted for buyers or donated to a partner organization instead of wasted.' },
];

const ABOUT_HIGHLIGHTS = [
  'Direct farmer-to-buyer trading with no middleman markup',
  'Real-time order tracking from confirmation to delivery',
  'A built-in donation pipeline that turns surplus harvests into community support',
];

const ABOUT_BADGES = [
  { icon: Sparkles, label: 'AI Powered' },
  { icon: ShieldCheck, label: 'Secure Payments' },
  { icon: Users, label: 'Community Driven' },
  { icon: Truck, label: 'Real-Time Tracking' },
];

const FADE_UP = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
};

export default function LandingPage() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState('home');
  const mobileMenuRef = useRef(null);

  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;
    const handleClickOutside = (event) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target)) setIsMobileMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobileMenuOpen]);

  // Drives both the sticky navbar's glass-blur transition and the floating back-to-top
  // button's visibility — one scroll listener instead of two identical ones.
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 24);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Scrollspy — highlights whichever nav section is currently most visible, so the active
  // indicator tracks scroll position instead of only updating on click.
  useEffect(() => {
    const sections = NAV_LINKS.map((link) => document.getElementById(link.id)).filter(Boolean);
    if (!sections.length) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length) setActiveSection(visible[0].target.id);
      },
      { rootMargin: '-40% 0px -50% 0px' },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const [topFarmers, setTopFarmers] = useState([]);
  const [isLoadingFarmers, setIsLoadingFarmers] = useState(true);

  // Public endpoint (no login needed) — a showcase for signed-out visitors, so a failure
  // here should never crash the rest of the landing page, just fall back to the empty state.
  useEffect(() => {
    getTopRatedFarmers()
      .then((farmers) => setTopFarmers(farmers.slice(0, 3)))
      .catch(() => setTopFarmers([]))
      .finally(() => setIsLoadingFarmers(false));
  }, []);

  return (
    // reducedMotion="user" — respects the OS-level "reduce motion" accessibility setting by
    // skipping transform/opacity animations for visitors who've asked for it, without every
    // motion.* usage below needing its own check.
    <MotionConfig reducedMotion="user">
    <main className="landing-page">
      <nav className={`landing-nav ${isScrolled ? 'is-scrolled' : ''}`}>
        <Link className="brand" to="/">
          <span className="brand-mark"><img src={logo} alt="" /></span>
          <span>
            <strong>HarvestLink</strong>
            <small>Cebu farm-to-market</small>
          </span>
        </Link>
        <div className="landing-links">
          {NAV_LINKS.map((link) => (
            <a key={link.id} href={`#${link.id}`} className={activeSection === link.id ? 'active' : ''}>
              {link.label}
            </a>
          ))}
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
              {NAV_LINKS.map((link) => (
                <a key={link.id} href={`#${link.id}`} onClick={() => setIsMobileMenuOpen(false)}>{link.label}</a>
              ))}
              <div className="landing-mobile-menu-actions">
                <Link className="btn btn-secondary btn-md" to="/login">Login</Link>
                <Link className="btn btn-primary btn-md" to="/register">Register</Link>
              </div>
            </div>
          ) : null}
        </div>
      </nav>

      <section id="home" className="landing-hero">
        <motion.div className="hero-copy-block" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <span className="lp-badge"><Sparkles size={14} /> AI-Assisted Farm-to-Market Platform</span>
          <h1>Connect Cebu Farmers and Buyers Through Smart Agricultural Commerce</h1>
          <p>
            Farmers sell directly to buyers with secure checkout and real-time delivery tracking — while unsold
            produce gets a second life through discounts or donations to local community partners.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary btn-lg" to="/register">
              Get Started <ArrowRight size={18} />
            </Link>
            <a className="btn btn-secondary btn-lg" href="#features">Learn More</a>
          </div>
          <ul className="lp-trust-list">
            {TRUST_INDICATORS.map((item) => (
              <li key={item}><CheckCircle2 size={16} /> {item}</li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          className="lp-preview"
          aria-label="HarvestLink dashboard preview"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.15 }}
        >
          <div className="lp-preview-card">
            <div className="lp-preview-header">
              <span className="lp-preview-avatar">MD</span>
              <div>
                <strong>Maria Dela Cruz</strong>
                <span className="lp-preview-farm"><BadgeCheck size={13} /> Dela Cruz Farm · Verified farmer</span>
              </div>
            </div>

            <div className="lp-preview-product">
              <span className="category-pill">Vegetables</span>
              <h3>Fresh Cabbage</h3>
              <p>Carcar City, Cebu · Grade A</p>
            </div>

            <div className="lp-preview-price-row">
              <div className="lp-preview-price ai">
                <span>AI Recommended</span>
                <strong>₱55.00/kg</strong>
              </div>
              <div className="lp-preview-price">
                <span>Market Price</span>
                <strong>₱52.00/kg</strong>
              </div>
            </div>

            <div className="lp-preview-chips">
              <span className="lp-preview-chip"><CloudSun size={14} /> 29°C · Sunny</span>
              <span className="lp-preview-chip"><TrendingUp size={14} /> High demand</span>
              <span className="lp-preview-chip"><Package size={14} /> 120kg in stock</span>
            </div>

            <div className="lp-preview-steps">
              {['Preparing', 'Packed', 'Out for delivery', 'Delivered'].map((step, index) => (
                <div key={step} className={`lp-preview-step ${index <= 2 ? 'done' : ''} ${index === 2 ? 'current' : ''}`}>
                  <span className="lp-preview-step-dot" />
                  {step}
                </div>
              ))}
            </div>
          </div>

          <motion.div
            className="lp-float-stat top"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <strong>{HERO_STATS[0].value}</strong> {HERO_STATS[0].label}
            <em />
            <strong>{HERO_STATS[1].value}</strong> {HERO_STATS[1].label}
          </motion.div>

          <motion.div
            className="lp-float-stat bottom"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.65 }}
          >
            <strong>{HERO_STATS[2].value}</strong> {HERO_STATS[2].label}
            <em />
            <strong>{HERO_STATS[3].value}</strong> {HERO_STATS[3].label}
          </motion.div>
        </motion.div>
      </section>

      <section id="features" className="landing-feature-grid">
        {FEATURES.map((item, index) => (
          <motion.article
            key={item.title}
            className="lp-feature-card"
            {...FADE_UP}
            transition={{ duration: 0.5, delay: index * 0.06 }}
          >
            <span className="lp-feature-icon"><item.icon size={22} /></span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </motion.article>
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
            <div className="lp-farmer-grid">
              {topFarmers.map((farmer, index) => (
                <motion.article key={farmer.id} className="lp-farmer-card" {...FADE_UP} transition={{ duration: 0.5, delay: index * 0.08 }}>
                  <span className="lp-verified-badge"><BadgeCheck size={13} /> Verified farmer</span>
                  <span className="top-farmer-avatar">
                    {farmer.avatarUrl ? <img src={farmer.avatarUrl} alt="" /> : getInitials(farmer.name)}
                  </span>
                  <h3>{farmer.name}</h3>
                  {farmer.farmName ? <p className="top-farmer-farm">{farmer.farmName}</p> : null}
                  <p className="top-farmer-location"><MapPin size={14} /> {farmer.municipality}</p>
                  <div className="lp-farmer-rating">
                    <StarRating value={farmer.avgRating} size={16} />
                    <span className="top-farmer-rating-count">
                      {farmer.avgRating.toFixed(1)} ({farmer.ratingCount} rating{farmer.ratingCount === 1 ? '' : 's'})
                    </span>
                  </div>
                  <Link className="btn btn-secondary btn-md lp-farmer-card-btn" to={`/farmers/${farmer.id}`}>
                    View Profile
                  </Link>
                </motion.article>
              ))}
            </div>
          )}
        </section>
      )}

      <section id="how-it-works" className="landing-steps">
        <div className="landing-section-heading">
          <p className="eyebrow">Process</p>
          <h2>How HarvestLink works</h2>
        </div>
        <ol className="lp-timeline">
          {STEPS.map((step, index) => (
            <motion.li
              key={step.title}
              className="lp-timeline-item"
              {...FADE_UP}
              transition={{ duration: 0.5, delay: index * 0.08 }}
            >
              <span className="lp-timeline-marker">
                <span className="lp-timeline-number">{index + 1}</span>
                <step.icon size={16} />
              </span>
              <div className="lp-timeline-content">
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </motion.li>
          ))}
        </ol>
      </section>

      <motion.section className="lp-donation-cta" {...FADE_UP} transition={{ duration: 0.6 }}>
        <span className="lp-donation-icon"><HeartHandshake size={30} /></span>
        <div className="lp-donation-copy">
          <h2>Are you an orphanage, elder-care home, feeding program, or NGO?</h2>
          <p>Register as a partner organization to request surplus produce donations from Cebu farmers.</p>
        </div>
        <div className="lp-donation-actions">
          <Link className="btn btn-primary btn-lg" to="/register?role=stakeholder">Become a Partner</Link>
          <a className="btn btn-secondary btn-lg" href="#about">Learn More</a>
        </div>
      </motion.section>

      <section id="about" className="lp-about">
        <motion.div
          className="lp-about-image"
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6 }}
        >
          <img
            src="https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=900&q=80"
            alt="Green farm rows under morning light"
          />
        </motion.div>
        <motion.div
          className="lp-about-content"
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6 }}
        >
          <p className="eyebrow">About</p>
          <h2>Built for Cebu&apos;s farm-to-market community</h2>

          <div className="lp-about-block">
            <h4>Mission</h4>
            <p>Give Cebu&apos;s farmers direct, fair access to buyers — and a dignified way to turn surplus harvests into community support instead of waste.</p>
          </div>
          <div className="lp-about-block">
            <h4>Vision</h4>
            <p>A farm-to-market ecosystem where every harvest finds a buyer, every transaction is transparent, and no fresh produce goes to waste.</p>
          </div>
          <div className="lp-about-block">
            <h4>Platform overview</h4>
            <p>
              HarvestLink is a capstone platform connecting Cebu farmers directly with buyers, cutting out
              middlemen and giving farmers fairer, more transparent trade — while reducing food waste through
              a built-in surplus donation pipeline.
            </p>
          </div>

          <ul className="lp-about-highlights">
            {ABOUT_HIGHLIGHTS.map((item) => (
              <li key={item}><CheckCircle2 size={16} /> {item}</li>
            ))}
          </ul>

          <div className="lp-badge-row">
            {ABOUT_BADGES.map((badge) => (
              <span key={badge.label} className="lp-pill-badge"><badge.icon size={14} /> {badge.label}</span>
            ))}
          </div>
        </motion.div>
      </section>

      <section id="contact" className="lp-contact">
        <div className="landing-section-heading">
          <p className="eyebrow">Contact</p>
          <h2>Get in touch</h2>
        </div>

        <div className="lp-contact-grid">
          <div className="lp-contact-cards">
            <a className="lp-contact-card" href="mailto:hello@harvestlink.ph">
              <Mail size={18} />
              <div>
                <strong>Email</strong>
                <span>hello@harvestlink.ph</span>
              </div>
            </a>
            <a className="lp-contact-card" href="tel:+639170000000">
              <Phone size={18} />
              <div>
                <strong>Phone</strong>
                <span>+63 917 000 0000</span>
              </div>
            </a>
            <div className="lp-contact-card">
              <Building2 size={18} />
              <div>
                <strong>Office</strong>
                <span>Cebu City, Philippines</span>
              </div>
            </div>
            <div className="lp-contact-card">
              <CalendarClock size={18} />
              <div>
                <strong>Business hours</strong>
                <span>Mon – Sat, 8:00 AM – 6:00 PM</span>
              </div>
            </div>
          </div>

          <ContactForm />

          <div className="lp-contact-map">
            <iframe
              title="HarvestLink — Cebu City"
              src="https://www.google.com/maps?q=Cebu%20City,%20Philippines&output=embed"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-top">
          <div className="lp-footer-brand">
            <span className="brand-mark"><img src={logo} alt="" /></span>
            <div>
              <strong>HarvestLink</strong>
              <p>Connecting Cebu farmers and buyers through smart agricultural commerce.</p>
            </div>
          </div>

          <div className="lp-footer-col">
            <h4>Quick Links</h4>
            {NAV_LINKS.map((link) => <a key={link.id} href={`#${link.id}`}>{link.label}</a>)}
          </div>

          <div className="lp-footer-col">
            <h4>Platform Features</h4>
            {FEATURES.slice(0, 4).map((item) => <a key={item.title} href="#features">{item.title}</a>)}
          </div>

          <div className="lp-footer-col">
            <h4>Support</h4>
            <a href="#contact">Contact us</a>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </div>

          <div className="lp-footer-col">
            <h4>Legal</h4>
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
          </div>
        </div>

        <div className="lp-footer-bottom">
          <p>© {new Date().getFullYear()} HarvestLink. Cebu farm-to-market capstone platform.</p>
          <button type="button" className="lp-back-to-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <ArrowUp size={16} /> Back to top
          </button>
        </div>
      </footer>

      {isScrolled ? (
        <button
          type="button"
          className="lp-floating-top"
          aria-label="Back to top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <ArrowUp size={18} />
        </button>
      ) : null}
    </main>
    </MotionConfig>
  );
}

// No backend inbox exists for landing-page inquiries, so submitting composes a real email
// via the visitor's own mail client instead of faking a "message sent" success state that
// would silently go nowhere.
function ContactForm() {
  const [values, setValues] = useState({ name: '', email: '', message: '' });

  const handleChange = (field) => (event) => setValues((current) => ({ ...current, [field]: event.target.value }));

  const handleSubmit = (event) => {
    event.preventDefault();
    const subject = encodeURIComponent(`Message from ${values.name || 'HarvestLink visitor'}`);
    const body = encodeURIComponent(`${values.message}\n\n— ${values.name} (${values.email})`);
    window.location.href = `mailto:hello@harvestlink.ph?subject=${subject}&body=${body}`;
  };

  return (
    <form className="lp-contact-form" onSubmit={handleSubmit}>
      <h3>Send us a message</h3>
      <label>
        Name
        <input type="text" required value={values.name} onChange={handleChange('name')} placeholder="Your name" />
      </label>
      <label>
        Email
        <input type="email" required value={values.email} onChange={handleChange('email')} placeholder="you@email.com" />
      </label>
      <label>
        Message
        <textarea required rows={4} value={values.message} onChange={handleChange('message')} placeholder="How can we help?" />
      </label>
      <button type="submit" className="btn btn-primary btn-md">
        <Send size={16} /> Send message
      </button>
    </form>
  );
}
