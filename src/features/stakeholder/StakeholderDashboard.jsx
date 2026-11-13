import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CalendarClock, CheckCircle2, ClipboardList, Gift, HandHeart, MapPin, MessageSquare, PackageOpen, ShoppingBasket, TriangleAlert, Wheat, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import StatusBadge from '../../components/common/StatusBadge';
import FarmerMap from '../../components/map/FarmerMap';
import DeliveryMap from '../../components/orders/DeliveryMap';
import { includeCurrentRoleProfile } from '../../components/map/mapDirectoryProfiles';
import { useAuth } from '../auth/AuthContext';
import { getNearbyMapProfiles } from '../../services/authService';
import { getAvailableDonations, getDonationsForStakeholder } from '../../services/donationService';
import { formatDate, formatRelativeTime } from '../../utils/formatters';
import { formatNearbyDistance, getRegisteredCoordinates, sortByRegisteredDistance } from '../../utils/geo';
import { getMunicipalityCoords } from '../../utils/constants';
import { activityTitle, buildDonationFarmers, findNewAvailableDonations, partnerDashboardOverview, requestNextStep, stakeholderPickupDisplayStatus } from './dashboardPresentation';
import { stakeholderNavItems } from './stakeholderNav';
import { DONATION_MARKER_COLOR } from '../../components/map/donationMarker';
import './StakeholderDashboard.css';

const EMPTY_STATE = { available: [], myRequests: [], donationFarmers: [], mapProfiles: [] };

