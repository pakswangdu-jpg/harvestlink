import { STORAGE_KEYS } from '../utils/constants';
import { createId, readStorage, writeStorage } from './storageService';
// Donations haven't moved to the backend yet — repointed at frozen localStorage-backed
// copies so this file keeps working unchanged while auth/products/orders migrate.
// See src/services/local/*Local.js for why these exist.
import { restoreProductQuantity, updateProduct } from './local/productServiceLocal';
import { createNotification } from './local/notificationServiceLocal';
import { getStakeholders } from './local/authServiceLocal';

export function getDonations() {
  return readStorage(STORAGE_KEYS.donations, []);
}

export function saveDonations(donations) {
  return writeStorage(STORAGE_KEYS.donations, donations);
}

export function getDonationById(id) {
  return getDonations().find((donation) => donation.id === id) || null;
}

export function getAvailableDonations() {
  return getDonations().filter((donation) => donation.status === 'available');
}

export function getDonationsByFarmer(farmerId) {
  return getDonations().filter((donation) => donation.farmerId === farmerId);
}

export function getDonationsForStakeholder(stakeholderId) {
  return getDonations().filter((donation) => donation.requestedById === stakeholderId);
}

export function createDonation(product, farmer) {
  if (Number(product.quantity) <= 0) throw new Error('This product has no remaining stock to donate.');

  const now = new Date().toISOString();
  const donation = {
    id: createId('donation'),
    productId: product.id,
    productName: product.name,
    unit: product.unit,
    quantity: Number(product.quantity),
    location: product.location,
    image: product.image || '',
    farmerId: farmer.id,
    farmerName: farmer.name,
    status: 'available',
    requestedById: null,
    requestedByName: null,
    pickupDate: null,
    createdAt: now,
    updatedAt: now,
  };

  saveDonations([donation, ...getDonations()]);
  updateProduct(product.id, { ...product, quantity: 0, status: 'inactive' });

  // Every partner org gets alerted — donations go to whoever requests them first, so all
  // of them need to see it appear, not just whichever one happens to check back.
  getStakeholders().forEach((stakeholder) => {
    createNotification({
      userId: stakeholder.id,
      type: 'donation',
      title: 'New surplus donation available',
      message: `${farmer.name} donated ${donation.quantity} ${donation.unit} of ${donation.productName} in ${donation.location}.`,
      link: '/stakeholder-donations',
    });
  });

  return donation;
}

export function requestDonation(id, stakeholder) {
  const donations = getDonations();
  const target = donations.find((donation) => donation.id === id);
  if (!target) throw new Error('Donation was not found.');
  if (target.status !== 'available') throw new Error('This donation is no longer available.');

  const updated = donations.map((donation) =>
    donation.id === id
      ? {
          ...donation,
          status: 'requested',
          requestedById: stakeholder.id,
          requestedByName: stakeholder.organizationName || stakeholder.name,
          updatedAt: new Date().toISOString(),
        }
      : donation
  );
  saveDonations(updated);
  const donation = updated.find((item) => item.id === id);
  createNotification({
    userId: donation.farmerId,
    type: 'donation',
    title: 'Donation requested',
    message: `${donation.requestedByName} requested your donation of ${donation.productName}.`,
    link: '/farmer-donations',
  });
  return donation;
}

export function declineDonationRequest(id) {
  const donations = getDonations();
  const target = donations.find((donation) => donation.id === id);
  if (!target) throw new Error('Donation was not found.');
  if (target.status !== 'requested') throw new Error('Only requested donations can be declined.');

  const updated = donations.map((donation) =>
    donation.id === id
      ? { ...donation, status: 'available', requestedById: null, requestedByName: null, updatedAt: new Date().toISOString() }
      : donation
  );
  saveDonations(updated);
  return updated.find((donation) => donation.id === id);
}

export function acceptDonationRequest(id, pickupDate) {
  const donations = getDonations();
  const target = donations.find((donation) => donation.id === id);
  if (!target) throw new Error('Donation was not found.');
  if (target.status !== 'requested') throw new Error('Only requested donations can be scheduled.');
  if (!pickupDate) throw new Error('Choose a pickup date.');

  const updated = donations.map((donation) =>
    donation.id === id ? { ...donation, status: 'scheduled', pickupDate, updatedAt: new Date().toISOString() } : donation
  );
  saveDonations(updated);
  return updated.find((donation) => donation.id === id);
}

export function confirmReceipt(id) {
  const donations = getDonations();
  const target = donations.find((donation) => donation.id === id);
  if (!target) throw new Error('Donation was not found.');
  if (target.status !== 'scheduled') throw new Error('Only scheduled donations can be confirmed as received.');

  const updated = donations.map((donation) =>
    donation.id === id ? { ...donation, status: 'completed', updatedAt: new Date().toISOString() } : donation
  );
  saveDonations(updated);
  return updated.find((donation) => donation.id === id);
}

// Donations are local-only (no backend order behind one — see ratingService.js), so
// "already rated" has nowhere authoritative to live except the donation record itself.
export function markDonationRated(id) {
  const updated = getDonations().map((donation) =>
    donation.id === id ? { ...donation, rated: true } : donation
  );
  saveDonations(updated);
  return updated.find((donation) => donation.id === id);
}

export function cancelDonation(id) {
  const donations = getDonations();
  const target = donations.find((donation) => donation.id === id);
  if (!target) throw new Error('Donation was not found.');
  if (['completed', 'cancelled'].includes(target.status)) throw new Error('This donation can no longer be cancelled.');

  // The farmer is withdrawing the offer entirely — give the stock back so it can be resold.
  restoreProductQuantity(target.productId, target.quantity);

  const updated = donations.map((donation) =>
    donation.id === id ? { ...donation, status: 'cancelled', updatedAt: new Date().toISOString() } : donation
  );
  saveDonations(updated);
  return updated.find((donation) => donation.id === id);
}
