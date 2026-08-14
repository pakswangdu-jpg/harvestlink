import { UserRound } from 'lucide-react';
import { createImageNavIcon } from '../../utils/createImageNavIcon';
import dashboardNavIcon from '../../assets/icons/nav-dashboard.png';
import marketplaceNavIcon from '../../assets/icons/nav-marketplace.png';
import productsNavIcon from '../../assets/icons/nav-products.png';
import ordersNavIcon from '../../assets/icons/nav-orders.png';
import messagesNavIcon from '../../assets/icons/nav-messages.png';
import mapNavIcon from '../../assets/icons/nav-map.png';
import marketInsightsNavIcon from '../../assets/icons/nav-market-insights.png';
import forecastNavIcon from '../../assets/icons/nav-forecast.png';
import donationsNavIcon from '../../assets/icons/nav-donations.png';

const DashboardNavIcon = createImageNavIcon(dashboardNavIcon);
const MarketplaceNavIcon = createImageNavIcon(marketplaceNavIcon);
const ProductsNavIcon = createImageNavIcon(productsNavIcon);
const OrdersNavIcon = createImageNavIcon(ordersNavIcon);
const MessagesNavIcon = createImageNavIcon(messagesNavIcon);
const MapNavIcon = createImageNavIcon(mapNavIcon);
const MarketInsightsNavIcon = createImageNavIcon(marketInsightsNavIcon);
const ForecastNavIcon = createImageNavIcon(forecastNavIcon);
const DonationsNavIcon = createImageNavIcon(donationsNavIcon);

// `group` drives the sidebar's section headings (Menu/Sales/Market/Community) — see
// AppShell.jsx's grouping logic. Roles whose nav items have no `group` field (buyer,
// stakeholder, admin) fall back to a single unlabeled "Menu" section, so this is additive
// and doesn't change anything for them.
export const farmerNavItems = [
  { to: '/farmer-dashboard', label: 'Dashboard', icon: DashboardNavIcon, group: 'Menu' },
  { to: '/farmer-products', label: 'Products', icon: ProductsNavIcon, group: 'Sales' },
  { to: '/farmer-orders', label: 'Orders', icon: OrdersNavIcon, group: 'Sales' },
  { to: '/messages', label: 'Messages', icon: MessagesNavIcon, group: 'Sales' },
  { to: '/marketplace', label: 'Marketplace', icon: MarketplaceNavIcon, group: 'Market' },
  { to: '/farmer-map', label: 'Shared Map', icon: MapNavIcon, group: 'Market' },
  { to: '/market-insights', label: 'Market Insights', icon: MarketInsightsNavIcon, group: 'Market' },
  { to: '/demand-forecast', label: 'Demand Forecast', icon: ForecastNavIcon, group: 'Market' },
  { to: '/farmer-donations', label: 'Donations', icon: DonationsNavIcon, group: 'Community' },
  { to: '/profile', label: 'Profile', icon: UserRound },
];
