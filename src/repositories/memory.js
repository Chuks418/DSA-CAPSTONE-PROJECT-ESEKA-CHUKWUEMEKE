export function createMemoryRepository() {
  const events = new Map();
  const tiers = new Map();
  const bookings = new Map();
  const bookingsByReference = new Map();

  return {
    async saveEvent(event) {
      events.set(event.id, event);
      return event;
    },

    async findEventById(eventId) {
      return events.get(eventId) ?? null;
    },

    async listEvents() {
      return [...events.values()];
    },

    async saveTier(tier) {
      tiers.set(tier.id, tier);
      return tier;
    },

    async findTierById(tierId) {
      return tiers.get(tierId) ?? null;
    },

    async listTiersByEventId(eventId) {
      return [...tiers.values()].filter((tier) => tier.eventId === eventId);
    },

    async saveBooking(booking) {
      bookings.set(booking.id, booking);
      bookingsByReference.set(booking.reference, booking);
      return booking;
    },

    async findBookingByReference(reference) {
      return bookingsByReference.get(reference) ?? null;
    },

    async findBookingById(bookingId) {
      return bookings.get(bookingId) ?? null;
    },

    async listBookings() {
      return [...bookings.values()];
    },
  };
}