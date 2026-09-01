import { useEffect, useState } from 'react';
import { ArrowRight, CalendarClock, CheckCircle2, ClipboardList, Gift, HandHeart, MapPin, MessageSquare, PackageOpen, ShoppingBasket, TriangleAlert, Wheat } from 'lucide-react';
import { Link } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import StatusBadge from '../../components/common/StatusBadge';
import FarmerMap from '../../components/map/FarmerMap';
import { useAuth } from '../auth/AuthContext';
import { getUserById } from '../../services/authService';
import { getAvailableDonations, getDonationsForStakeholder } from '../../services/donationService';
import { formatDate } from '../../utils/formatters';
import { stakeholderNavItems } from './stakeholderNav';

async function buildDonationFarmers(donations) {
  const ids = [...new Set(donations.map((donation) => donation.farmerId))];
  const farmers = await Promise.all(ids.map((id) => getUserById(id).catch(() => null)));
  const byId = new Map(farmers.filter(Boolean).map((farmer) => [farmer.id, farmer]));
  return ids.flatMap((id) => {
    const farmer = byId.get(id);
    if (!farmer) return [];
    const farmerDonations = donations.filter((donation) => donation.farmerId === id);
    return [{ id: farmer.id, name: farmer.name, farmName: farmer.farmName, municipality: farmer.municipality, address: farmer.address, contactNumber: farmer.contactNumber, donations: farmerDonations.map(({ productName, quantity, unit }) => ({ productName, quantity, unit })) }];
  });
}

const EMPTY_STATE = { available: [], myRequests: [], donationFarmers: [] };

