import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUp,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  Gift,
  HeartHandshake,
  LayoutDashboard,
  Mail,
  Menu,
  Phone,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Truck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import TopRatedFarmersCarousel from '../../components/landing/TopRatedFarmersCarousel';
import BrandWordmark from '../../components/common/BrandWordmark';
import logo from '../../assets/logo.png';
import { apiClient } from '../../services/apiClient';
import directTradingIcon from '../../assets/icons/feature-direct-trading.png';
import secureCheckoutIcon from '../../assets/icons/feature-secure-checkout.png';
import deliveryTrackingIcon from '../../assets/icons/feature-delivery-tracking.png';
import surplusDonationIcon from '../../assets/icons/feature-surplus-donation.png';
import adminOversightIcon from '../../assets/icons/feature-admin-oversight.png';
import cabbagePhoto from '../../assets/landing-cabbage-basket.jpg';
import farmPhoto from '../../assets/landing-farm.jpg';
import farmPhotoEnhanced from '../../assets/landing-farm-enhanced.png';
import './LandingHero.css';
import './LandingLayout.css';
import './LandingHeader.css';
import './ExampleListing.css';
import './LandingAbout.css';




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

      {                              }
      <g fill="#22c55e">
        <circle cx="50" cy="13" r="5" />
        <circle cx="50" cy="13" r="2" fill="#f4fdf6" />
        {[0, 60, 120, 180, 240, 300].map((angle) => (
          <rect key={angle} x="49" y="6.5" width="2" height="3" rx="1" transform={`rotate(${angle} 50 13)`} />
        ))}
      </g>

      {                                        }
      <rect x="25" y="10" width="34" height="45" rx="7" fill="#ffffff" stroke="#bfe7cc" strokeWidth="1.5" />

      {                 }
      <rect x="29" y="14" width="12.5" height="14" rx="3" fill="#e8faec" />
      <g transform="translate(31.5, 17.5)" stroke="#16a34a" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M0 0h1.4l1.2 6.4h5.6l1.1-4.6H1.9" />
        <circle cx="3" cy="8.2" r="0.9" fill="#16a34a" stroke="none" />
        <circle cx="7.2" cy="8.2" r="0.9" fill="#16a34a" stroke="none" />
      </g>

      {                  }
      <rect x="43" y="14" width="12.5" height="14" rx="3" fill="#fef3e2" />
      <path d="M45.5 25 L48.5 20.5 L51 22.5 L54.5 16.5" fill="none" stroke="#f59e0b" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="54.5" cy="16.5" r="1.5" fill="#f59e0b" />

      {                      }
      <rect x="29" y="30" width="12.5" height="14" rx="3" fill="#eaf2ff" />
      <rect x="31.5" y="32.5" width="3.4" height="3.4" rx="1" fill="#2563eb" />
      <rect x="36.2" y="32.5" width="3.4" height="3.4" rx="1" fill="#93c5fd" />
      <rect x="31.5" y="37.2" width="3.4" height="3.4" rx="1" fill="#93c5fd" />
      <rect x="36.2" y="37.2" width="3.4" height="3.4" rx="1" fill="#2563eb" />

      {                  }
      <rect x="43" y="30" width="12.5" height="14" rx="3" fill="#e8faec" />
      <circle cx="49.3" cy="37" r="4.3" fill="none" stroke="#bbf0cc" strokeWidth="2.4" />
      <path d="M49.3 32.7a4.3 4.3 0 0 1 3.7 6.5" fill="none" stroke="#16a34a" strokeWidth="2.4" strokeLinecap="round" />

      {                                                                                     }
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

const TRUST_INDICATORS = ['Fair price guidance', 'Simple payment options', 'Live delivery tracking', 'Donate unsold produce'];

const FARMER_STEPS = [
  { title: 'List your produce', text: 'Add your product, quantity, price, and harvest details.' },
  { title: 'Receive orders', text: 'Buyers can find your products and order directly from you.' },
  { title: 'Deliver and get paid', text: 'Manage the order and choose your available delivery or pickup option.' },
];

