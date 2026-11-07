import {
  getMockEvents,
  getMockEventById,
  reserveMockTierSeats,
  releaseMockTierSeats,
} from './mockData.js';

const DEMO_USER_ID = 'demo-attendee';
const MAX_TICKETS_PER_BOOKING = 10;
const RESERVATION_DURATION_MS = 5 * 60 * 1000;

const bookings = new Map();
let referenceCounter = 0;

function createError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function copyBooking(booking) {
  return { ...booking };
}

function generateReference() {
  referenceCounter += 1;

  return `DEMO${Date.now().toString(36).toUpperCase()}${referenceCounter
    .toString(36)
    .toUpperCase()}`;
}

function getEventSummary(event) {
  const prices = event.tiers.map((tier) => tier.priceCents);

  return {
    id: event.id,
    title: event.title,
    city: event.city,
    venue: event.venue,
    startsAt: event.startsAt,
    status: event.status,
    tierCount: event.tiers.length,
    minPriceCents: prices.length > 0 ? Math.min(...prices) : null,
    seatsLeft: event.tiers.reduce(
      (total, tier) => total + tier.capacity - tier.sold,
      0
    ),
  };
}

function filterEvents(events, criteria) {
  let filtered = [...events];

  if (criteria.q) {
    const query = String(criteria.q).trim().toLowerCase();

    filtered = filtered.filter((event) =>
      `${event.title} ${event.venue}`.toLowerCase().includes(query)
    );
  }

  if (criteria.city) {
    const city = String(criteria.city).trim().toLowerCase();

    filtered = filtered.filter(
      (event) => event.city.toLowerCase() === city
    );
  }

  if (criteria.from) {
    const fromDate = new Date(criteria.from);

    if (Number.isNaN(fromDate.getTime())) {
      throw createError('VALIDATION', 'Invalid start date.');
    }

    filtered = filtered.filter(
      (event) => new Date(event.startsAt) >= fromDate
    );
  }

  if (criteria.to) {
    const toDate = new Date(criteria.to);

    if (Number.isNaN(toDate.getTime())) {
      throw createError('VALIDATION', 'Invalid end date.');
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(criteria.to)) {
      toDate.setHours(23, 59, 59, 999);
    }

    filtered = filtered.filter(
      (event) => new Date(event.startsAt) <= toDate
    );
  }

  if (criteria.maxPriceCents !== undefined &&
      criteria.maxPriceCents !== '') {
    const maxPriceCents = Number(criteria.maxPriceCents);

    if (!Number.isInteger(maxPriceCents) || maxPriceCents < 0) {
      throw createError(
        'VALIDATION',
        'Maximum price must be a non-negative whole number.'
      );
    }

    filtered = filtered.filter((event) => {
      const summary = getEventSummary(event);

      return (
        summary.minPriceCents !== null &&
        summary.minPriceCents <= maxPriceCents
      );
    });
  }

  if (criteria.onlyAvailable === true ||
      criteria.onlyAvailable === 'true') {
    filtered = filtered.filter(
      (event) => getEventSummary(event).seatsLeft > 0
    );
  }

  return filtered;
}

function sortEvents(events, sortBy = 'date') {
  const sorted = [...events];

  const compareText = (a, b) =>
    a.title.localeCompare(b.title) || a.id.localeCompare(b.id);

  if (sortBy === 'date') {
    sorted.sort((a, b) =>
      new Date(a.startsAt) - new Date(b.startsAt) ||
      compareText(a, b)
    );
  } else if (sortBy === 'price') {
    sorted.sort((a, b) => {
      const priceA = getEventSummary(a).minPriceCents;
      const priceB = getEventSummary(b).minPriceCents;

      if (priceA === null && priceB === null) {
        return compareText(a, b);
      }

      if (priceA === null) return 1;
      if (priceB === null) return -1;

      return priceA - priceB || compareText(a, b);
    });
  } else if (sortBy === 'availability') {
    sorted.sort((a, b) =>
      getEventSummary(b).seatsLeft -
        getEventSummary(a).seatsLeft ||
      compareText(a, b)
    );
  } else {
    throw createError('VALIDATION', 'Invalid sorting option.');
  }

  return sorted;
}

