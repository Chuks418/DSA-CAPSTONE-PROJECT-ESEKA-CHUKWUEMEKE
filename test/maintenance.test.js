
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { createBookingService } from '../src/services/bookingService.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';
import { createClock } from '../src/lib/clock.js';
import { createMaintenanceJob } from '../src/jobs/maintenance.js';

describe('Build 8 booking maintenance', () => {
  it('expires unpaid bookings, releases seats once, and leaves paid bookings unchanged', async () => {
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

      const clock = createClock('2026-11-08T10:00:00.000Z');

      const bookingService = createBookingService(
        repository,
        paymentGateway,
        { clock },
      );

      const runMaintenance = createMaintenanceJob(repository, {
        clock,
        holdMinutes: 15,
      });

      await repository.saveEvent({
        id: 'maintenance-event',
        organizerId: 'organizer-1',
        title: 'Maintenance Test Event',
        city: 'Benin City',
        venue: 'Test Venue',
        startsAt: '2027-12-15T10:00:00.000Z',
        status: 'published',
      });

      await repository.saveTier({
        id: 'maintenance-tier',
        eventId: 'maintenance-event',
        name: 'Regular',
        priceCents: 500000,
        capacity: 3,
        sold: 0,
      });

      const expiredBooking = await bookingService.createBooking({
        tierId: 'maintenance-tier',
        userId: 'attendee-1',
        quantity: 1,
      });

      const paidBooking = await bookingService.createBooking({
        tierId: 'maintenance-tier',
        userId: 'attendee-2',
        quantity: 1,
      });

      await bookingService.payBooking(
        paidBooking.reference,
        'attendee-2',
      );

      // Move time beyond the 15-minute hold.
      clock.advance(16 * 60 * 1000);

      const result = await runMaintenance();

      assert.equal(result.expiredCount, 1);
      assert.equal(result.bookings[0].reference, expiredBooking.reference);
      assert.equal(result.bookings[0].status, 'cancelled');

      const cancelled = await repository.findBookingByReference(
        expiredBooking.reference,
      );

      const paid = await repository.findBookingByReference(
        paidBooking.reference,
      );

      assert.equal(cancelled.status, 'cancelled');
      assert.equal(paid.status, 'paid');

      const tier = await repository.findTierById('maintenance-tier');

      // Only the paid booking should still occupy a seat.
      assert.equal(tier.sold, 1);

      // Running maintenance again must not release seats twice.
      const secondRun = await runMaintenance();

      assert.equal(secondRun.expiredCount, 0);

      const tierAfterSecondRun = await repository.findTierById(
        'maintenance-tier',
      );

      assert.equal(tierAfterSecondRun.sold, 1);
    } finally {
      db.close();
    }
  });

    it('expires an offer and passes the released seats to the next waitlisted attendee', async () => {
    const db = new DatabaseSync(':memory:');

    try {
      db.exec('PRAGMA foreign_keys = ON');

      const schema = readFileSync(
        new URL('../src/db/schema.sql', import.meta.url),
        'utf8',
      );

      db.exec(schema);

      const repository = createSqliteRepository(db);
      const clock = createClock('2026-11-08T10:00:00.000Z');

      await repository.createUser({
        id: 'waitlist-user-a',
        email: 'waitlist-a@example.com',
        passwordHash: 'test-hash-a',
        role: 'attendee',
        createdAt: clock.now().toISOString(),
      });

      await repository.createUser({
        id: 'waitlist-user-b',
        email: 'waitlist-b@example.com',
        passwordHash: 'test-hash-b',
        role: 'attendee',
        createdAt: clock.now().toISOString(),
      });

      await repository.saveEvent({
        id: 'waitlist-event',
        organizerId: 'organizer-1',
        title: 'Waitlist Test Event',
        city: 'Benin City',
        venue: 'Test Venue',
        startsAt: '2027-12-15T10:00:00.000Z',
        status: 'published',
      });

      await repository.saveTier({
        id: 'waitlist-tier',
        eventId: 'waitlist-event',
        name: 'Regular',
        priceCents: 500000,
        capacity: 2,
        sold: 0,
      });

      await repository.createWaitlistEntry({
        id: 'waitlist-entry-a',
        tierId: 'waitlist-tier',
        userId: 'waitlist-user-a',
        quantity: 1,
        createdAt: '2026-11-08T09:00:00.000Z',
      });

      await repository.createWaitlistEntry({
        id: 'waitlist-entry-b',
        tierId: 'waitlist-tier',
        userId: 'waitlist-user-b',
        quantity: 1,
        createdAt: '2026-11-08T09:01:00.000Z',
      });

      const firstOffer = await repository.createNextWaitlistOffer(
        'waitlist-tier',
        'offer-a',
        clock.now().toISOString(),
        '2026-11-08T10:01:00.000Z',
      );

      assert.equal(firstOffer.userId, 'waitlist-user-a');

      // Allow the first attendee's offer to expire.
      clock.advance(2 * 60 * 1000);

      const runMaintenance = createMaintenanceJob(repository, {
        clock,
        offerMinutes: 10,
      });

      const result = await runMaintenance();

      assert.equal(result.offersExpiredCount, 1);
      assert.equal(result.offersCreatedCount, 1);
      assert.equal(result.offersCreated[0].userId, 'waitlist-user-b');

      const tier = await repository.findTierById('waitlist-tier');

      // The second attendee's offer now holds the released seat.
      assert.equal(tier.sold, 1);
    } finally {
      db.close();
    }
  });
});
