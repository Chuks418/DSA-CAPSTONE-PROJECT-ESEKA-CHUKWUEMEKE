
import {
  getMockEvents,
  getMockEventById,
  reserveMockTierSeats,
  releaseMockTierSeats,
} from './mockData.js';

const bookings = new Map();

function createError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function summarizeEvent(event) {
  const tiers = event.tiers ?? [];

  const prices = tiers.map((tier) => tier.priceCents);
  const seatsLeft = tiers.reduce(
    (total, tier) => total + tier.capacity - tier.sold,
    0
  );

  return {
    id: event.id,
    title: event.title,
    city: event.city,
    venue: event.venue,
    startsAt: event.startsAt,
    status: event.status,
    minPriceCents: prices.length ? Math.min(...prices) : null,
    seatsLeft,
  };
}

export async function listEvents(criteria = {}) {
  const {
    q,
    city,
    maxPriceCents,
    sortBy = 'date',
  } = criteria;

  let events = getMockEvents()
    .filter((event) => event.status === 'published')
    .filter((event) => {
      if (!q) return true;

      const searchText = `${event.title} ${event.venue}`.toLowerCase();
      return searchText.includes(q.toLowerCase());
    })
    .filter((event) => {
      if (!city) return true;
      return event.city.toLowerCase() === city.toLowerCase();
    })
    .map(summarizeEvent);

  if (maxPriceCents !== undefined) {
    if (
      !Number.isInteger(maxPriceCents) ||
      maxPriceCents < 0
    ) {
      throw createError(
        'VALIDATION',
        'maxPriceCents must be a non-negative whole number'
      );
    }

    events = events.filter(
      (event) =>
        event.minPriceCents !== null &&
        event.minPriceCents <= maxPriceCents
    );
  }

  const sortFunctions = {
    date: (a, b) =>
      a.startsAt.localeCompare(b.startsAt) ||
      a.title.localeCompare(b.title),

    price: (a, b) =>
      a.minPriceCents - b.minPriceCents,

    availability: (a, b) =>
      b.seatsLeft - a.seatsLeft,
  };

  if (!sortFunctions[sortBy]) {
    throw createError(
      'VALIDATION',
      'Invalid sorting option'
    );
  }

  events.sort(sortFunctions[sortBy]);

  return events;
}

export async function getEvent(eventId) {
  const event = getMockEventById(eventId);

  if (!event) {
    throw createError('NOT_FOUND', 'Event not found');
  }

  return event;
}

export async function createBooking({ tierId, quantity } = {}) {
  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 10
  ) {
    throw createError(
      'VALIDATION',
      'Quantity must be a whole number between 1 and 10'
    );
  }

  if (typeof tierId !== 'string' || !tierId.trim()) {
    throw createError('VALIDATION', 'A ticket tier is required');
  }

  const event = getMockEvents().find((item) =>
    item.tiers.some((tier) => tier.id === tierId)
  );

  if (!event) {
    throw createError('NOT_FOUND', 'Ticket tier not found');
  }

  const tier = event.tiers.find((item) => item.id === tierId);

  if (!reserveMockTierSeats(tierId, quantity)) {
    throw createError(
      'SOLD_OUT',
      'Not enough tickets are available'
    );
  }

  const booking = {
    id: `booking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tierId,
    reference: Math.random().toString(36).slice(2, 10).toUpperCase(),
    quantity,
    amountCents: tier.priceCents * quantity,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  bookings.set(booking.reference, booking);

  return { ...booking };
}

export async function pay(
  reference,
  { outcome = 'success' } = {}
) {
  const booking = bookings.get(reference);

  if (!booking) {
    throw createError('NOT_FOUND', 'Booking not found');
  }

  if (booking.status !== 'pending') {
    throw createError(
      'INVALID_TRANSITION',
      `Cannot pay for a ${booking.status} booking`
    );
  }

  if (outcome === 'declined') {
    throw createError(
      'PAYMENT_DECLINED',
      'Payment was declined'
    );
  }

  booking.status = 'paid';

  return { ...booking };
}

export async function cancelBooking(reference) {
  const booking = bookings.get(reference);

  if (!booking) {
    throw createError('NOT_FOUND', 'Booking not found');
  }

  if (booking.status !== 'pending') {
    throw createError(
      'INVALID_TRANSITION',
      `Cannot cancel a ${booking.status} booking`
    );
  }

  releaseMockTierSeats(booking.tierId, booking.quantity);
  booking.status = 'cancelled';

  return { ...booking };
}
