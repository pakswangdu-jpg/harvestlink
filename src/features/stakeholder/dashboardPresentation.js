export function pickupDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export function partnerDashboardOverview(requests, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now);
  const scheduled = requests.filter(item => item.status === 'scheduled');
  const datedPickups = scheduled.filter(item => pickupDay(item.pickupDate)).sort((a, b) => a.pickupDate.localeCompare(b.pickupDate));
  const nextPickup = datedPickups.find(item => item.pickupDate >= today) || null;
  const attention = datedPickups.filter(item => item.pickupDate <= today).map(item => ({
    ...item,
    attentionTitle: item.pickupDate === today ? 'Pickup scheduled for today' : 'Pickup needs confirmation',
    attentionMessage: item.pickupDate === today ? 'Review your pickup details.' : 'Review this pickup and confirm receipt once collected.',
  }));
  const timestamp = item => Date.parse(item.updatedAt || item.createdAt) || 0;
  return {
    scheduled,
    completed: requests.filter(item => item.status === 'completed'),
    awaitingApproval: requests.filter(item => item.status === 'requested'),
    nextPickup, attention,
    recentRequests: [...requests].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)).slice(0, 5),
    latestActivity: [...requests].filter(item => timestamp(item)).sort((a, b) => timestamp(b) - timestamp(a)).slice(0, 5),
  };
}

export function requestNextStep(status) {
  return { requested: 'Awaiting Farmer response', scheduled: 'Review pickup details', completed: 'Donation received', cancelled: 'Request closed', available: 'Available to request' }[status] || 'View request details';
}

export function activityTitle(status) {
  return { requested: 'Donation request sent', scheduled: 'Pickup scheduled', completed: 'Donation received', cancelled: 'Donation cancelled', available: 'Donation available' }[status] || 'Donation updated';
}
