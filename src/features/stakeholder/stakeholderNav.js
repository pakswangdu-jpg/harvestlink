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
// `group` is consumed by AppShell to create the desktop sidebar sections. Keeping this
// aligned with the farmer and buyer navs prevents stakeholder actions from becoming one
// long, unscannable menu.
export const stakeholderNavItems = [
  { to: '/stakeholder-dashboard', label: 'Dashboard', icon: LayoutGrid, group: 'Main' },
  { to: '/stakeholder-orders', label: 'My orders', icon: OrdersNavIcon, group: 'Orders' },
  { to: '/messages', label: 'Messages', icon: MessagesNavIcon, group: 'Orders' },
  { to: '/marketplace', label: 'Browse Produce', icon: MarketplaceNavIcon, group: 'Market' },
  { to: '/farmer-map', label: 'Nearby', icon: NearbyNavIcon, group: 'Market' },
  { to: '/market-insights', label: 'Market Insights', icon: TrendingUp, group: 'Market' },
  { to: '/stakeholder-donations', label: 'Browse donations', icon: DonationsNavIcon, group: 'Community' },
  { to: '/stakeholder-requests', label: 'My requests', icon: Inbox, group: 'Community' },
  { to: '/profile', label: 'Profile', icon: UserRound },
];
