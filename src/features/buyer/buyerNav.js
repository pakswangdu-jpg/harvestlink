import { ChartColumn, LayoutDashboard, MapPinned, MessageCircle, PackageCheck, Store, UserRound } from 'lucide-react';

export const buyerNavItems = [
  { to: '/buyer-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/marketplace', label: 'Marketplace', icon: Store },
  { to: '/buyer-orders', label: 'My orders', icon: PackageCheck },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/farmer-map', label: 'View Map', icon: MapPinned },
  { to: '/market-insights', label: 'Market Insights', icon: ChartColumn },
  { to: '/profile', label: 'Profile', icon: UserRound },
];
