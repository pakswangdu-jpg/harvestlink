import {
  LayoutGrid, TrendingUp, UserRound, MapPin, Store, Package,
} from 'lucide-react';
import messagesNavIcon from '../../assets/icons/nav-messages.png';
import { createMaskNavIcon } from '../../utils/createMaskNavIcon';

const MessagesNavIcon = createMaskNavIcon(messagesNavIcon);

export const buyerNavItems = [
  { to: '/buyer-dashboard', label: 'Dashboard', icon: LayoutGrid, group: 'Main' },
  { to: '/buyer-orders', label: 'My orders', icon: Package, bottomIcon: Package, group: 'Orders' },
  { to: '/messages', label: 'Messages', icon: MessagesNavIcon, bottomIcon: MessagesNavIcon, group: 'Orders' },
  { to: '/marketplace', label: 'Browse Produce', icon: Store, bottomIcon: Store, group: 'Market' },
  { to: '/farmer-map', label: 'Nearby', icon: MapPin, bottomIcon: MapPin, group: 'Market' },
  { to: '/market-insights', label: 'Market Insights', icon: TrendingUp, group: 'Market' },
  { to: '/profile', label: 'Profile', icon: UserRound },
];
