import {
  Inbox, LayoutGrid, TrendingUp, UserRound,
} from 'lucide-react';
import { createMaskNavIcon } from '../../utils/createMaskNavIcon';
import donationsNavIcon from '../../assets/icons/nav-donations-handshake.png';
import marketplaceNavIcon from '../../assets/icons/nav-marketplace.png';
import messagesNavIcon from '../../assets/icons/nav-messages.png';
import nearbyNavIcon from '../../assets/icons/nav-nearby-pin.png';
import ordersNavIcon from '../../assets/icons/nav-orders.png';

const DonationsNavIcon = createMaskNavIcon(donationsNavIcon);
const NearbyNavIcon = createMaskNavIcon(nearbyNavIcon);
const MarketplaceNavIcon = createMaskNavIcon(marketplaceNavIcon);
const MessagesNavIcon = createMaskNavIcon(messagesNavIcon);
const OrdersNavIcon = createMaskNavIcon(ordersNavIcon);

// Every icon here follows currentColor, so SidebarNavItem can color them via the
// --icon-muted/--green-700 tokens (light AND dark) — the lucide ones natively, and the
// supplied PNG artwork through createMaskNavIcon, which masks rather than paints.
export const stakeholderNavItems = [
  { to: '/stakeholder-dashboard', label: 'Dashboard', icon: LayoutGrid },
  { to: '/marketplace', label: 'Browse Produce', icon: MarketplaceNavIcon },
  { to: '/stakeholder-orders', label: 'My orders', icon: OrdersNavIcon },
  { to: '/stakeholder-donations', label: 'Browse donations', icon: DonationsNavIcon },
  { to: '/stakeholder-requests', label: 'My requests', icon: Inbox },
  { to: '/messages', label: 'Messages', icon: MessagesNavIcon },
  { to: '/farmer-map', label: 'Nearby', icon: NearbyNavIcon },
  { to: '/market-insights', label: 'Market Insights', icon: TrendingUp },
  { to: '/profile', label: 'Profile', icon: UserRound },
];
