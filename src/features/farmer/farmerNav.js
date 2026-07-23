import { ChartColumn, Gift, LayoutDashboard, MapPinned, MessageCircle, Package, PackageCheck, Store, TrendingUp, UserRound } from 'lucide-react';

export const farmerNavItems = [
  { to: '/farmer-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/farmer-products', label: 'Products', icon: Package },
  { to: '/farmer-orders', label: 'Orders', icon: PackageCheck },
  { to: '/farmer-donations', label: 'Donations', icon: Gift },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/marketplace', label: 'Marketplace', icon: Store },
  { to: '/farmer-map', label: 'View Map', icon: MapPinned },
  { to: '/market-insights', label: 'Market Insights', icon: ChartColumn },
  { to: '/demand-forecast', label: 'Demand Forecast', icon: TrendingUp },
  { to: '/profile', label: 'Profile', icon: UserRound },
];