function releaseReservation(record) {
  const booking = record.booking;

  if (booking.status !== 'pending') {
    return false;
  }

  releaseMockTierSeats(booking.tierId, booking.quantity);
  booking.status = 'cancelled';

  return true;
}

function releaseExpiredReservations() {
  const now = Date.now();

  for (const record of bookings.values()) {
    if (
      record.booking.status === 'pending' &&
      now >= record.booking.expiresAt
    ) {
      releaseReservation(record);
    }
  }
}

export async function listEvents(criteria = {}) {
  releaseExpiredReservations();

  const events = getMockEvents().filter(
    (event) => event.status === 'published'
  );

  const filtered = filterEvents(events, criteria);
  const sorted = sortEvents(filtered, criteria.sortBy || 'date');

  return sorted.map(getEventSummary);
}

export async function getEvent(eventId) {
  releaseExpiredReservations();

  const event = getMockEventById(eventId);

  if (!event || event.status !== 'published') {
    throw createError('NOT_FOUND', 'Event not found.');
  }

  return event;
}

export async function createBooking({ tierId, quantity } = {}) {
  releaseExpiredReservations();

  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_TICKETS_PER_BOOKING
  ) {
    throw createError(
      'VALIDATION',
      `Quantity must be between 1 and ${MAX_TICKETS_PER_BOOKING}.`
    );
  }

  if (!tierId) {
    throw createError('VALIDATION', 'A ticket tier is required.');
  }

  const events = getMockEvents();
  let selectedEvent = null;
  let selectedTier = null;

  for (const event of events) {
    const tier = event.tiers.find((item) => item.id === tierId);

    if (tier) {
      selectedEvent = event;
      selectedTier = tier;
      break;
    }
  }

  if (!selectedTier || !selectedEvent) {
    throw createError('NOT_FOUND', 'Ticket tier not found.');
  }

  if (selectedEvent.status !== 'published') {
    throw createError('INVALID_STATE', 'This event is not published.');
  }

  // Update the original inventory, not a copied event.
  const reservedTier = reserveMockTierSeats(tierId, quantity);

  if (!reservedTier) {
    throw createError(
      'SOLD_OUT',
      'Not enough tickets are available for this tier.'
    );
  }

  const now = Date.now();

  const booking = {
    id: `booking-${generateReference()}`,
    userId: DEMO_USER_ID,
    tierId,
    reference: generateReference(),
    quantity,
    amountCents: reservedTier.priceCents * quantity,
    status: 'pending',
    createdAt: new Date(now).toISOString(),
    expiresAt: now + RESERVATION_DURATION_MS,
  };

  bookings.set(booking.reference, {
    booking,
    eventId: selectedEvent.id,
  });

  return copyBooking(booking);
}

export async function pay(reference, { outcome = 'success' } = {}) {
  const record = bookings.get(reference);

  if (!record) {
    throw createError('NOT_FOUND', 'Booking not found.');
  }

  const booking = record.booking;

  if (booking.userId !== DEMO_USER_ID) {
    throw createError('FORBIDDEN', 'You cannot pay for this booking.');
  }

  if (booking.status !== 'pending') {
    throw createError(
      'INVALID_TRANSITION',
      'Only pending bookings can be paid.'
    );
  }

  if (Date.now() >= booking.expiresAt) {
    releaseReservation(record);

    throw createError(
      'RESERVATION_EXPIRED',
      'Your reservation has expired. Please book again.'
    );
  }

  if (outcome === 'declined') {
    throw createError(
      'PAYMENT_DECLINED',
      'Payment was declined. Please try again.'
    );
  }

  if (outcome !== 'success') {
    throw createError('VALIDATION', 'Invalid payment outcome.');
  }

  booking.status = 'paid';

  return copyBooking(booking);
}