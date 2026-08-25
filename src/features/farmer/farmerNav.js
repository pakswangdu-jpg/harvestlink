import {
  LayoutGrid, LineChart, TrendingUp, UserRound,
} from 'lucide-react';
import { createMaskNavIcon } from '../../utils/createMaskNavIcon';
import donationsNavIcon from '../../assets/icons/nav-donations-handshake.png';
import marketplaceNavIcon from '../../assets/icons/nav-marketplace.png';
import messagesNavIcon from '../../assets/icons/nav-messages.png';
import nearbyNavIcon from '../../assets/icons/nav-nearby-pin.png';
import ordersNavIcon from '../../assets/icons/nav-orders.png';
import productsNavIcon from '../../assets/icons/nav-products-add.png';

const DonationsNavIcon = createMaskNavIcon(donationsNavIcon);
const NearbyNavIcon = createMaskNavIcon(nearbyNavIcon);
const MarketplaceNavIcon = createMaskNavIcon(marketplaceNavIcon);
const MessagesNavIcon = createMaskNavIcon(messagesNavIcon);
const OrdersNavIcon = createMaskNavIcon(ordersNavIcon);
const ProductsNavIcon = createMaskNavIcon(productsNavIcon);

// `group` drives the sidebar's section headings (Menu/Sales/Market/Community) — see
// AppShell.jsx's grouping logic. Roles whose nav items have no `group` field (buyer,
// stakeholder, admin) fall back to a single unlabeled "Menu" section, so this is additive
// and doesn't change anything for them.
//
// Every icon here follows currentColor, so SidebarNavItem can color them via the
// --icon-muted/--green-700 tokens (light AND dark) — the lucide ones natively, and the
// supplied PNG artwork through createMaskNavIcon, which masks rather than paints for exactly
// that reason.
export const farmerNavItems = [
  { to: '/farmer-dashboard', label: 'Dashboard', icon: LayoutGrid, group: 'Menu' },
  { to: '/farmer-products', label: 'Products', icon: ProductsNavIcon, group: 'Sales' },
  { to: '/farmer-orders', label: 'Orders', icon: OrdersNavIcon, group: 'Sales' },
  { to: '/messages', label: 'Messages', icon: MessagesNavIcon, group: 'Sales' },
  { to: '/marketplace', label: 'Marketplace', icon: MarketplaceNavIcon, group: 'Market' },
  { to: '/farmer-map', label: 'Nearby', icon: NearbyNavIcon, group: 'Market' },
  { to: '/market-insights', label: 'Market Insights', icon: TrendingUp, group: 'Market' },
  { to: '/demand-forecast', label: 'Demand Forecast', icon: LineChart, group: 'Market' },
  { to: '/farmer-donations', label: 'Donations', icon: DonationsNavIcon, group: 'Community' },
  { to: '/profile', label: 'Profile', icon: UserRound },
];
