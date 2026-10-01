import {
  Inbox, LayoutGrid, TrendingUp, UserRound, Handshake, MapPin, Store, MessageSquare, Package,
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







export const stakeholderNavItems = [
  { to: '/stakeholder-dashboard', label: 'Dashboard', icon: LayoutGrid, group: 'Main' },
  { to: '/stakeholder-orders', label: 'My orders', icon: OrdersNavIcon, bottomIcon: Package, group: 'Orders' },
  { to: '/messages', label: 'Messages', icon: MessagesNavIcon, bottomIcon: MessageSquare, group: 'Orders' },
  { to: '/marketplace', label: 'Browse Produce', icon: MarketplaceNavIcon, bottomIcon: Store, group: 'Market' },
  { to: '/farmer-map', label: 'Nearby', icon: NearbyNavIcon, bottomIcon: MapPin, group: 'Market' },
  { to: '/market-insights', label: 'Market Insights', icon: TrendingUp, group: 'Market' },
  { to: '/stakeholder-donations', label: 'Browse donations', icon: DonationsNavIcon, bottomIcon: Handshake, group: 'Community' },
  { to: '/stakeholder-requests', label: 'My requests', icon: Inbox, group: 'Community' },
  { to: '/profile', label: 'Profile', icon: UserRound },
];
