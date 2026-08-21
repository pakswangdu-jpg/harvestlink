import {
  LayoutGrid, Mail, Package, Store, TrendingUp, UserRound,
} from 'lucide-react';
import { createImageNavIcon } from '../../utils/createImageNavIcon';
import mapNavIcon from '../../assets/icons/nav-map.png';

const MapNavIcon = createImageNavIcon(mapNavIcon);

// Lucide components (not the old nav-*.png raster assets) so every icon can follow
// currentColor — SidebarNavItem colors icons via the --icon-muted/--green-700 CSS tokens
// (light AND dark), which a baked-in-black PNG can never respond to. Nearby keeps its PNG on
// purpose (see nav-map.png) since that pin is a deliberately colored brand accent.
export const buyerNavItems = [
  { to: '/buyer-dashboard', label: 'Dashboard', icon: LayoutGrid },
  { to: '/marketplace', label: 'Marketplace', icon: Store },
  { to: '/buyer-orders', label: 'My orders', icon: Package },
  { to: '/messages', label: 'Messages', icon: Mail },
  { to: '/farmer-map', label: 'Nearby', icon: MapNavIcon },
  { to: '/market-insights', label: 'Market Insights', icon: TrendingUp },
  { to: '/profile', label: 'Profile', icon: UserRound },
];