export default function StakeholderDashboard() {
  const { currentUser, acknowledgeVerification } = useAuth();
  const [state, setState] = useState(EMPTY_STATE);

  useEffect(() => {
    let cancelled = false;
    const reload = async () => {
      const available = getAvailableDonations();
      const myRequests = getDonationsForStakeholder(currentUser.id);
      const donationFarmers = await buildDonationFarmers(available);
      if (!cancelled) setState({ available, myRequests, donationFarmers });
    };
    reload();
    const interval = setInterval(reload, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [currentUser.id]);

  const { available, myRequests, donationFarmers } = state;
  const scheduled = myRequests.filter((item) => item.status === 'scheduled');
  const completed = myRequests.filter((item) => item.status === 'completed');
  const awaitingApproval = myRequests.filter((item) => item.status === 'requested');
  const latestActivity = [...myRequests].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 3);

  return <AppShell user={currentUser} navItems={stakeholderNavItems} title="Partner dashboard" subtitle="Browse surplus produce donations from Cebu farmers and track your pickup requests." pageClassName="stakeholder-dashboard-page stakeholder-operations-dashboard">
    <VerificationBanner user={currentUser} onDismiss={acknowledgeVerification} />
    <section className="stakeholder-quick-actions" aria-label="Quick actions">
      <Link to="/marketplace"><Wheat aria-hidden="true" />Browse produce</Link><Link to="/stakeholder-donations"><HandHeart aria-hidden="true" />Browse donations</Link><Link to="/stakeholder-requests"><ClipboardList aria-hidden="true" />View requests</Link><Link to="/messages"><MessageSquare aria-hidden="true" />Open messages</Link>
    </section>
    <section className="stakeholder-summary" aria-label="Donation overview">
      <SummaryStat icon={PackageOpen} label="Available donations" value={available.length} hint="Ready to request" />
      <SummaryStat icon={ClipboardList} label="My requests" value={myRequests.length} hint={awaitingApproval.length ? `${awaitingApproval.length} awaiting approval` : 'No requests awaiting approval'} tone="blue" />
      <SummaryStat icon={CalendarClock} label="Scheduled pickups" value={scheduled.length} hint={scheduled.length ? 'Pickup details are ready' : 'No pickup scheduled'} tone="amber" />
      <SummaryStat icon={CheckCircle2} label="Completed" value={completed.length} hint="Successful donations" tone="green" />
    </section>
    <section className="stakeholder-primary-grid">
      <section className="stakeholder-section"><SectionHeader title="Available donations" description="Surplus produce from Cebu farmers" actionTo="/stakeholder-donations" actionLabel="Browse all" />
        {available.length ? <div className="stakeholder-donation-list">{available.slice(0, 4).map((donation) => <DonationRow key={donation.id} donation={donation} />)}</div> : <CompactEmpty icon={Gift} title="No surplus donations available" message="New surplus produce from verified farmers will appear here." actionTo="/stakeholder-donations" actionLabel="Browse all donations" />}
      </section>
      <section className="stakeholder-section stakeholder-requests-panel"><SectionHeader title="Recent requests" description="Your latest donation activity" actionTo="/stakeholder-requests" actionLabel="View all requests" />
        {myRequests.length ? <RequestList requests={myRequests.slice(0, 5)} /> : <CompactEmpty icon={ClipboardList} title="No donation requests yet" message="Once you request surplus produce, your pickup schedule will appear here." actionTo="/stakeholder-donations" actionLabel="Browse donations" />}
      </section>
    </section>
    <section className="stakeholder-lower-grid">
      <section className="stakeholder-section stakeholder-map-panel"><SectionHeader title="Nearby surplus" description="Available donations around Cebu" actionTo="/farmer-map" actionLabel="View map" />
        <div className="stakeholder-map-legend"><span><i className="is-available" />Available donation</span><span><i className="is-organization" />Your organization</span></div><FarmerMap farmers={[]} stakeholders={[currentUser]} donationFarmers={donationFarmers} currentUserId={currentUser.id} />
        {!donationFarmers.length ? <p className="stakeholder-map-note">No nearby surplus is available right now. This map updates when farmers list a donation.</p> : null}
      </section>
      <section className="stakeholder-section stakeholder-activity-panel"><SectionHeader title="Recent activity" description="Updates to your donation requests" />
        {latestActivity.length ? <ActivityList items={latestActivity} /> : <CompactEmpty icon={ShoppingBasket} title="No activity yet" message="Donation updates and pickup schedules will appear here." />}
      </section>
    </section>
  </AppShell>;
}

function VerificationBanner({ user, onDismiss }) {
  if (user.verificationStatus === 'verified' && user.verificationAcknowledged === false) return <div className="stakeholder-verification-banner is-approved"><CheckCircle2 aria-hidden="true" /><div><strong>Your organization is verified</strong><p>You can now request surplus produce from local farmers.</p></div><button type="button" onClick={onDismiss}>Dismiss</button></div>;
  if (user.verificationStatus === 'pending') return <div className="stakeholder-verification-banner"><TriangleAlert aria-hidden="true" /><div><strong>Organization verification pending</strong><p>Your organization is being reviewed. Donation requests will be available once your account is verified.</p></div><Link to="/profile">View status</Link></div>;
  if (user.verificationStatus === 'rejected') return <div className="stakeholder-verification-banner is-rejected"><TriangleAlert aria-hidden="true" /><div><strong>Organization verification needs attention</strong><p>Update your organization details and contact support before requesting donations.</p></div><Link to="/profile">Review profile</Link></div>;
  return null;
}

function SummaryStat({ icon: Icon, label, value, hint, tone = 'default' }) { return <article className={`stakeholder-summary-stat tone-${tone}`}><Icon aria-hidden="true" /><div><p>{label}</p><strong>{value}</strong><span>{hint}</span></div></article>; }
function SectionHeader({ title, description, actionTo, actionLabel }) { return <header className="stakeholder-section-header"><div><h2>{title}</h2><p>{description}</p></div>{actionTo ? <Link to={actionTo}>{actionLabel}<ArrowRight size={15} aria-hidden="true" /></Link> : null}</header>; }
function DonationRow({ donation }) { return <article className="stakeholder-donation-row"><div className="stakeholder-donation-image">{donation.image ? <img src={donation.image} alt="" /> : <PackageOpen aria-hidden="true" />}</div><div className="stakeholder-donation-copy"><strong>{donation.productName}</strong><span>{donation.quantity} {donation.unit} available</span><small><MapPin size={13} aria-hidden="true" />{donation.location || donation.farmerName}</small></div><div className="stakeholder-donation-freshness"><span>{donation.expirationDate ? `Available until ${formatDate(donation.expirationDate)}` : 'Freshly listed'}</span><small>From {donation.farmerName}</small></div><Link to="/stakeholder-donations" className="stakeholder-row-action">Request</Link></article>; }
function RequestList({ requests }) { return <div className="stakeholder-request-list"><div className="stakeholder-request-head"><span>Produce</span><span>Farmer</span><span>Pickup date</span><span>Status</span></div>{requests.map((request) => <div className="stakeholder-request-row" key={request.id}><div><strong>{request.productName}</strong><small>{request.quantity} {request.unit}</small></div><span>{request.farmerName}</span><span>{request.pickupDate ? formatDate(request.pickupDate) : 'Awaiting schedule'}</span><StatusBadge value={request.status} type="donation" /></div>)}</div>; }
function ActivityList({ items }) { return <div className="stakeholder-activity-list">{items.map((item) => <article key={item.id}><span><CheckCircle2 aria-hidden="true" /></span><div><strong>{item.status === 'scheduled' ? 'Pickup scheduled' : item.status === 'completed' ? 'Donation received' : 'Donation request sent'}</strong><p>{item.productName} · {item.quantity} {item.unit}</p></div><time>{formatDate(item.updatedAt)}</time></article>)}</div>; }
function CompactEmpty({ icon: Icon, title, message, actionTo, actionLabel }) { return <div className="stakeholder-compact-empty"><Icon aria-hidden="true" /><div><strong>{title}</strong><p>{message}</p>{actionTo ? <Link to={actionTo}>{actionLabel}<ArrowRight size={14} aria-hidden="true" /></Link> : null}</div></div>; }
