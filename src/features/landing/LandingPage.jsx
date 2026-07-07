import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CreditCard,
  Gift,
  HeartHandshake,
  LayoutDashboard,
  Mail,
  Phone,
  Search,
  ShieldCheck,
  Truck,
} from 'lucide-react';
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
