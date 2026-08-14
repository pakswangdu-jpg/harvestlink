import { BadgeAlert, UserRound } from 'lucide-react';
import { createImageNavIcon } from '../../utils/createImageNavIcon';
import dashboardNavIcon from '../../assets/icons/nav-dashboard.png';
import usersNavIcon from '../../assets/icons/nav-admin-users.png';
import ordersNavIcon from '../../assets/icons/nav-orders.png';
import donationsNavIcon from '../../assets/icons/nav-donations.png';
import reportsNavIcon from '../../assets/icons/nav-admin-reports.png';

const DashboardNavIcon = createImageNavIcon(dashboardNavIcon);
const UsersNavIcon = createImageNavIcon(usersNavIcon);
const OrdersNavIcon = createImageNavIcon(ordersNavIcon);
const DonationsNavIcon = createImageNavIcon(donationsNavIcon);
const ReportsNavIcon = createImageNavIcon(reportsNavIcon);

export const adminNavItems = [
  { to: '/admin-dashboard', label: 'Dashboard', icon: DashboardNavIcon },
  { to: '/admin-users', label: 'Users', icon: UsersNavIcon },
  { to: '/admin-price-monitoring', label: 'Price Monitoring', icon: BadgeAlert },
  { to: '/admin-orders', label: 'Orders', icon: OrdersNavIcon },
  { to: '/admin-donations', label: 'Donations', icon: DonationsNavIcon },
  { to: '/admin-reports', label: 'Reports', icon: ReportsNavIcon },
  { to: '/admin-profile', label: 'Profile', icon: UserRound },
];
