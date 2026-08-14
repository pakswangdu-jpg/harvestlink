import { UserRound } from 'lucide-react';
import { createImageNavIcon } from '../../utils/createImageNavIcon';
import dashboardNavIcon from '../../assets/icons/nav-dashboard.png';
import marketplaceNavIcon from '../../assets/icons/nav-marketplace.png';
import ordersNavIcon from '../../assets/icons/nav-orders.png';
import messagesNavIcon from '../../assets/icons/nav-messages.png';
import mapNavIcon from '../../assets/icons/nav-map.png';
import marketInsightsNavIcon from '../../assets/icons/nav-market-insights.png';

const DashboardNavIcon = createImageNavIcon(dashboardNavIcon);
const MarketplaceNavIcon = createImageNavIcon(marketplaceNavIcon);
const OrdersNavIcon = createImageNavIcon(ordersNavIcon);
const MessagesNavIcon = createImageNavIcon(messagesNavIcon);
const MapNavIcon = createImageNavIcon(mapNavIcon);
const MarketInsightsNavIcon = createImageNavIcon(marketInsightsNavIcon);

export const buyerNavItems = [
  { to: '/buyer-dashboard', label: 'Dashboard', icon: DashboardNavIcon },
  { to: '/marketplace', label: 'Marketplace', icon: MarketplaceNavIcon },
  { to: '/buyer-orders', label: 'My orders', icon: OrdersNavIcon },
  { to: '/messages', label: 'Messages', icon: MessagesNavIcon },
  { to: '/farmer-map', label: 'View Map', icon: MapNavIcon },
  { to: '/market-insights', label: 'Market Insights', icon: MarketInsightsNavIcon },
  { to: '/profile', label: 'Profile', icon: UserRound },
];
