import {
  LayoutGrid, TrendingUp, UserRound, MapPin, Store, MessageSquare, Package,
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





export const buyerNavItems = [
  { to: '/buyer-dashboard', label: 'Dashboard', icon: LayoutGrid, group: 'Main' },
  { to: '/buyer-orders', label: 'My orders', icon: OrdersNavIcon, bottomIcon: Package, group: 'Orders' },
  { to: '/messages', label: 'Messages', icon: MessagesNavIcon, bottomIcon: MessageSquare, group: 'Orders' },
  { to: '/marketplace', label: 'Browse Produce', icon: MarketplaceNavIcon, bottomIcon: Store, group: 'Market' },
  { to: '/farmer-map', label: 'Nearby', icon: NearbyNavIcon, bottomIcon: MapPin, group: 'Market' },
  { to: '/market-insights', label: 'Market Insights', icon: TrendingUp, group: 'Market' },
  { to: '/profile', label: 'Profile', icon: UserRound },
];
