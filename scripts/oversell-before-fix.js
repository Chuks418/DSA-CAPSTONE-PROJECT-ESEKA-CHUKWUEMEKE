
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { createBookingService } from '../src/services/bookingService.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';

async function runDemo() {
  const db = new DatabaseSync(':memory:');

  try {
    db.exec('PRAGMA foreign_keys = ON');

    const schema = readFileSync(
      new URL('../src/db/schema.sql', import.meta.url),
      'utf8',
    );

    db.exec(schema);

    const realRepository = createSqliteRepository(db);

    // Simulate the old unsafe read-then-write approach.
    // Multiple requests can read the same outdated seat count.
    const unsafeRepository = {
      ...realRepository,

      async reserveTierSeats(tierId, quantity) {
        const tier = await realRepository.findTierById(tierId);

        if (!tier || tier.sold + quantity > tier.capacity) {
          return null;
        }

        // Allow other requests to read the same old seat count.
        await Promise.resolve();

        tier.sold += quantity;

        await realRepository.saveTier(tier);

        return tier;
      },
    };

    const bookingService = createBookingService(
      unsafeRepository,
      createMockPaymentGateway(),
    );

    await realRepository.saveEvent({
      id: 'before-fix-event',
      organizerId: 'organizer-1',
      title: 'Before Fix Overselling Test',
      city: 'Benin City',
      venue: 'Test Venue',
      startsAt: '2027-12-15T10:00:00.000Z',
      status: 'published',
    });

    await realRepository.saveTier({
      id: 'before-fix-tier',
      eventId: 'before-fix-event',
      name: 'Last Ticket',
      priceCents: 500000,
      capacity: 1,
      sold: 0,
    });

    console.log('BEFORE-FIX OVERSelling EXPERIMENT');
    console.log('Available seats: 1');
    console.log('Attendees attempting to book: 50');

    const results = await Promise.allSettled(
      Array.from({ length: 50 }, (_, index) =>
        bookingService.createBooking({
          tierId: 'before-fix-tier',
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

    const tier = await realRepository.findTierById(
      'before-fix-tier',
    );

    const bookings = await realRepository.listBookings();

    const ticketsBooked = bookings.reduce(
      (total, booking) => total + booking.quantity,
      0,
    );

    console.log('\n--- RESULTS ---');
    console.log('Successful bookings:', successful.length);
    console.log('Rejected requests:', rejected.length);
    console.log('Bookings stored:', bookings.length);
    console.log('Tickets booked:', ticketsBooked);
    console.log(`Seats recorded as sold: ${tier.sold}/${tier.capacity}`);
    console.log('Oversold tickets:', Math.max(0, ticketsBooked - tier.capacity));
  } finally {
    db.close();
  }
}

await runDemo();
