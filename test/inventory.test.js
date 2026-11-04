import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStore,
  createEvent,
  addTier,
  publishEvent,
  unpublishEvent,
  listEventSummaries,
  bookTickets,
  cancelBooking,
  joinWaitlist,
  offerNextOnWaitlist,
  findBookingByReference,
  seatsLeft,
} from '../src/domain/inventory.js';
import { DomainError } from '../src/domain/errors.js';

const throwsCode = (fn, code) =>
  assert.throws(
    fn,
    (error) => error instanceof DomainError && error.code === code,
  );

describe('inventory', () => {
  let store;
  let event;
  let tier;

  beforeEach(() => {
    store = createStore();

    event = createEvent(store, {
      title: 'Test Event',
      city: 'Lagos',
      venue: 'Lagos Hall',
      startsAt: '2026-12-05T17:00:00Z',
      organizerId: 'org-1',
    });

    tier = addTier(store, event.id, {
      name: 'General',
      priceCents: 2500,
      capacity: 3,
    });
  });

  describe('creating events and tiers', () => {
    it('creates an event with the required details, a new ID and draft status', () => {
      assert.ok(event.id);
      assert.equal(event.title, 'Test Event');
      assert.equal(event.city, 'Lagos');
      assert.equal(event.venue, 'Lagos Hall');
      assert.equal(event.startsAt, '2026-12-05T17:00:00.000Z');
      assert.equal(event.status, 'draft');
      assert.equal(store.events.has(event.id), true);
    });

    it('rejects a missing title without saving an event', () => {
      const countBefore = store.events.size;

      throwsCode(
        () => createEvent(store, {
          title: ' ',
          city: 'Lagos',
          startsAt: '2026-12-05',
          organizerId: 'org-1',
        }),
        'VALIDATION',
      );

      assert.equal(store.events.size, countBefore);
    });

    it('rejects a missing city without saving an event', () => {
      const countBefore = store.events.size;

      throwsCode(
        () => createEvent(store, {
          title: 'New Event',
          city: ' ',
          startsAt: '2026-12-05',
          organizerId: 'org-1',
        }),
        'VALIDATION',
      );

      assert.equal(store.events.size, countBefore);
    });

    it('rejects an invalid date without saving an event', () => {
      const countBefore = store.events.size;

      throwsCode(
        () => createEvent(store, {
          title: 'New Event',
          city: 'Lagos',
          startsAt: 'not-a-date',
          organizerId: 'org-1',
        }),
        'VALIDATION',
      );

      assert.equal(store.events.size, countBefore);
    });

    it('rejects a missing organizer ID', () => {
      throwsCode(
        () => createEvent(store, {
          title: 'Another Event',
          city: 'Abuja',
          startsAt: '2026-12-06',
          organizerId: ' ',
        }),
        'VALIDATION',
      );
    });

    it('creates a ticket tier at 500000 cents with capacity 100', () => {
      const newTier = addTier(store, event.id, {
        name: 'General',
        priceCents: 500000,
        capacity: 100,
      });

      assert.equal(newTier.priceCents, 500000);
      assert.equal(newTier.capacity, 100);
      assert.equal(newTier.sold, 0);
      assert.equal(seatsLeft(newTier), 100);
    });

    it('rejects an invalid ticket price', () => {
      throwsCode(
        () => addTier(store, event.id, {
          name: 'General',
          priceCents: 19.99,
          capacity: 5,
        }),
        'VALIDATION',
      );
    });

    it('rejects a ticket capacity below one', () => {
      throwsCode(
        () => addTier(store, event.id, {
          name: 'General',
          priceCents: 100,
          capacity: 0,
        }),
        'VALIDATION',
      );
    });

    it('rejects adding a tier to a nonexistent event', () => {
      throwsCode(
        () => addTier(store, 'nonexistent-event-id', {
          name: 'General',
          priceCents: 500000,
          capacity: 100,
        }),
        'NOT_FOUND',
      );
    });

    it('cannot publish an event with no tiers', () => {
      const empty = createEvent(store, {
        title: 'Empty',
        city: 'Abuja',
        startsAt: '2026-12-06',
        organizerId: 'org-2',
      });

      throwsCode(() => publishEvent(store, empty.id), 'INVALID_STATE');

      assert.equal(empty.status, 'draft');

      assert.equal(
        listEventSummaries(store).some((summary) => summary.id === empty.id),
        false,
      );

      assert.equal(publishEvent(store, event.id).status, 'published');
    });

    it('publishes an event and makes it visible in the public list', () => {
      const published = publishEvent(store, event.id);

      assert.equal(published.status, 'published');

      assert.equal(
        listEventSummaries(store).some((summary) => summary.id === event.id),
        true,
      );
    });

    it('unpublishes an event and removes it from the public list', () => {
      publishEvent(store, event.id);

      assert.equal(
        listEventSummaries(store).some((summary) => summary.id === event.id),
        true,
      );

      const unpublished = unpublishEvent(store, event.id);

      assert.equal(unpublished.status, 'draft');

      assert.equal(
        listEventSummaries(store).some((summary) => summary.id === event.id),
        false,
      );
    });
  });

  describe('booking', () => {
    beforeEach(() => {
      publishEvent(store, event.id);
    });

    it('reduces the seats left and prices in whole cents', () => {
      const booking = bookTickets(store, tier.id, 'ada', 2);

      assert.equal(booking.amountCents, 5000);
      assert.equal(booking.status, 'pending');
      assert.equal(seatsLeft(tier), 1);
    });

    it('rejects a booking bigger than the seats left, and changes nothing', () => {
      bookTickets(store, tier.id, 'ada', 2);

      throwsCode(
        () => bookTickets(store, tier.id, 'bayo', 2),
        'SOLD_OUT',
      );

      assert.equal(seatsLeft(tier), 1);
    });

    it('rejects a missing user ID without changing inventory', () => {
      throwsCode(
        () => bookTickets(store, tier.id, ' ', 1),
        'VALIDATION',
      );

      assert.equal(seatsLeft(tier), 3);
    });

    it('lets the last ticket be booked, then reports sold out', () => {
      bookTickets(store, tier.id, 'ada', 3);

      assert.equal(seatsLeft(tier), 0);

      throwsCode(
        () => bookTickets(store, tier.id, 'bayo', 1),
        'SOLD_OUT',
      );
    });

    it('validates the quantity', () => {
      for (const bad of [0, -1, 1.5, 11, '2', undefined]) {
        throwsCode(
          () => bookTickets(store, tier.id, 'ada', bad),
          'VALIDATION',
        );
      }
    });

    it('finds a booking by its reference code', () => {
      const booking = bookTickets(store, tier.id, 'ada', 1);

      assert.match(booking.reference, /^[A-Z2-9]{8}$/);
      assert.equal(findBookingByReference(store, booking.reference), booking);
      assert.equal(findBookingByReference(store, 'NOPE0000'), undefined);
    });
  });

  describe('cancelling', () => {
    it('gives the seats back', () => {
      const booking = bookTickets(store, tier.id, 'ada', 2);

      cancelBooking(store, booking.reference);

      assert.equal(seatsLeft(tier), 3);
      assert.equal(booking.status, 'cancelled');
    });

    it('cannot be done twice (seats are released once)', () => {
      const booking = bookTickets(store, tier.id, 'ada', 2);

      cancelBooking(store, booking.reference);

      throwsCode(
        () => cancelBooking(store, booking.reference),
        'INVALID_STATE',
      );

      assert.equal(seatsLeft(tier), 3);
    });
  });

  describe('waitlist', () => {
    it('rejects a missing user ID without joining the waitlist', () => {
      bookTickets(store, tier.id, 'bayo', 3);

      throwsCode(
        () => joinWaitlist(store, tier.id, ' ', 1),
        'VALIDATION',
      );

      assert.equal(joinWaitlist(store, tier.id, 'ada', 1).position, 1);
    });

    it('only opens when the tier cannot satisfy the request', () => {
      throwsCode(
        () => joinWaitlist(store, tier.id, 'ada', 1),
        'NOT_SOLD_OUT',
      );

      bookTickets(store, tier.id, 'bayo', 3);

      assert.deepEqual(
        joinWaitlist(store, tier.id, 'ada', 1),
        { position: 1 },
      );

      assert.deepEqual(
        joinWaitlist(store, tier.id, 'chidi', 1),
        { position: 2 },
      );
    });

    it('offers seats first come, first served', () => {
      const booking = bookTickets(store, tier.id, 'bayo', 3);

      joinWaitlist(store, tier.id, 'ada', 1);
      joinWaitlist(store, tier.id, 'chidi', 1);

      assert.equal(
        offerNextOnWaitlist(store, tier.id),
        undefined,
        'no seats yet',
      );

      cancelBooking(store, booking.reference);

      assert.equal(offerNextOnWaitlist(store, tier.id).userId, 'ada');
      assert.equal(offerNextOnWaitlist(store, tier.id).userId, 'chidi');
    });
  });
});
