import {
  BadgeAlert, FileBarChart2, Gift, LayoutGrid, Package, UserRound, Users,
} from 'lucide-react';

// Lucide components (not the old nav-*.png raster assets) so every icon can follow
// currentColor — SidebarNavItem colors icons via the --icon-muted/--green-700 CSS tokens
// (light AND dark), which a baked-in-black PNG can never respond to.
export const adminNavItems = [
  { to: '/admin-dashboard', label: 'Dashboard', icon: LayoutGrid },
  { to: '/admin-users', label: 'Users', icon: Users },
  { to: '/admin-price-monitoring', label: 'Price Monitoring', icon: BadgeAlert },
  { to: '/admin-orders', label: 'Orders', icon: Package },
  { to: '/admin-donations', label: 'Donations', icon: Gift },
  { to: '/admin-reports', label: 'Reports', icon: FileBarChart2 },
  { to: '/admin-profile', label: 'Profile', icon: UserRound },
];
