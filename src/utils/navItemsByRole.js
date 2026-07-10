import { farmerNavItems } from '../features/farmer/farmerNav';
import { buyerNavItems } from '../features/buyer/buyerNav';
import { stakeholderNavItems } from '../features/stakeholder/stakeholderNav';

const NAV_ITEMS_BY_ROLE = {
  farmer: farmerNavItems,
  buyer: buyerNavItems,
  stakeholder: stakeholderNavItems,
};

export function getNavItemsForRole(role) {
  return NAV_ITEMS_BY_ROLE[role] || buyerNavItems;
}
