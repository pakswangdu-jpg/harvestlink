import { History, LayoutDashboard, MapPinned, MessageCircle, Store, TrendingUp, User } from 'lucide-react';

export const buyerNavItems = [
  { to: '/buyer-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/marketplace', label: 'Marketplace', icon: Store },
  { to: '/buyer-orders', label: 'My orders', icon: History },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/farmer-map', label: 'View Map', icon: MapPinned },
  { to: '/market-insights', label: 'Market Insights', icon: TrendingUp },
  { to: '/profile', label: 'Profile', icon: User },
];
