
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { createBookingService } from '../src/services/bookingService.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';

async function runDemo() {
  // Use a separate in-memory database for this experiment.
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

    await repository.saveEvent({
      id: 'oversell-event',
      organizerId: 'organizer-1',
      title: 'Overselling Demonstration',
      city: 'Benin City',
      venue: 'Test Venue',
      startsAt: '2027-12-15T10:00:00.000Z',
      status: 'published',
    });

    await repository.saveTier({
      id: 'oversell-tier',
      eventId: 'oversell-event',
      name: 'Last Ticket',
      priceCents: 500000,
      capacity: 1,
      sold: 0,
    });

    console.log('Starting overselling demonstration...');
    console.log('Available seats: 1');
    console.log('Attendees attempting to book: 50');

    // All 50 attendees attempt to book simultaneously.
    const results = await Promise.all(
      Array.from({ length: 50 }, async (_, index) => {
        try {
          const booking = await bookingService.createBooking({
            tierId: 'oversell-tier',
            userId: `attendee-${index + 1}`,
            quantity: 1,
          });

          return { success: true, booking };
        } catch (error) {
          return {
            success: false,
            code: error.code,
            message: error.message,
          };
        }
      }),
    );

    const successful = results.filter(
      (result) => result.success,
    );

    const soldOut = results.filter(
      (result) => result.code === 'SOLD_OUT',
    );

    const otherFailures = results.filter(
      (result) =>
        !result.success && result.code !== 'SOLD_OUT',
    );

    const finalTier = await repository.findTierById(
      'oversell-tier',
    );

    const bookings = await repository.listBookings();

    console.log('\n--- RESULTS ---');
    console.log('Successful bookings:', successful.length);
    console.log('SOLD_OUT responses:', soldOut.length);
    console.log('Other failures:', otherFailures.length);
    console.log('Bookings stored:', bookings.length);
    console.log(
      `Seats recorded as sold: ${finalTier.sold}/${finalTier.capacity}`,
    );

    if (otherFailures.length > 0) {
      console.log('\nUnexpected errors:');
      otherFailures.forEach((failure) =>
        console.log(failure.message),
      );
    }
  } finally {
    db.close();
  }
}

await runDemo();
