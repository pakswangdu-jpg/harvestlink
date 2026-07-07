import { Gift, History, LayoutDashboard, User } from 'lucide-react';

export const stakeholderNavItems = [
  { to: '/stakeholder-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/stakeholder-donations', label: 'Browse donations', icon: Gift },
  { to: '/stakeholder-requests', label: 'My requests', icon: History },
  { to: '/profile', label: 'Profile', icon: User },
];
