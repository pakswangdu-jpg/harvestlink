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

// Every icon here follows currentColor, so SidebarNavItem can color them via the
// --icon-muted/--green-700 tokens (light AND dark) — the lucide ones natively, and the
// supplied PNG artwork through createMaskNavIcon, which masks rather than paints.
export const buyerNavItems = [
  { to: '/buyer-dashboard', label: 'Dashboard', icon: LayoutGrid },
  { to: '/marketplace', label: 'Marketplace', icon: MarketplaceNavIcon },
  { to: '/buyer-orders', label: 'My orders', icon: OrdersNavIcon },
  { to: '/messages', label: 'Messages', icon: MessagesNavIcon },
  { to: '/farmer-map', label: 'Nearby', icon: NearbyNavIcon },
  { to: '/market-insights', label: 'Market Insights', icon: TrendingUp },
  { to: '/profile', label: 'Profile', icon: UserRound },
];
