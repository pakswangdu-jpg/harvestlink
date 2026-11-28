import { useEffect, useState } from 'react';
import {
  BadgeCheck,
  Building2,
  Calendar,
  ExternalLink,
  Gift,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Sprout,
  User,
} from 'lucide-react';
import SlideOver from '../common/SlideOver';
import StarRating from '../common/StarRating';
import { getPublicFarmerProducts } from '../../services/productService';
import { formatCurrency, formatDate, getInitials, isRecentlyActive } from '../../utils/formatters';
import { formatNearbyDistance, haversineKm, validateCoordinates } from '../../utils/geo';
import { formatFullAddress, getDirectionsUrl } from './mapPopupMarkup';

const ROLE_LABELS = {
  farmer: 'Farmer',
  buyer: 'Buyer',
  stakeholder: 'Stakeholder',
};

function ProfileAvatar({ name, avatarUrl, role }) {
  const [imageError, setImageError] = useState(false);

  return (
    <span className={`map-detail-avatar is-${role}`}>
      {avatarUrl && !imageError
        ? <img src={avatarUrl} alt="" onError={() => setImageError(true)} />
        : getInitials(name || 'User')}
    </span>
  );
}

export default function MapUserDetailsDrawer({ detail, viewerCoords = null, onClose }) {
  const profile = detail?.profile || null;
  const role = detail?.role || profile?.role || 'buyer';
  const coords = detail?.coords || null;
  const precision = detail?.precisionLabel || '';
  const isYou = Boolean(detail?.isYou);
  const [productsState, setProductsState] = useState({ farmerId: null, items: [] });

  useEffect(() => {
    if (!profile || role !== 'farmer' || profile.verificationStatus !== 'verified') return undefined;
    let cancelled = false;
    getPublicFarmerProducts(profile.id)
      .then((items) => {
        if (!cancelled) {
          setProductsState({
            farmerId: profile.id,
            items: Array.isArray(items) ? items : [],
          });
        }
      })
      .catch(() => {
        if (!cancelled) setProductsState({ farmerId: profile.id, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [profile, role]);

  const isFarmerProductsLoaded = Boolean(profile?.id && productsState.farmerId === profile.id);
  const farmerProducts = isFarmerProductsLoaded ? productsState.items : [];
  const loadingProducts = Boolean(
    profile?.id && role === 'farmer' && profile.verificationStatus === 'verified' && !isFarmerProductsLoaded
  );

  if (!profile) {
    return <SlideOver open={false} onClose={onClose} eyebrow="" title="" />;
  }

  const baseName = role === 'farmer'
    ? (profile.farmName || profile.name)
    : role === 'stakeholder'
      ? (profile.organizationName || profile.name)
      : profile.name;
  const displayName = `${baseName || 'Registered user'}${isYou ? ' (You)' : ''}`;
  const fullAddress = formatFullAddress(
    profile.address,
    profile.barangay,
    profile.municipality,
    profile.zipCode,
  );
  const directionsUrl = getDirectionsUrl({
    coords,
    address: profile.address,
    barangay: profile.barangay,
    municipality: profile.municipality,
  });
  const online = isRecentlyActive(profile.lastActiveAt);
  const viewerPoint = validateCoordinates(viewerCoords?.lat, viewerCoords?.lng);
  const targetPoint = validateCoordinates(coords?.lat ?? profile.latitude, coords?.lng ?? profile.longitude);
  const computedDistanceKm = Number.isFinite(profile.distanceKm)
    ? profile.distanceKm
    : (viewerPoint && targetPoint && !isYou ? haversineKm(viewerPoint, targetPoint) : null);
  const distanceLabel = Number.isFinite(computedDistanceKm) ? formatNearbyDistance(computedDistanceKm) : '';
  const ratingCount = Number(profile.ratingCount || 0);
  const avgRating = Number(profile.avgRating || 0);
  const activeCount = farmerProducts.length || Number(profile.productCount || 0);
  const categories = Array.isArray(profile.categories) && profile.categories.length
    ? profile.categories
    : [...new Set(farmerProducts.map((item) => item.category).filter(Boolean))].slice(0, 4);
  const contactOwnerLabel = role === 'stakeholder'
    ? (profile.contactPerson || (profile.organizationName && profile.name !== profile.organizationName ? profile.name : ''))
    : role === 'farmer' && profile.farmName && profile.name && profile.farmName !== profile.name
      ? profile.name
      : '';

  return (
    <SlideOver
      open
      onClose={onClose}
      eyebrow={`${ROLE_LABELS[role] || 'Account'} details`}
      title={displayName}
    >
      <div className="map-detail-drawer">
        <div className="map-detail-header">
          <ProfileAvatar key={`${profile.id}-${profile.avatarUrl || 'initials'}`} name={profile.name || baseName} avatarUrl={profile.avatarUrl} role={role} />
          <div className="map-detail-identity">
            <div className="map-detail-badges">
              <span className={`map-detail-badge is-${role}`}>{ROLE_LABELS[role] || 'User'}</span>
              {['farmer', 'stakeholder'].includes(role) && profile.verificationStatus === 'verified' ? (
                <span className="map-detail-badge is-verified">
                  <BadgeCheck size={13} aria-hidden="true" /> Verified
                </span>
              ) : null}
              <span className={`map-detail-badge ${online ? 'is-online' : 'is-offline'}`}>
                <span className={`presence-dot ${online ? 'online' : 'offline'}`} />
                {online ? 'Online' : 'Offline'}
              </span>
            </div>
            <h3>{displayName}</h3>
            {contactOwnerLabel ? <p className="map-detail-sub">{contactOwnerLabel}</p> : null}
            {distanceLabel ? <p className="map-detail-distance">{distanceLabel} from your location</p> : null}
          </div>
        </div>

        {profile.hasAvailableDonations ? (
          <div className="map-detail-donation-banner">
            <Gift size={16} aria-hidden="true" />
            <div>
              <strong>Surplus donations available</strong>
              <span>This farmer currently has surplus produce listed for donation.</span>
            </div>
          </div>
        ) : null}

        <section className="map-detail-section">
          <h4>Contact &amp; registered location</h4>
          <dl className="map-detail-list">
            <div className="map-detail-row">
              <dt><MapPin size={14} aria-hidden="true" /> Registered address</dt>
              <dd>
                <span>{fullAddress}</span>
                {precision ? <small className="map-detail-precision">{precision}</small> : null}
                {directionsUrl ? (
                  <a
                    className="map-detail-inline-link"
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open in Google Maps <ExternalLink size={13} aria-hidden="true" />
                  </a>
                ) : null}
              </dd>
            </div>
            <div className="map-detail-row">
              <dt><Phone size={14} aria-hidden="true" /> Contact number</dt>
              <dd>
                {profile.contactNumber ? (
                  <a className="map-detail-inline-link" href={`tel:${String(profile.contactNumber).replace(/\s+/g, '')}`}>
                    {profile.contactNumber}
                  </a>
                ) : (
                  <span className="muted">Not provided</span>
                )}
              </dd>
            </div>
            {profile.name && role === 'farmer' ? (
              <div className="map-detail-row">
                <dt><User size={14} aria-hidden="true" /> Farmer name</dt>
                <dd>{profile.name}</dd>
              </div>
            ) : null}
            {profile.farmName && role === 'farmer' ? (
              <div className="map-detail-row">
                <dt><Sprout size={14} aria-hidden="true" /> Farm name</dt>
                <dd>{profile.farmName}</dd>
              </div>
            ) : null}
            {profile.createdAt ? (
              <div className="map-detail-row">
                <dt><Calendar size={14} aria-hidden="true" /> Member since</dt>
                <dd>{formatDate(profile.createdAt)}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        {role === 'stakeholder' ? (
          <section className="map-detail-section">
            <h4>Organization overview</h4>
            <dl className="map-detail-list">
              {profile.organizationType ? (
                <div className="map-detail-row">
                  <dt><Building2 size={14} aria-hidden="true" /> Organization type</dt>
                  <dd>{profile.organizationType}</dd>
                </div>
              ) : null}
              {profile.contactPerson ? (
                <div className="map-detail-row">
                  <dt><User size={14} aria-hidden="true" /> Contact person</dt>
                  <dd>{profile.contactPerson}</dd>
                </div>
              ) : null}
              {profile.organizationDescription ? (
                <div className="map-detail-row">
                  <dt>About</dt>
                  <dd>{profile.organizationDescription}</dd>
                </div>
              ) : null}
              {profile.partnershipDescription ? (
                <div className="map-detail-row">
                  <dt>Partnership focus</dt>
                  <dd>{profile.partnershipDescription}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        ) : null}

        {role === 'farmer' ? (
          <section className="map-detail-section">
            <h4>Farm performance &amp; produce</h4>
            <div className="map-detail-metrics">
              <div className="map-detail-metric">
                <span>Rating</span>
                <strong>
                  <StarRating value={avgRating} size={14} />
                  {ratingCount > 0 ? `${avgRating.toFixed(1)} (${ratingCount})` : 'No ratings yet'}
                </strong>
              </div>
              <div className="map-detail-metric">
                <span>Active listings</span>
                <strong><Package size={14} aria-hidden="true" /> {activeCount} {activeCount === 1 ? 'product' : 'products'}</strong>
              </div>
            </div>
            {categories.length ? (
              <div className="map-detail-tags">
                {categories.map((category) => (
                  <span key={category} className="map-detail-tag">{category}</span>
                ))}
              </div>
            ) : null}

            <div className="map-detail-products">
              <p className="map-detail-products-title">Available produce</p>
              {loadingProducts ? (
                <p className="muted map-detail-empty">Loading products...</p>
              ) : farmerProducts.length ? (
                <ul className="map-detail-product-list">
                  {farmerProducts.slice(0, 4).map((product) => (
                    <li key={product.id}>
                      <a href={`/products/${product.id}`} className="map-detail-product-item">
                        <span className="map-detail-product-thumb">
                          {product.image ? <img src={product.image} alt="" /> : <Package size={16} aria-hidden="true" />}
                        </span>
                        <span className="map-detail-product-copy">
                          <strong>{product.name}</strong>
                          <small>{formatCurrency(product.price)} / {product.unit} &middot; {product.quantity} {product.unit} available</small>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted map-detail-empty">No active produce listings right now.</p>
              )}
            </div>
          </section>
        ) : null}

        <div className="map-detail-actions">
          {!isYou ? (
            <a className="btn btn-primary btn-md" href={`/messages/direct/${profile.id}`}>
              <MessageCircle size={16} aria-hidden="true" /> Contact {ROLE_LABELS[role]?.toLowerCase() || 'user'}
            </a>
          ) : null}
          {role === 'farmer' && profile.verificationStatus === 'verified' ? (
            <>
              <a
                className="btn btn-secondary btn-md"
                href={`/marketplace?farmerId=${profile.id}&farmerName=${encodeURIComponent(baseName || profile.name)}`}
              >
                <Package size={16} aria-hidden="true" /> View products
              </a>
              <a className="btn btn-secondary btn-md" href={`/farmers/${profile.id}`}>
                <User size={16} aria-hidden="true" /> Public profile
              </a>
            </>
          ) : null}
        </div>
      </div>
    </SlideOver>
  );
}
