import {
  Handshake, LayoutGrid, LineChart, TrendingUp, UserRound, MapPin, Store, MessageSquare, Package, PackagePlus,
} from 'lucide-react';
import { createMaskNavIcon } from '../../utils/createMaskNavIcon';
import marketplaceNavIcon from '../../assets/icons/nav-marketplace.png';
import messagesNavIcon from '../../assets/icons/nav-messages.png';
import nearbyNavIcon from '../../assets/icons/nav-nearby-pin.png';
import ordersNavIcon from '../../assets/icons/nav-orders.png';
import productsNavIcon from '../../assets/icons/nav-products-add.png';

const NearbyNavIcon = createMaskNavIcon(nearbyNavIcon);
const MarketplaceNavIcon = createMaskNavIcon(marketplaceNavIcon);
const MessagesNavIcon = createMaskNavIcon(messagesNavIcon);
const OrdersNavIcon = createMaskNavIcon(ordersNavIcon);
const ProductsNavIcon = createMaskNavIcon(productsNavIcon);










export const farmerNavItems = [
  { to: '/farmer-dashboard', label: 'Dashboard', icon: LayoutGrid, group: 'Main' },
  { to: '/farmer-products', label: 'Products', icon: ProductsNavIcon, bottomIcon: PackagePlus, group: 'Sales' },
  { to: '/farmer-orders', label: 'Orders', icon: OrdersNavIcon, bottomIcon: Package, group: 'Sales' },
  { to: '/messages', label: 'Messages', icon: MessagesNavIcon, bottomIcon: MessageSquare, group: 'Sales' },
  { to: '/marketplace', label: 'Browse Produce', icon: MarketplaceNavIcon, bottomIcon: Store, group: 'Market' },
  { to: '/farmer-map', label: 'Nearby', icon: NearbyNavIcon, bottomIcon: MapPin, group: 'Market' },
  { to: '/market-insights', label: 'Market Insights', icon: TrendingUp, group: 'Market' },
  { to: '/demand-forecast', label: 'Demand Forecast', icon: LineChart, group: 'Market' },
  { to: '/farmer-donations', label: 'Donations', icon: Handshake, group: 'Community' },
  { to: '/profile', label: 'Profile', icon: UserRound },
];