export default function StakeholderDashboard() {
  const { currentUser, acknowledgeVerification } = useAuth();
  const [state, setState] = useState(EMPTY_STATE);
  const [loadError, setLoadError] = useState('');
  const [newDonationAlert, setNewDonationAlert] = useState([]);
  const previousAvailableDonationIds = useRef(null);
  const refreshInProgress = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const reload = async () => {
      if (refreshInProgress.current) return;
      refreshInProgress.current = true;
      try {
        const [available, myRequests, mapProfiles] = await Promise.all([
          getAvailableDonations(),
          getDonationsForStakeholder(currentUser.id),
          getNearbyMapProfiles(),
        ]);
        const donationFarmers = buildDonationFarmers(available, mapProfiles);
        const newDonations = findNewAvailableDonations(available, previousAvailableDonationIds.current);
        previousAvailableDonationIds.current = new Set(available.map((donation) => String(donation.id)));
        if (!cancelled) {
          setState({ available, myRequests, donationFarmers, mapProfiles });
          if (newDonations.length) {
            const profilesById = new Map(mapProfiles.map((profile) => [String(profile.id), profile]));
            setNewDonationAlert(newDonations.slice(0, 3).map((donation) => {
              const farmer = profilesById.get(String(donation.farmerId));
              return {
                ...donation,
                farmerName: donation.farmerName || farmer?.farmName || farmer?.name || 'A farmer',
              };
            }));
          }
          setLoadError('');
        }
      } finally {
        refreshInProgress.current = false;
      }
    };
    const refresh = () => reload().catch((error) => { if (!cancelled) setLoadError(error.message); });
    refresh();
    const interval = setInterval(refresh, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [currentUser.id]);

  const { available, myRequests, donationFarmers, mapProfiles } = state;
  const { scheduled, completed, awaitingApproval, latestActivity, recentRequests, nextPickup, attention } = partnerDashboardOverview(myRequests);
  const nearbyFarmers = sortByRegisteredDistance(getRegisteredCoordinates(currentUser), donationFarmers);
  const farmersById = new Map(nearbyFarmers.map(farmer => [farmer.id, farmer]));
  const discoveryDonations = [...available].sort((a, b) => (farmersById.get(a.farmerId)?.distanceKm ?? Infinity) - (farmersById.get(b.farmerId)?.distanceKm ?? Infinity));
  const mapFarmers = nearbyFarmers.map(farmer => ({ ...farmer, donationDetailsHref: '/stakeholder-donations', distanceLabel: Number.isFinite(farmer.distanceKm) ? formatNearbyDistance(farmer.distanceKm) : '' }));
  const activeMapFarmers = useMemo(
    () => includeCurrentRoleProfile(mapProfiles.filter((profile) => profile.role === 'farmer'), 'farmer', currentUser),
    [mapProfiles, currentUser],
  );
  const activeMapBuyers = useMemo(
    () => includeCurrentRoleProfile(mapProfiles.filter((profile) => profile.role === 'buyer'), 'buyer', currentUser),
    [mapProfiles, currentUser],
  );
  const activeMapStakeholders = useMemo(
    () => includeCurrentRoleProfile(mapProfiles.filter((profile) => profile.role === 'stakeholder'), 'stakeholder', currentUser),
    [mapProfiles, currentUser],
  );
  const currentUserCoords = getRegisteredCoordinates(currentUser);
  const nearbyMapCenter = currentUserCoords || getMunicipalityCoords(currentUser.municipality);

  return <AppShell user={currentUser} navItems={stakeholderNavItems} title="Partner dashboard" subtitle="Find available surplus produce, manage donation requests, and track scheduled pickups." pageClassName="stakeholder-dashboard-page stakeholder-operations-dashboard">
    <VerificationBanner user={currentUser} onDismiss={acknowledgeVerification} />
    {loadError ? <div className="form-alert error" role="alert">{loadError}</div> : null}
    <section className="stakeholder-quick-actions" aria-label="Quick actions">
      <Link className="is-primary" to="/stakeholder-donations" title="Find surplus produce offered for donation."><HandHeart aria-hidden="true" />Browse donations</Link><Link to="/marketplace" title="Explore marketplace products available for purchase."><Wheat aria-hidden="true" />Browse produce</Link><Link to="/stakeholder-requests"><ClipboardList aria-hidden="true" />My requests</Link><Link to="/messages"><MessageSquare aria-hidden="true" />Messages</Link>
    </section>
    <section className="stakeholder-summary" aria-label="Donation overview">
      <SummaryStat icon={PackageOpen} label="Available donations" value={available.length} hint="Ready to request" />
      <SummaryStat icon={ClipboardList} label="My requests" value={myRequests.length} hint={awaitingApproval.length ? `${awaitingApproval.length} awaiting Farmer response` : 'No requests awaiting approval'} tone="blue" />
      <SummaryStat icon={CalendarClock} label="Scheduled pickups" value={scheduled.length} hint={nextPickup ? `Next pickup ${formatDate(nextPickup.pickupDate)}` : scheduled.length ? 'Review pickup details' : 'No pickup scheduled'} tone="amber" />
      <SummaryStat icon={CheckCircle2} label="Completed" value={completed.length} hint="Successful donations" tone="green" />
    </section>
    <div className="stakeholder-map-pair">
      <section className="stakeholder-section stakeholder-map-panel"><SectionHeader title="Nearby surplus" description="Donations available around your saved location" actionTo="/farmer-map" actionLabel="View map" live />
        {newDonationAlert.length ? (
          <div className="stakeholder-donation-map-alert" role="status" aria-live="polite">
            <Gift size={18} aria-hidden="true" />
            <div>
              <strong>New donation from a farmer</strong>
              {newDonationAlert.map((donation) => (
                <p key={donation.id}>
                  <b>{donation.farmerName || 'A farmer'}</b> donated {donation.productName}
                    {donation.quantity ? ` (${donation.quantity}${donation.unit ? ` ${donation.unit}` : ''})` : ''}.
                </p>
              ))}
            </div>
            <button type="button" onClick={() => setNewDonationAlert([])} aria-label="Dismiss new donation alert">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <div className="stakeholder-map-legend">
          <span><i className="is-available" style={{ background: DONATION_MARKER_COLOR }} />Available donation</span>
        </div>
        <FarmerMap
          donationFarmers={mapFarmers}
          initialCenter={nearbyMapCenter}
          currentUserId={currentUser.id}
          animateDonationAlerts
        />
        {!donationFarmers.length ? <p className="stakeholder-map-note">No nearby surplus is available right now. This map updates when farmers list a donation.</p> : null}
      </section>
      <section className="stakeholder-section stakeholder-active-users-panel">
        <SectionHeader title="Active Users" description="Farmers, buyers, and stakeholders around Cebu" live />
        <div className="stakeholder-map-legend" aria-label="Map marker legend">
          <span><i className="is-account" />Your account</span>
          <span><i className="is-farmer" />Farmer</span>
          <span><i className="is-buyer" />Buyer</span>
          <span><i className="is-stakeholder" />Stakeholder</span>
        </div>
        <DeliveryMap
          farmers={activeMapFarmers}
          buyers={activeMapBuyers}
          stakeholders={activeMapStakeholders}
          currentUserId={currentUser.id}
          separateOverlappingPins
          viewerCoords={currentUserCoords}
          viewerAddress={currentUser.address || currentUser.municipality || ''}
        />
      </section>
    </div>
    {attention.length ? (
      <section className="stakeholder-attention" aria-label="Needs your attention">
        <div className="stakeholder-attention-header">
          <h2>Needs your attention</h2>
          <span className="live-indicator"><span className="live-dot" /> Live</span>
        </div>
        {attention.slice(0, 3).map(item => (
          <div className="stakeholder-attention-row" key={item.id}>
            <CalendarClock size={17} aria-hidden="true" />
            <div>
              <strong>{item.productName}: {item.attentionTitle}</strong>
              <p>{item.farmerName} &middot; {item.attentionMessage}</p>
            </div>
            <Link to="/stakeholder-requests">View request <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
        ))}
      </section>
    ) : null}
    <div className={`stakeholder-workspace-grid${nextPickup ? ' has-pickup' : ''}`}>
      <section className="stakeholder-section"><SectionHeader title="Available donations" description="Surplus produce from Cebu farmers" actionTo="/stakeholder-donations" actionLabel="Browse all" />
        {available.length ? <div className="stakeholder-donation-list">{discoveryDonations.slice(0, 4).map((donation) => <DonationRow key={donation.id} donation={donation} farmer={farmersById.get(donation.farmerId)} />)}</div> : <CompactEmpty icon={Gift} title="No donations available nearby" message="New surplus produce from verified Farmers will appear here." actionTo="/stakeholder-donations" actionLabel="Browse all donations" />}
      </section>
      <section className="stakeholder-section stakeholder-requests-panel"><SectionHeader title="Recent requests" description="Your latest donation activity" actionTo="/stakeholder-requests" actionLabel="View all requests" />
        {myRequests.length ? <RequestList requests={recentRequests} /> : <CompactEmpty icon={ClipboardList} title="No donation requests yet" message="Once you request surplus produce, your pickup schedule will appear here." actionTo="/stakeholder-donations" actionLabel="Browse donations" />}
      </section>
      {nextPickup ? <section className="stakeholder-section stakeholder-pickup-panel"><SectionHeader title="Next pickup" description="Your nearest upcoming collection" live /><div className="stakeholder-pickup-details"><strong>{nextPickup.productName} &middot; {nextPickup.quantity} {nextPickup.unit}</strong><p>{nextPickup.farmerName}</p><time dateTime={nextPickup.pickupDate}><CalendarClock size={16} aria-hidden="true" />{formatDate(nextPickup.pickupDate)}</time>{nextPickup.location ? <p><MapPin size={15} aria-hidden="true" />{nextPickup.location}</p> : null}<div><Link to="/stakeholder-requests">View pickup <ArrowRight size={14} aria-hidden="true" /></Link><Link to="/farmer-map">Open map</Link></div></div></section> : null}
      <section className="stakeholder-section stakeholder-activity-panel"><SectionHeader title="Recent activity" description="Updates to your donation requests" />
        {latestActivity.length ? <ActivityList items={latestActivity} /> : <CompactEmpty icon={ShoppingBasket} title="No recent activity" message="Updates to your donation requests and pickups will appear here." />}
      </section>
    </div>
  </AppShell>;
}

function VerificationBanner({ user, onDismiss }) {
  if (user.verificationStatus === 'verified' && user.verificationAcknowledged === false) return <div className="stakeholder-verification-banner is-approved"><CheckCircle2 aria-hidden="true" /><div><strong>Your organization is verified</strong><p>You can now request surplus produce from local farmers.</p></div><button type="button" onClick={onDismiss}>Dismiss</button></div>;
  if (user.verificationStatus === 'pending') return <div className="stakeholder-verification-banner"><TriangleAlert aria-hidden="true" /><div><strong>Organization verification pending</strong><p>Your organization is being reviewed. Donation requests will be available once your account is verified.</p></div><Link to="/profile">View status</Link></div>;
  if (user.verificationStatus === 'rejected') return <div className="stakeholder-verification-banner is-rejected"><TriangleAlert aria-hidden="true" /><div><strong>Organization verification needs attention</strong><p>Update your organization details and contact support before requesting donations.</p></div><Link to="/profile">Review profile</Link></div>;
  return null;
}

function SummaryStat({ icon: Icon, label, value, hint, tone = 'default' }) { return <article className={`stakeholder-summary-stat tone-${tone}`}><Icon aria-hidden="true" /><div><p>{label}</p><strong>{value}</strong><span>{hint}</span></div></article>; }
function SectionHeader({ title, description, actionTo, actionLabel, live = false }) {
  return (
    <header className="stakeholder-section-header">
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2>{title}</h2>
          {live ? <span className="live-indicator"><span className="live-dot" /> Live</span> : null}
        </div>
        <p>{description}</p>
      </div>
      {actionTo ? <Link to={actionTo}>{actionLabel}<ArrowRight size={15} aria-hidden="true" /></Link> : null}
    </header>
  );
}
function DonationRow({ donation, farmer }) {
  const distance = Number.isFinite(farmer?.distanceKm) ? formatNearbyDistance(farmer.distanceKm) : null;
  const location = donation.location || farmer?.municipality || farmer?.address;
  return <article className="stakeholder-donation-row">
    <div className="stakeholder-donation-image">{donation.image ? <img src={donation.image} alt="" /> : <PackageOpen aria-hidden="true" />}</div>
    <div className="stakeholder-donation-copy"><strong>{donation.productName}</strong><span>{donation.quantity} {donation.unit} available</span><small>{donation.farmerName}</small><small><MapPin size={13} aria-hidden="true" />{location || 'Location not available'}{distance ? ` / Approx. ${distance}` : ''}</small>{donation.expirationDate ? <small>Available until {formatDate(donation.expirationDate)}</small> : null}</div>
    <Link to="/stakeholder-donations" className="stakeholder-row-action" aria-label={`View ${donation.productName} and request donation`}>View <ArrowRight size={14} aria-hidden="true" /></Link>
  </article>;
}
function RequestList({ requests }) {
  return <div className="stakeholder-request-list">{requests.map(request => <article className="stakeholder-request-row" key={request.id}>
    <div><strong>{request.productName} &middot; {request.quantity} {request.unit}</strong><small>{request.farmerName}</small>{request.createdAt ? <small>Requested {formatDate(request.createdAt)}</small> : null}</div>
    <div><StatusBadge value={stakeholderPickupDisplayStatus(request)} type="donation" /><small>{requestNextStep(request.status)}</small>{request.pickupDate ? <small>{formatDate(request.pickupDate)}</small> : null}</div>
    <Link to="/stakeholder-requests" aria-label={`View request for ${request.productName}`}>View request <ArrowRight size={14} aria-hidden="true" /></Link>
  </article>)}</div>;
}
function ActivityList({ items }) { return <div className="stakeholder-activity-list">{items.map(item => <article key={item.id}><span><ClipboardList aria-hidden="true" /></span><div><strong>{activityTitle(item.status)}</strong><p>{item.productName} &middot; {item.farmerName}</p></div><time dateTime={item.updatedAt || item.createdAt} title={formatDate(item.updatedAt || item.createdAt)}>{formatRelativeTime(item.updatedAt || item.createdAt)}</time></article>)}</div>; }
function CompactEmpty({ icon: Icon, title, message, actionTo, actionLabel }) { return <div className="stakeholder-compact-empty"><Icon aria-hidden="true" /><div><strong>{title}</strong><p>{message}</p>{actionTo ? <Link to={actionTo}>{actionLabel}<ArrowRight size={14} aria-hidden="true" /></Link> : null}</div></div>; }