const FARMER_BENEFITS = [
  { title: 'Reach more buyers', text: 'Make your produce visible beyond your local market.' },
  { title: 'Set your own selling price', text: 'Keep control of your retail and wholesale prices.' },
  { title: 'Manage orders easily', text: 'Track incoming orders and delivery progress in one place.' },
  { title: 'Reduce food waste', text: 'Offer eligible unsold produce to community partners.' },
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
  { icon: UserPlus, title: 'Register & verify', text: 'Create your account and complete verification to start selling or buying.' },
  { icon: Search, title: 'List or browse produce', text: 'Farmers add their available harvest, while buyers can search for fresh produce.' },
  { icon: CreditCard, title: 'Order & pay', text: 'Buyers place an order, choose delivery or pickup, and pay through GCash or Cash on Delivery.' },
  { icon: ClipboardCheck, title: 'Prepare & deliver', text: 'Farmers confirm the order, prepare the produce, and arrange delivery or buyer pickup.' },
  { icon: Truck, title: 'Track & receive', text: 'Buyers can follow the order status until their produce is delivered or ready for pickup.' },
  { icon: Gift, title: 'Discount or donate surplus', text: 'Unsold produce can be discounted for buyers or donated to a community partner instead of going to waste.' },
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



  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 24);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);



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
    <main className="landing-page landing-farmer-friendly">
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
          <Link className="btn btn-primary btn-md" to="/register">Create account</Link>
        </div>
        <div className="landing-mobile-menu" ref={mobileMenuRef}>
          <button
            type="button"
            className="landing-mobile-menu-toggle"
            aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isMobileMenuOpen}
            aria-controls="harvestlink-public-menu"
            onClick={() => setIsMobileMenuOpen((previous) => !previous)}
          >
            {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          {isMobileMenuOpen ? (
            <div className="landing-mobile-menu-panel" id="harvestlink-public-menu">
              {NAV_LINKS.map((link) => (
                <a key={link.id} href={`#${link.id}`} onClick={() => setIsMobileMenuOpen(false)}>{link.label}</a>
              ))}
              <div className="landing-mobile-menu-actions">
                <Link className="btn btn-secondary btn-md" to="/login">Login</Link>
                <Link className="btn btn-primary btn-md" to="/register">Create account</Link>
              </div>
            </div>
          ) : null}
        </div>
      </nav>

      <section id="home" className="landing-hero">
        <img
          className="farmer-hero-photo"
          src={farmPhotoEnhanced}
          srcSet={`${farmPhoto} 1085w, ${farmPhotoEnhanced} 1539w`}
          sizes="100vw"
          alt="Farmers harvesting a rice field with a red and white combine harvester"
          fetchPriority="high"
        />
        <div className="hero-copy-block">
          <span className="farmer-hero-label">Built for Cebu farmers and buyers</span>
          <h1>Sell your harvest<br />directly to more buyers</h1>
          <p>Reach customers across Cebu, manage orders easily, and get more value from every harvest.</p>
          <div className="hero-actions">
            <Link className="btn btn-primary btn-lg" to="/register">
              Start selling <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link className="btn btn-secondary btn-lg" to="/marketplace">Browse marketplace</Link>
          </div>
          <p className="farmer-hero-reassurance">Easy to use &middot; Mobile friendly &middot; Built for Cebu agriculture</p>
          <ul className="lp-trust-list">
            {TRUST_INDICATORS.map((item) => (
              <li key={item}><CheckCircle2 size={16} aria-hidden="true" /> {item}</li>
            ))}
          </ul>
        </div>

      </section>

      <section className="farmer-start-section" aria-labelledby="farmer-start-title">
        <h2 id="farmer-start-title">How HarvestLink helps farmers</h2>
        <p className="farmer-start-description">HarvestLink helps farmers list fresh produce, connect directly with buyers, manage orders, and track deliveries in one simple place. Unsold produce can also be offered to community partners instead of going to waste.</p>
        <ol className="farmer-start-steps">
          {FARMER_STEPS.map((step, index) => <li key={step.title}>
            <span className="farmer-step-number">{index + 1}.</span>
            <div><h3>{step.title}</h3><p>{step.text}</p></div>
          </li>)}
        </ol>
      </section>

      <section className="farmer-benefits-section" aria-labelledby="farmer-benefits-title">
        <div className="farmer-benefits-copy">
          <h2 id="farmer-benefits-title">Your harvest. More possibilities.</h2>
          <div className="farmer-benefits-list">
            {FARMER_BENEFITS.map(item => <div key={item.title}>
              <CheckCircle2 size={18} aria-hidden="true" />
              <div><h3>{item.title}</h3><p>{item.text}</p></div>
            </div>)}
          </div>
        </div>
        <article className="farmer-listing-example" aria-label="Example produce listing">
          <div className="farmer-example-image"><img src={cabbagePhoto} alt="Whole and halved fresh green cabbages in a woven basket" loading="lazy" width="1500" height="1125" /></div>
          <div className="farmer-listing-details">
            <header className="farmer-example-header">
              <span className="farmer-example-label">Example listing</span>
              <span className="farmer-example-identity"><CheckCircle2 size={15} aria-hidden="true" /> Verified farmer &middot; John Dela Cruz</span>
            </header>
            <div className="farmer-example-product">
              <h3>Fresh cabbage</h3>
              <p>Grade A &middot; Carcar City, Cebu</p>
            </div>
            <div className="farmer-example-price"><strong>&#8369;55/kg</strong><span>120 kg available</span></div>
            <p className="farmer-example-reference"><span>Market reference</span><span>&#8369;52/kg</span></p>
            <Link to="/marketplace" className="farmer-example-link">Browse fresh produce <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        </article>
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
          <p>From listing your harvest to getting it into buyers&apos; hands, HarvestLink keeps every step simple.</p>
        </div>
        <ol className="lp-timeline">
          {STEPS.map((step, index) => (
            <li key={step.title} className="lp-timeline-item">
              <span className="lp-timeline-marker">
                <step.icon size={16} />
              </span>
              <div className="lp-timeline-content">
                <span className="lp-timeline-number">{String(index + 1).padStart(2, '0')}</span>
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
            <a className="lp-contact-card" href="mailto:harvestlink@gmail.com">
              <Mail size={18} />
              <div>
                <strong>Email</strong>
                <span>harvestlink@gmail.com</span>
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

function ContactForm() {
  const [values, setValues] = useState({ name: '', email: '', message: '' });
  const [status, setStatus] = useState({ type: '', text: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field) => (event) => setValues((current) => ({ ...current, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus({ type: '', text: '' });
    setIsSubmitting(true);
    try {
      await apiClient.post('/contact', values);
      setValues({ name: '', email: '', message: '' });
      setStatus({ type: 'success', text: 'Your message has been sent.' });
    } catch (error) {
      setStatus({ type: 'error', text: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="lp-contact-form" onSubmit={handleSubmit}>
      <h3>Send us a message</h3>
      {status.text ? <p className={`form-alert ${status.type}`} role="status">{status.text}</p> : null}
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
      <button type="submit" className="btn btn-primary btn-md" disabled={isSubmitting}>
        <Send size={16} /> {isSubmitting ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}
