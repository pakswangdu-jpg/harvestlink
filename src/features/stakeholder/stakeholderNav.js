import { ClipboardList, Gift, History, LayoutDashboard, MessageCircle, Store, User } from 'lucide-react';

export const stakeholderNavItems = [
  { to: '/stakeholder-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/marketplace', label: 'Marketplace', icon: Store },
  { to: '/stakeholder-orders', label: 'My orders', icon: ClipboardList },
  { to: '/stakeholder-donations', label: 'Browse donations', icon: Gift },
  { to: '/stakeholder-requests', label: 'My requests', icon: History },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/profile', label: 'Profile', icon: User },
];
