import { newId, newReference } from '../domain/ids.js';
import { DomainError } from '../domain/errors.js';
import { assertTransition } from '../domain/bookingStateMachine.js';

const MAX_TICKETS_PER_BOOKING = 10;

export function createBookingService(repository, paymentGateway) {
  if (!repository || !paymentGateway) {
    throw new TypeError('A booking repository and payment gateway are required');
  }

  return {
    async createBooking({ tierId, userId, quantity }) {
      if (typeof userId !== 'string' || !userId.trim()) {
        throw new DomainError('VALIDATION', 'User ID is required');
      }

      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > MAX_TICKETS_PER_BOOKING
      ) {
        throw new DomainError(
          'VALIDATION',
          `Quantity must be a whole number between 1 and ${MAX_TICKETS_PER_BOOKING}`,
        );
      }

      const tier = await repository.findTierById(tierId);

      if (!tier) {
        throw new DomainError('NOT_FOUND', 'Ticket tier not found');
      }

      const event = await repository.findEventById(tier.eventId);

      if (!event) {
        throw new DomainError('NOT_FOUND', 'Event not found');
      }

      if (event.status !== 'published') {
        throw new DomainError('INVALID_STATE', 'Tickets can only be booked for published events');
      }

      if (tier.capacity - tier.sold < quantity) {
        throw new DomainError('SOLD_OUT', 'Not enough tickets are available');
      }

      const booking = {
        id: newId(),
        userId: userId.trim(),
        tierId,
        reference: newReference(),
        quantity,
        amountCents: tier.priceCents * quantity,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      tier.sold += quantity;

      await repository.saveTier(tier);
      await repository.saveBooking(booking);

      return booking;
    },

    async payBooking(reference, userId, paymentOutcome = 'success') {
      const booking = await repository.findBookingByReference(reference);

      if (!booking) {
        throw new DomainError('NOT_FOUND', 'Booking not found');
      }

      if (booking.userId !== userId) {
        throw new DomainError('FORBIDDEN', 'You cannot pay for another user’s booking');
      }

      assertTransition(booking.status, 'paid');

      const payment = await paymentGateway.charge({
        amountCents: booking.amountCents,
        outcome: paymentOutcome,
      });

      if (!payment.success) {
        throw new DomainError('PAYMENT_DECLINED', 'Payment was declined');
      }

      booking.status = 'paid';
      await repository.saveBooking(booking);

      return booking;
    },

    async cancelBooking(reference, userId) {
      const booking = await repository.findBookingByReference(reference);

      if (!booking) {
        throw new DomainError('NOT_FOUND', 'Booking not found');
      }

      if (booking.userId !== userId) {
        throw new DomainError('FORBIDDEN', 'You cannot cancel another user’s booking');
      }

      assertTransition(booking.status, 'cancelled');

      if (booking.status !== 'pending') {
        throw new DomainError('INVALID_STATE', 'Only unpaid bookings can be cancelled');
      }

      const tier = await repository.findTierById(booking.tierId);

      if (!tier) {
        throw new DomainError('NOT_FOUND', 'Ticket tier not found');
      }

      tier.sold -= booking.quantity;
      booking.status = 'cancelled';

      await repository.saveTier(tier);
      await repository.saveBooking(booking);

      return booking;
    },
  };
}