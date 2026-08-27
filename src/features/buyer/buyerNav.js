import {
  LayoutGrid, TrendingUp, UserRound,
} from 'lucide-react';
import { createMaskNavIcon } from '../../utils/createMaskNavIcon';
import marketplaceNavIcon from '../../assets/icons/nav-marketplace.png';
import messagesNavIcon from '../../assets/icons/nav-messages.png';
import nearbyNavIcon from '../../assets/icons/nav-nearby-pin.png';
import ordersNavIcon from '../../assets/icons/nav-orders.png';

const NearbyNavIcon = createMaskNavIcon(nearbyNavIcon);
const MarketplaceNavIcon = createMaskNavIcon(marketplaceNavIcon);
const MessagesNavIcon = createMaskNavIcon(messagesNavIcon);
const OrdersNavIcon = createMaskNavIcon(ordersNavIcon);

// `group` drives the sidebar's section headings (see AppShell.jsx's grouping logic and
// NAV_GROUP_ORDER) — mirrors farmerNav.js's own grouping, adapted for what a buyer actually
// does here: they don't sell anything, so "Sales" doesn't fit — "Orders" covers their own
// purchases and the messages tied to them instead.
export const buyerNavItems = [
  { to: '/buyer-dashboard', label: 'Dashboard', icon: LayoutGrid, group: 'Main' },
  { to: '/buyer-orders', label: 'My orders', icon: OrdersNavIcon, group: 'Orders' },
  { to: '/messages', label: 'Messages', icon: MessagesNavIcon, group: 'Orders' },
  { to: '/marketplace', label: 'Browse Produce', icon: MarketplaceNavIcon, group: 'Market' },
  { to: '/farmer-map', label: 'Nearby', icon: NearbyNavIcon, group: 'Market' },
  { to: '/market-insights', label: 'Market Insights', icon: TrendingUp, group: 'Market' },
  { to: '/profile', label: 'Profile', icon: UserRound },
];
