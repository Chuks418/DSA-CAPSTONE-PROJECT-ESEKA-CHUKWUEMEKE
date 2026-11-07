
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { createBookingService } from '../src/services/bookingService.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';

describe('Build 5: SQLite overselling protection', () => {
  it('allows exactly one booking when 50 attendees compete for one seat', async () => {
    const db = new DatabaseSync(':memory:');

    try {
      db.exec('PRAGMA foreign_keys = ON');

      const schema = readFileSync(
        new URL('../src/db/schema.sql', import.meta.url),
        'utf8',
      );

      db.exec(schema);

      const repository = createSqliteRepository(db);
      const paymentGateway = createMockPaymentGateway();

      const bookingService = createBookingService(
        repository,
        paymentGateway,
      );

      // Create a published event.
      await repository.saveEvent({
        id: 'oversell-test-event',
        organizerId: 'organizer-1',
        title: 'Overselling Test Event',
        city: 'Benin City',
        venue: 'Test Venue',
        startsAt: '2027-12-15T10:00:00.000Z',
        status: 'published',
      });

      // Create a ticket tier with exactly one available seat.
      await repository.saveTier({
        id: 'oversell-test-tier',
        eventId: 'oversell-test-event',
        name: 'Regular',
        priceCents: 500000,
        capacity: 1,
        sold: 0,
      });

      // Send 50 booking requests simultaneously.
      const results = await Promise.allSettled(
        Array.from({ length: 50 }, (_, index) =>
          bookingService.createBooking({
            tierId: 'oversell-test-tier',
            userId: `attendee-${index + 1}`,
            quantity: 1,
          }),
        ),
      );

      const successful = results.filter(
        (result) => result.status === 'fulfilled',
      );

      const rejected = results.filter(
        (result) => result.status === 'rejected',
      );

      const soldOut = rejected.filter(
        (result) => result.reason.code === 'SOLD_OUT',
      );

      const bookings = await repository.listBookings();

      const totalTicketsBooked = bookings.reduce(
        (total, booking) => total + booking.quantity,
        0,
      );

      const tier = await repository.findTierById(
        'oversell-test-tier',
      );

      // Exactly one attendee must successfully book.
      assert.equal(successful.length, 1);

      // The other 49 attendees must receive SOLD_OUT.
      assert.equal(soldOut.length, 49);

      // There must be no unexpected failures.
      assert.equal(rejected.length, 49);

      // Only one booking must be stored.
      assert.equal(bookings.length, 1);

      // Exactly one ticket must have been booked.
      assert.equal(totalTicketsBooked, 1);

      // Sold tickets must never exceed capacity.
      assert.equal(tier.sold, 1);
      assert.equal(tier.sold, tier.capacity);
      assert.ok(tier.sold <= tier.capacity);
    } finally {
      db.close();
    }
  });
});
