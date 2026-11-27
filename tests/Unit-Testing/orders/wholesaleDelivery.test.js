import { describe, expect, it } from 'vitest';
import {
  buildWholesaleTimeline,
  getWholesaleNextDeliveryStatus,
  isRetailLalamoveOrder,
  usesSharedArrangedDelivery,
  validateWholesaleArrangementInput,
} from '../../../backend/shared/wholesaleDelivery.js';

describe('Wholesale Farmer-Arranged Delivery helpers & Shopee-style timeline', () => {
  it('builds the 6 Lalamove timeline stages with actual timestamps and never skips Waiting for Courier', () => {
    const order = {
      sellingType: 'wholesale',
      status: 'confirmed',
      deliveryMethod: 'courier',
      deliveryStatus: 'waiting_for_courier',
      createdAt: '2026-11-28T01:00:00.000Z',
      deliveryEvents: [
        { id: 'e1', status: 'pending', occurredAt: '2026-11-28T01:00:00.000Z' },
        { id: 'e2', status: 'confirmed', occurredAt: '2026-11-28T02:00:00.000Z' },
        { id: 'e3', status: 'waiting_for_courier', occurredAt: '2026-11-28T03:00:00.000Z' },
      ],
    };

    const timeline = buildWholesaleTimeline(order);
    expect(timeline.map((step) => step.title)).toEqual([
      'Order Placed',
      'Order Confirmed',
      'Waiting for Courier',
      'In Transit',
      'Order Delivered',
      'Order Completed',
    ]);
    expect(timeline[0]).toMatchObject({ state: 'completed', occurredAt: '2026-11-28T01:00:00.000Z' });
    expect(timeline[1]).toMatchObject({ state: 'completed', occurredAt: '2026-11-28T02:00:00.000Z' });
    expect(timeline[2]).toMatchObject({ state: 'current', occurredAt: '2026-11-28T03:00:00.000Z' });
    expect(timeline[3]).toMatchObject({ state: 'pending', occurredAt: null });
    expect(getWholesaleNextDeliveryStatus(order)).toBe('in_transit');
  });

  it('uses collection stages for Buyer Pickup instead of courier stages', () => {
    const order = {
      sellingType: 'wholesale',
      status: 'confirmed',
      deliveryMethod: 'buyer_pickup',
      deliveryStatus: 'ready_for_pickup',
      createdAt: '2026-11-28T01:00:00.000Z',
      deliveryEvents: [
        { id: 'e1', status: 'pending', occurredAt: '2026-11-28T01:00:00.000Z' },
        { id: 'e2', status: 'confirmed', occurredAt: '2026-11-28T02:00:00.000Z' },
        { id: 'e3', status: 'ready_for_pickup', occurredAt: '2026-11-28T04:00:00.000Z' },
      ],
    };

    const timeline = buildWholesaleTimeline(order);
    expect(timeline.map((step) => step.title)).toEqual([
      'Order Placed',
      'Order Confirmed',
      'Ready for Pickup',
      'Order Completed',
    ]);
    expect(timeline[2].state).toBe('current');
    expect(getWholesaleNextDeliveryStatus(order)).toBe('completed');
  });

  it('requires pickup time and estimated delivery date/time for Lalamove, while keeping booking reference optional until booked', () => {
    const missing = validateWholesaleArrangementInput({
      deliveryMethod: 'courier',
      deliveryFee: '350',
      estimatedPickupTime: '',
      estimatedDeliveryAt: '',
      bookingReference: '',
    });
    expect(missing.estimatedPickupTime).toBeTruthy();
    expect(missing.estimatedDeliveryAt).toBeTruthy();
    expect(missing.bookingReference).toBeUndefined();

    const validWithoutRef = validateWholesaleArrangementInput({
      deliveryMethod: 'courier',
      deliveryFee: '350',
      estimatedPickupTime: '2:00 PM - 3:00 PM',
      estimatedDeliveryAt: '2026-11-29T16:00:00.000Z',
      bookingReference: '',
    });
    expect(validWithoutRef).toEqual({});

    const validWithRef = validateWholesaleArrangementInput({
      deliveryMethod: 'courier',
      deliveryFee: '350',
      estimatedPickupTime: '2:00 PM - 3:00 PM',
      estimatedDeliveryAt: '2026-11-29T16:00:00.000Z',
      bookingReference: 'LLM-2026-8891',
    });
    expect(validWithRef).toEqual({});
  });

  it('shares the 6-stage Lalamove timeline and next-status sequence for Retail Lalamove orders only', () => {
    const retailLalamove = {
      sellingType: 'retail',
      status: 'confirmed',
      deliveryMethod: 'courier',
      deliveryStatus: 'pending',
      createdAt: '2026-11-28T01:00:00.000Z',
      deliveryEvents: [
        { id: 'r1', status: 'pending', occurredAt: '2026-11-28T01:00:00.000Z' },
        { id: 'r2', status: 'confirmed', occurredAt: '2026-11-28T01:15:00.000Z' },
      ],
    };
    const retailFarmerDelivery = {
      sellingType: 'retail',
      status: 'confirmed',
      deliveryMethod: 'farmer_delivery',
      deliveryStatus: 'pending',
    };

    expect(isRetailLalamoveOrder(retailLalamove)).toBe(true);
    expect(usesSharedArrangedDelivery(retailLalamove)).toBe(true);
    expect(getWholesaleNextDeliveryStatus(retailLalamove)).toBe('waiting_for_courier');
    expect(buildWholesaleTimeline(retailLalamove).map((step) => step.title)).toEqual([
      'Order Placed',
      'Order Confirmed',
      'Waiting for Courier',
      'In Transit',
      'Order Delivered',
      'Order Completed',
    ]);

    expect(isRetailLalamoveOrder(retailFarmerDelivery)).toBe(false);
    expect(usesSharedArrangedDelivery(retailFarmerDelivery)).toBe(false);
    expect(getWholesaleNextDeliveryStatus(retailFarmerDelivery)).toBeNull();
  });
});
