import { ClipboardList, Gift, LayoutDashboard, LineChart, MapPinned, MessageCircle, PackagePlus, Store, TrendingUp, User } from 'lucide-react';

export const farmerNavItems = [
  { to: '/farmer-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/farmer-products', label: 'Products', icon: Store },
  { to: '/farmer-orders', label: 'Orders', icon: ClipboardList },
  { to: '/farmer-donations', label: 'Donations', icon: Gift },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/marketplace', label: 'Marketplace', icon: PackagePlus },
  { to: '/farmer-map', label: 'View Map', icon: MapPinned },
  { to: '/market-insights', label: 'Market Insights', icon: TrendingUp },
  { to: '/demand-forecast', label: 'Demand Forecast', icon: LineChart },
  { to: '/profile', label: 'Profile', icon: User },
];
