import { useFarmerNavBadges } from './useFarmerNavBadges';
import { useBuyerNavBadges } from './useBuyerNavBadges';
import { useStakeholderNavBadges } from './useStakeholderNavBadges';
import { useAdminNavBadges } from './useAdminNavBadges';
import { useMessagesBadge } from './useMessagesBadge';

// Shared between AppShell's own sidebar/mobile nav and MobileBottomNav.jsx (used directly by
// full-page flows that skip AppShell, e.g. GcashPaymentPage) so both annotate the same
// `navItems` list with the same live unread/pending counts instead of keeping two copies of
// this mapping in sync by hand.
export function useNavItemsWithBadges(user, navItems) {
  const hasProfile = ['farmer', 'buyer', 'stakeholder'].includes(user.role);

  // Each hook is a no-op (returns 0, does nothing) unless the signed-in account is actually
  // that role, so all of them can always be called.
  const farmerBadges = useFarmerNavBadges(user.role === 'farmer' ? user.id : null);
  const buyerBadges = useBuyerNavBadges(user.role === 'buyer' ? user.id : null);
  const stakeholderBadges = useStakeholderNavBadges(user.role === 'stakeholder' ? user.id : null);
  const adminBadges = useAdminNavBadges(user.role === 'admin');
  // "Messages" is identical across farmer/buyer/stakeholder (unlike the other, per-role
  // badges above) — one shared hook instead of duplicating the same unread-count logic
  // three times. Admin has no Messages nav item, so this is a no-op for that role.
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
