import { BadgeAlert, BarChart3, FileText, Gift, LayoutDashboard, User, Users } from 'lucide-react';

export const adminNavItems = [
  { to: '/admin-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin-users', label: 'Users', icon: Users },
  { to: '/admin-price-monitoring', label: 'Price Monitoring', icon: BadgeAlert },
  { to: '/admin-orders', label: 'Orders', icon: BarChart3 },
  { to: '/admin-donations', label: 'Donations', icon: Gift },
  { to: '/admin-reports', label: 'Reports', icon: FileText },
  { to: '/admin-profile', label: 'Profile', icon: User },
];
