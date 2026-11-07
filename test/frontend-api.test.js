
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  listEvents,
  getEvent,
  createBooking,
  pay,
} from '../public/js/mockApi.js';

describe('Build 6 frontend mock API', () => {
  describe('Event listing and filtering', () => {
    it('lists all five published events', async () => {
      const events = await listEvents();

      assert.equal(events.length, 5);
    });

    it('searches events by title', async () => {
      const events = await listEvents({ q: 'Benin Tech' });

      assert.equal(events.length, 1);
      assert.equal(
        events[0].title,
        'Benin Tech and Innovation Summit'
      );
    });

    it('filters events by city', async () => {
      const events = await listEvents({ city: 'Benin City' });

      assert.equal(events.length, 2);
      assert.ok(events.every((event) => event.city === 'Benin City'));
    });

    it('filters events by maximum ticket price', async () => {
      const events = await listEvents({ maxPriceCents: 200000 });

      assert.equal(events.length, 4);
      assert.ok(
        events.every((event) => event.minPriceCents <= 200000)
      );
    });

    it('sorts events by earliest date', async () => {
      const events = await listEvents({ sortBy: 'date' });

      const dates = events.map((event) => event.startsAt);
      const sortedDates = [...dates].sort();

      assert.deepEqual(dates, sortedDates);
    });

    it('sorts events by lowest ticket price', async () => {
      const events = await listEvents({ sortBy: 'price' });

      const prices = events.map((event) => event.minPriceCents);
      const sortedPrices = [...prices].sort((a, b) => a - b);

      assert.deepEqual(prices, sortedPrices);
    });

    it('sorts events by highest ticket availability', async () => {
      const events = await listEvents({
        sortBy: 'availability',
      });

      const seats = events.map((event) => event.seatsLeft);
      const sortedSeats = [...seats].sort((a, b) => b - a);

      assert.deepEqual(seats, sortedSeats);
    });

    it('rejects an invalid sorting option', async () => {
      await assert.rejects(
        () => listEvents({ sortBy: 'invalid' }),
        { code: 'VALIDATION' }
      );
    });
  });

  describe('Event details', () => {
    it('returns an event by its ID', async () => {
      const event = await getEvent('event-001');

      assert.equal(event.title, 'Benin Tech and Innovation Summit');
      assert.equal(event.tiers.length, 2);
    });

    it('rejects an unknown event ID', async () => {
      await assert.rejects(
        () => getEvent('unknown-event'),
        { code: 'NOT_FOUND' }
      );
    });
  });

  describe('Booking validation', () => {
    it('rejects a quantity below one', async () => {
      await assert.rejects(
        () => createBooking({ tierId: 'tier-001', quantity: 0 }),
        { code: 'VALIDATION' }
      );
    });

    it('rejects a quantity above ten', async () => {
      await assert.rejects(
        () => createBooking({ tierId: 'tier-001', quantity: 11 }),
        { code: 'VALIDATION' }
      );
    });

    it('rejects a fractional ticket quantity', async () => {
      await assert.rejects(
        () => createBooking({ tierId: 'tier-001', quantity: 1.5 }),
        { code: 'VALIDATION' }
      );
    });

    it('rejects a booking without a ticket tier', async () => {
      await assert.rejects(
        () => createBooking({ quantity: 1 }),
        { code: 'VALIDATION' }
      );
    });

    it('rejects an unknown ticket tier', async () => {
      await assert.rejects(
        () => createBooking({ tierId: 'unknown-tier', quantity: 1 }),
        { code: 'NOT_FOUND' }
      );
    });

    it('rejects booking a sold-out ticket tier', async () => {
      await assert.rejects(
        () => createBooking({ tierId: 'tier-007', quantity: 1 }),
        { code: 'SOLD_OUT' }
      );
    });
  });

  describe('Booking and payment', () => {
    it('creates a booking and reserves the requested seats', async () => {
      const before = await getEvent('event-001');
      const seatsBefore = before.tiers.find(
        (tier) => tier.id === 'tier-001'
      ).capacity - before.tiers.find(
        (tier) => tier.id === 'tier-001'
      ).sold;

      const booking = await createBooking({
        tierId: 'tier-001',
        quantity: 2,
      });

      const after = await getEvent('event-001');
      const tierAfter = after.tiers.find(
        (tier) => tier.id === 'tier-001'
      );
      const seatsAfter = tierAfter.capacity - tierAfter.sold;

      assert.equal(booking.quantity, 2);
      assert.equal(booking.amountCents, 500000);
      assert.equal(booking.status, 'pending');
      assert.ok(booking.reference);
      assert.equal(seatsAfter, seatsBefore - 2);

      return booking;
    });

    it('allows a declined payment to be retried successfully', async () => {
      const booking = await createBooking({
        tierId: 'tier-001',
        quantity: 1,
      });

      await assert.rejects(
        () => pay(booking.reference, { outcome: 'declined' }),
        { code: 'PAYMENT_DECLINED' }
      );

      const paidBooking = await pay(booking.reference, {
        outcome: 'success',
      });

      assert.equal(paidBooking.status, 'paid');
      assert.equal(paidBooking.reference, booking.reference);
    });

    it('does not allow an already paid booking to be paid again', async () => {
      const booking = await createBooking({
        tierId: 'tier-001',
        quantity: 1,
      });

      await pay(booking.reference, { outcome: 'success' });

      await assert.rejects(
        () => pay(booking.reference, { outcome: 'success' }),
        { code: 'INVALID_TRANSITION' }
      );
    });

    it('rejects payment for an unknown booking reference', async () => {
      await assert.rejects(
        () => pay('UNKNOWN-REFERENCE'),
        { code: 'NOT_FOUND' }
      );
    });
  });
});
