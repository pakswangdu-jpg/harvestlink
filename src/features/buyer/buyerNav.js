import {
  LayoutGrid, TrendingUp, UserRound, MapPin, Store, MessageSquare, Package,
} from 'lucide-react';
import { createElement } from 'react';
import { createMaskNavIcon } from '../../utils/createMaskNavIcon';
import messagesNavIcon from '../../assets/icons/nav-messages.png';
import marketplaceNavIcon from '../../assets/icons/nav-marketplace.png';
import nearbyNavIcon from '../../assets/icons/nav-nearby-pin.png';
import ordersNavIcon from '../../assets/icons/nav-orders.png';

const NearbyNavIcon = createMaskNavIcon(nearbyNavIcon);
const MarketplaceNavIcon = createMaskNavIcon(marketplaceNavIcon);
const OrdersNavIcon = createMaskNavIcon(ordersNavIcon);

function MessagesNavIcon({ size = 20, className }) {
  return createElement('img', { src: messagesNavIcon, alt: '', width: size, height: size, className, 'aria-hidden': true });
}





export const buyerNavItems = [
  { to: '/buyer-dashboard', label: 'Dashboard', icon: LayoutGrid, group: 'Main' },
  { to: '/buyer-orders', label: 'My orders', icon: Package, bottomIcon: Package, group: 'Orders' },
  { to: '/messages', label: 'Messages', icon: MessagesNavIcon, bottomIcon: MessagesNavIcon, group: 'Orders' },
  { to: '/marketplace', label: 'Browse Produce', icon: Store, bottomIcon: Store, group: 'Market' },
  { to: '/farmer-map', label: 'Nearby', icon: MapPin, bottomIcon: MapPin, group: 'Market' },
  { to: '/market-insights', label: 'Market Insights', icon: TrendingUp, group: 'Market' },
  { to: '/profile', label: 'Profile', icon: UserRound },
];
