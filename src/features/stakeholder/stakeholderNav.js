import { ClipboardList, Gift, LayoutDashboard, MapPinned, MessageCircle, PackageCheck, Store, UserRound } from 'lucide-react';

export const stakeholderNavItems = [
  { to: '/stakeholder-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/marketplace', label: 'Marketplace', icon: Store },
  { to: '/stakeholder-orders', label: 'My orders', icon: PackageCheck },
  { to: '/stakeholder-donations', label: 'Browse donations', icon: Gift },
  { to: '/stakeholder-requests', label: 'My requests', icon: ClipboardList },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/farmer-map', label: 'View Map', icon: MapPinned },
  { to: '/profile', label: 'Profile', icon: UserRound },
];
