import { UserRound } from 'lucide-react';
import { createImageNavIcon } from '../../utils/createImageNavIcon';
import dashboardNavIcon from '../../assets/icons/nav-dashboard.png';
import marketplaceNavIcon from '../../assets/icons/nav-marketplace.png';
import ordersNavIcon from '../../assets/icons/nav-orders.png';
import donationsNavIcon from '../../assets/icons/nav-donations.png';
import requestsNavIcon from '../../assets/icons/nav-requests.png';
import messagesNavIcon from '../../assets/icons/nav-messages.png';
import mapNavIcon from '../../assets/icons/nav-map.png';
import marketInsightsNavIcon from '../../assets/icons/nav-market-insights.png';

const DashboardNavIcon = createImageNavIcon(dashboardNavIcon);
const MarketplaceNavIcon = createImageNavIcon(marketplaceNavIcon);
const OrdersNavIcon = createImageNavIcon(ordersNavIcon);
const DonationsNavIcon = createImageNavIcon(donationsNavIcon);
const RequestsNavIcon = createImageNavIcon(requestsNavIcon);
const MessagesNavIcon = createImageNavIcon(messagesNavIcon);
const MapNavIcon = createImageNavIcon(mapNavIcon);
const MarketInsightsNavIcon = createImageNavIcon(marketInsightsNavIcon);

export const stakeholderNavItems = [
  { to: '/stakeholder-dashboard', label: 'Dashboard', icon: DashboardNavIcon },
  { to: '/marketplace', label: 'Marketplace', icon: MarketplaceNavIcon },
  { to: '/stakeholder-orders', label: 'My orders', icon: OrdersNavIcon },
  { to: '/stakeholder-donations', label: 'Browse donations', icon: DonationsNavIcon },
  { to: '/stakeholder-requests', label: 'My requests', icon: RequestsNavIcon },
  { to: '/messages', label: 'Messages', icon: MessagesNavIcon },
  { to: '/farmer-map', label: 'Nearby', icon: MapNavIcon },
  { to: '/market-insights', label: 'Market Insights', icon: MarketInsightsNavIcon },
  { to: '/profile', label: 'Profile', icon: UserRound },
];
