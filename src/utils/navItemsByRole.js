import { farmerNavItems } from '../features/farmer/farmerNav';
import { buyerNavItems } from '../features/buyer/buyerNav';
import { stakeholderNavItems } from '../features/stakeholder/stakeholderNav';
import { adminNavItems } from '../features/admin/adminNav';

const NAV_ITEMS_BY_ROLE = {
  farmer: farmerNavItems,
  buyer: buyerNavItems,
  stakeholder: stakeholderNavItems,
  admin: adminNavItems,
};

export function getNavItemsForRole(role) {
  return NAV_ITEMS_BY_ROLE[role] || buyerNavItems;
}
