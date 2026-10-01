import {
  BadgeAlert, FileBarChart2, Handshake, LayoutGrid, Package, UserRound, Users,
} from 'lucide-react';
import { createMaskNavIcon } from '../../utils/createMaskNavIcon';
import donationsNavIcon from '../../assets/icons/nav-donations-handshake.png';

const DonationsNavIcon = createMaskNavIcon(donationsNavIcon);





export const adminNavItems = [
  { to: '/admin-dashboard', label: 'Dashboard', icon: LayoutGrid },
  { to: '/admin-users', label: 'Users', icon: Users },
  { to: '/admin-price-monitoring', label: 'Price Monitoring', icon: BadgeAlert },
  { to: '/admin-orders', label: 'Orders', icon: Package },
  { to: '/admin-donations', label: 'Donations', icon: DonationsNavIcon, bottomIcon: Handshake },
  { to: '/admin-reports', label: 'Reports', icon: FileBarChart2 },
  { to: '/admin-profile', label: 'Profile', icon: UserRound },
];
