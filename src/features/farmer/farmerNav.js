import {
  CloudSun, Gift, LayoutGrid, Mail, Package, ShoppingCart, Store, TrendingUp, UserRound,
} from 'lucide-react';
import { createImageNavIcon } from '../../utils/createImageNavIcon';
import mapNavIcon from '../../assets/icons/nav-map.png';

const MapNavIcon = createImageNavIcon(mapNavIcon);

// `group` drives the sidebar's section headings (Menu/Sales/Market/Community) — see
// AppShell.jsx's grouping logic. Roles whose nav items have no `group` field (buyer,
// stakeholder, admin) fall back to a single unlabeled "Menu" section, so this is additive
// and doesn't change anything for them.
//
// Every icon here is a lucide component (not the old nav-*.png raster assets) specifically so
// it can follow currentColor — SidebarNavItem colors icons via the --icon-muted/--green-700
// CSS tokens (light AND dark values), which a baked-in-black PNG can never respond to. Nearby
// keeps its PNG on purpose (see nav-map.png) since that pin is a deliberately colored brand
// accent, not something that needs to blend into the muted/active icon states around it.
export const farmerNavItems = [
  { to: '/farmer-dashboard', label: 'Dashboard', icon: LayoutGrid, group: 'Menu' },
  { to: '/farmer-products', label: 'Products', icon: ShoppingCart, group: 'Sales' },
  { to: '/farmer-orders', label: 'Orders', icon: Package, group: 'Sales' },
  { to: '/messages', label: 'Messages', icon: Mail, group: 'Sales' },
  { to: '/marketplace', label: 'Marketplace', icon: Store, group: 'Market' },
  { to: '/farmer-map', label: 'Nearby', icon: MapNavIcon, group: 'Market' },
  { to: '/market-insights', label: 'Market Insights', icon: TrendingUp, group: 'Market' },
  { to: '/demand-forecast', label: 'Demand Forecast', icon: CloudSun, group: 'Market' },
  { to: '/farmer-donations', label: 'Donations', icon: Gift, group: 'Community' },
  { to: '/profile', label: 'Profile', icon: UserRound },
];
