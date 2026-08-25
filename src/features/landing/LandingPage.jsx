import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUp,
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
import TopRatedFarmersCarousel from '../../components/landing/TopRatedFarmersCarousel';
import BrandWordmark from '../../components/common/BrandWordmark';
import logo from '../../assets/logo.png';
import verifiedIcon from '../../assets/icons/verified-farmer.png';
import directTradingIcon from '../../assets/icons/feature-direct-trading.png';
import secureCheckoutIcon from '../../assets/icons/feature-secure-checkout.png';
import deliveryTrackingIcon from '../../assets/icons/feature-delivery-tracking.png';
import surplusDonationIcon from '../../assets/icons/feature-surplus-donation.png';
import adminOversightIcon from '../../assets/icons/feature-admin-oversight.png';

// Custom illustration for "Role-based dashboards" — three role avatars (farmer/buyer/admin)
// feeding into one dashboard panel, matching the reference the client supplied rather than
// the plain LayoutDashboard glyph or the old feature-role-dashboards.png artwork.
function RoleDashboardsIcon({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="role-dash-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d3f3dd" />
          <stop offset="100%" stopColor="#f4fdf6" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="58" height="58" rx="18" fill="url(#role-dash-bg)" />

      {/* Settings gear, top-right */}
      <g fill="#22c55e">
        <circle cx="50" cy="13" r="5" />
        <circle cx="50" cy="13" r="2" fill="#f4fdf6" />
        {[0, 60, 120, 180, 240, 300].map((angle) => (
          <rect key={angle} x="49" y="6.5" width="2" height="3" rx="1" transform={`rotate(${angle} 50 13)`} />
        ))}
      </g>

      {/* Dashboard panel, a 2x2 widget grid */}
      <rect x="25" y="10" width="34" height="45" rx="7" fill="#ffffff" stroke="#bfe7cc" strokeWidth="1.5" />

      {/* Cart widget */}
      <rect x="29" y="14" width="12.5" height="14" rx="3" fill="#e8faec" />
      <g transform="translate(31.5, 17.5)" stroke="#16a34a" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M0 0h1.4l1.2 6.4h5.6l1.1-4.6H1.9" />
        <circle cx="3" cy="8.2" r="0.9" fill="#16a34a" stroke="none" />
        <circle cx="7.2" cy="8.2" r="0.9" fill="#16a34a" stroke="none" />
      </g>

      {/* Trend widget */}
      <rect x="43" y="14" width="12.5" height="14" rx="3" fill="#fef3e2" />
      <path d="M45.5 25 L48.5 20.5 L51 22.5 L54.5 16.5" fill="none" stroke="#f59e0b" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="54.5" cy="16.5" r="1.5" fill="#f59e0b" />

      {/* Stat-grid widget */}
      <rect x="29" y="30" width="12.5" height="14" rx="3" fill="#eaf2ff" />
      <rect x="31.5" y="32.5" width="3.4" height="3.4" rx="1" fill="#2563eb" />
      <rect x="36.2" y="32.5" width="3.4" height="3.4" rx="1" fill="#93c5fd" />
      <rect x="31.5" y="37.2" width="3.4" height="3.4" rx="1" fill="#93c5fd" />
      <rect x="36.2" y="37.2" width="3.4" height="3.4" rx="1" fill="#2563eb" />

      {/* Donut widget */}
      <rect x="43" y="30" width="12.5" height="14" rx="3" fill="#e8faec" />
      <circle cx="49.3" cy="37" r="4.3" fill="none" stroke="#bbf0cc" strokeWidth="2.4" />
      <path d="M49.3 32.7a4.3 4.3 0 0 1 3.7 6.5" fill="none" stroke="#16a34a" strokeWidth="2.4" strokeLinecap="round" />

      {/* Role avatars, stacked on the left edge, each linked to the panel by a small dot */}
      {[
        { y: 15, fill: '#16a34a' },
        { y: 31, fill: '#f59e0b' },
        { y: 47, fill: '#2563eb' },
      ].map(({ y, fill }) => (
        <g key={y}>
          <circle cx="13" cy={y} r="8" fill="white" stroke={fill} strokeWidth="1.5" />
          <circle cx="13" cy={y - 2.2} r="2.7" fill={fill} />
          <path d={`M7 ${y + 7}a6 6 0 0 1 12 0Z`} fill={fill} />
          <circle cx="23" cy={y} r="1.6" fill={fill} />
        </g>
      ))}
    </svg>
  );
}

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
  { icon: Search, iconSrc: directTradingIcon, title: 'Direct farmer-to-buyer trading', text: 'Farmers list produce, buyers search and filter by product, location, price, and availability — no middlemen.' },
  { icon: CreditCard, iconSrc: secureCheckoutIcon, title: 'Secure multi-payment checkout', text: 'Buyers check out with cash on delivery or GCash, with every transaction verified before it settles.' },
  { icon: Truck, iconSrc: deliveryTrackingIcon, title: 'Delivery & real-time order tracking', text: 'Every order moves through a visible pipeline — confirmed, preparing, packed, out for delivery or pickup, delivered.' },
  { icon: Gift, iconSrc: surplusDonationIcon, title: 'Surplus discount & donation program', text: 'Farmers discount aging stock or donate it to partner orphanages, elder-care homes, NGOs, and food banks instead of wasting it.' },
  { icon: LayoutDashboard, iconComponent: RoleDashboardsIcon, title: 'Role-based dashboards', text: 'Purpose-built workspaces for farmers, buyers, partner organizations, and admins.' },
  { icon: ShieldCheck, iconSrc: adminOversightIcon, title: 'Admin oversight', text: 'Admins monitor users, listings, orders, price monitoring, payments, deliveries, and donation activity in one place.' },
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

  return (
    <main className="landing-page">
      <nav className={`landing-nav ${isScrolled ? 'is-scrolled' : ''}`}>
        <Link className="brand" to="/">
          <span className="brand-mark"><img src={logo} alt="" /></span>
          <span>
            <strong><BrandWordmark /></strong>
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
        <div className="hero-copy-block">
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
        </div>

        <div className="lp-preview" aria-label="HarvestLink dashboard preview">
          <div className="lp-preview-card">
            <div className="lp-preview-header">
              <span className="lp-preview-avatar">MD</span>
              <div>
                <strong>Maria Dela Cruz</strong>
                <span className="lp-preview-farm"><img src={verifiedIcon} alt="" width={13} height={13} className="h-[13px] w-[13px] object-contain" /> Dela Cruz Farm · Verified farmer</span>
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

          <div className="lp-float-stat top">
            <strong>{HERO_STATS[0].value}</strong> {HERO_STATS[0].label}
            <em />
            <strong>{HERO_STATS[1].value}</strong> {HERO_STATS[1].label}
          </div>

          <div className="lp-float-stat bottom">
            <strong>{HERO_STATS[2].value}</strong> {HERO_STATS[2].label}
            <em />
            <strong>{HERO_STATS[3].value}</strong> {HERO_STATS[3].label}
          </div>
        </div>
      </section>

      <section id="features" className="landing-feature-grid">
        {FEATURES.map((item) => (
          <article key={item.title} className="lp-feature-card">
            <span className={`lp-feature-icon${item.iconSrc || item.iconComponent ? ' lp-feature-icon-image' : ''}`}>
              {item.iconComponent ? <item.iconComponent /> : item.iconSrc ? <img src={item.iconSrc} alt="" /> : <item.icon size={22} />}
            </span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </section>

      <TopRatedFarmersCarousel />

      <section id="how-it-works" className="landing-steps">
        <div className="landing-section-heading">
          <p className="eyebrow">Process</p>
          <h2>How HarvestLink works</h2>
        </div>
        <ol className="lp-timeline">
          {STEPS.map((step, index) => (
            <li key={step.title} className="lp-timeline-item">
              <span className="lp-timeline-marker">
                <span className="lp-timeline-number">{index + 1}</span>
                <step.icon size={16} />
              </span>
              <div className="lp-timeline-content">
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="lp-donation-cta">
        <span className="lp-donation-icon"><HeartHandshake size={30} /></span>
        <div className="lp-donation-copy">
          <h2>Are you an orphanage, elder-care home, feeding program, or NGO?</h2>
          <p>Register as a partner organization to request surplus produce donations from Cebu farmers.</p>
        </div>
        <div className="lp-donation-actions">
          <Link className="btn btn-primary btn-lg" to="/register?role=stakeholder">Become a Partner</Link>
          <a className="btn btn-secondary btn-lg" href="#about">Learn More</a>
        </div>
      </section>

      <section id="about" className="lp-about">
        <div className="lp-about-image">
          <img
            src="https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=900&q=80"
            alt="Green farm rows under morning light"
          />
        </div>
        <div className="lp-about-content">
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
        </div>
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
            <a className="lp-contact-card" href="tel:+639455993970">
              <Phone size={18} />
              <div>
                <strong>Phone</strong>
                <span>0945 599 3970</span>
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
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-top">
          <div className="lp-footer-brand">
            <span className="brand-mark"><img src={logo} alt="" /></span>
            <div>
              <strong><BrandWordmark /></strong>
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
            <Link to="/privacy-policy">Privacy Policy</Link>
            <Link to="/terms-of-service">Terms of Service</Link>
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
