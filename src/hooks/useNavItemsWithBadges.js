import { useFarmerNavBadges } from './useFarmerNavBadges';
import { useBuyerNavBadges } from './useBuyerNavBadges';
import { useStakeholderNavBadges } from './useStakeholderNavBadges';
import { useAdminNavBadges } from './useAdminNavBadges';
import { useMessagesBadge } from './useMessagesBadge';





export function useNavItemsWithBadges(user, navItems) {
  const hasProfile = ['farmer', 'buyer', 'stakeholder'].includes(user.role);



  const farmerBadges = useFarmerNavBadges(user.role === 'farmer' ? user.id : null);
  const buyerBadges = useBuyerNavBadges(user.role === 'buyer' ? user.id : null);
  const stakeholderBadges = useStakeholderNavBadges(user.role === 'stakeholder' ? user.id : null);
  const adminBadges = useAdminNavBadges(user.role === 'admin');



  const messagesBadges = useMessagesBadge(hasProfile ? user.id : null);

  const badgeTargetsByRole = {
    farmer: {
      '/farmer-orders': farmerBadges.ordersBadge,
      '/farmer-donations': farmerBadges.donationsBadge,
      '/messages': messagesBadges.messagesBadge,
    },
    buyer: {
      '/buyer-orders': buyerBadges.ordersBadge,
      '/messages': messagesBadges.messagesBadge,
    },
    stakeholder: {
      '/stakeholder-orders': stakeholderBadges.ordersBadge,
      '/stakeholder-donations': stakeholderBadges.donationsBadge,
      '/stakeholder-requests': stakeholderBadges.requestsBadge,
      '/messages': messagesBadges.messagesBadge,
    },
    admin: {
      '/admin-users': adminBadges.usersBadge,
      '/admin-price-monitoring': adminBadges.priceMonitoringBadge,
    },
  };
  const badgesByPath = badgeTargetsByRole[user.role];
  return badgesByPath
    ? navItems.map((item) => (item.to in badgesByPath ? { ...item, badge: badgesByPath[item.to] } : item))
    : navItems;
}
