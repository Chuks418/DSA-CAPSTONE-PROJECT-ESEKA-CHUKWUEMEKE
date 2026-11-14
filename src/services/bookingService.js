
import { newId, newReference } from '../domain/ids.js';
import { DomainError } from '../domain/errors.js';
import { assertTransition } from '../domain/bookingStateMachine.js';
import { calculateRefund } from '../domain/refundPolicy.js';

const MAX_TICKETS_PER_BOOKING = 10;
const BOOKING_HOLD_MINUTES = 15;

export function createBookingService(
  repository,
  paymentGateway,
  {
    clock = { now: () => new Date() },
    onSeatsReleased = async () => {},
  } = {},
) {
  if (!repository || !paymentGateway) {
    throw new TypeError(
      'A booking repository and payment gateway are required',
    );
  }

    async function notifySeatsReleased(tierId) {
    try {
      await onSeatsReleased(tierId);
    } catch (error) {
      console.error('Waitlist offer creation failed:', error);
    }
  }

  async function releaseBookingSeats(
    booking,
    expectedStatus,
    nextStatus,
    refundCents = 0,
    refundedAt = null,
  ) {
    if (typeof repository.cancelBookingAndReleaseSeats === 'function') {
      const updated = await repository.cancelBookingAndReleaseSeats(
        booking.reference,
        expectedStatus,
        nextStatus,
        refundCents,
        refundedAt,
      );

      if (!updated) {
        throw new DomainError(
          'INVALID_TRANSITION',
          'This booking has already been cancelled or changed',
        );
      }

            await notifySeatsReleased(booking.tierId);
      return updated;
    }

    const current = await repository.findBookingByReference(
      booking.reference,
    );

    if (!current || current.status !== expectedStatus) {
      throw new DomainError(
        'INVALID_TRANSITION',
        'This booking has already been cancelled or changed',
      );
    }

    const tier = await repository.findTierById(current.tierId);

    if (!tier) {
      throw new DomainError('NOT_FOUND', 'Ticket tier not found');
    }

    tier.sold -= current.quantity;
    current.status = nextStatus;
    current.refundCents = refundCents;
    current.refundedAt = refundedAt;

    await repository.saveTier(tier);
    await repository.saveBooking(current);

        await notifySeatsReleased(current.tierId);
    return current;
  }

  async function getBookingEvent(booking) {
    const tier = await repository.findTierById(booking.tierId);

    if (!tier) {
      throw new DomainError('NOT_FOUND', 'Ticket tier not found');
    }

    const event = await repository.findEventById(tier.eventId);

    if (!event) {
      throw new DomainError('NOT_FOUND', 'Event not found');
    }

    return event;
  }

  async function enrichBooking(booking) {
    const tier = await repository.findTierById(booking.tierId);

    if (!tier) {
      return {
        ...booking,
        tier: null,
        event: null,
      };
    }

    const event = await repository.findEventById(tier.eventId);

    return {
      ...booking,
      tier,
      event: event ?? null,
    };
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
        throw new DomainError(
          'INVALID_STATE',
          'Tickets can only be booked for published events',
        );
      }

      const reservedTier = await repository.reserveTierSeats(
        tierId,
        quantity,
      );

      if (!reservedTier) {
        throw new DomainError(
          'SOLD_OUT',
          'Not enough tickets are available',
        );
      }

      const booking = {
        id: newId(),
        userId,
        tierId,
        reference: newReference(),
        quantity,
        amountCents: reservedTier.priceCents * quantity,
        status: 'pending',
        chargeId: null,
        createdAt: clock.now().toISOString(),
        refundCents: 0,
        refundedAt: null,
        checkedInAt: null,
      };

      try {
        await repository.saveBooking(booking);
      } catch (error) {
        if (typeof repository.releaseTierSeats === 'function') {
          await repository.releaseTierSeats(tierId, quantity);
        }

        throw error;
      }

      return enrichBooking(booking);
    },

    async getBooking(reference, userId) {
      const booking = await repository.findBookingByReference(reference);

      if (!booking) {
        throw new DomainError('NOT_FOUND', 'Booking not found');
      }

      if (booking.userId !== userId) {
        throw new DomainError(
          'FORBIDDEN',
          'You cannot view another user’s booking',
        );
      }

      return enrichBooking(booking);
    },

    async listBookings(userId) {
      let bookings;

      if (typeof repository.listBookingsByUserId === 'function') {
        bookings = await repository.listBookingsByUserId(userId);
      } else {
        const allBookings = await repository.listBookings();

        bookings = allBookings.filter(
          (booking) => booking.userId === userId,
        );
      }

      return Promise.all(
        bookings.map((booking) => enrichBooking(booking)),
      );
    },

    async payBooking(reference, userId, outcome = 'success') {
      const booking = await repository.findBookingByReference(reference);

      if (!booking) {
        throw new DomainError('NOT_FOUND', 'Booking not found');
      }

      if (booking.userId !== userId) {
        throw new DomainError(
          'FORBIDDEN',
          'You cannot pay for another user’s booking',
        );
      }

      if (booking.status !== 'pending') {
        throw new DomainError(
          'INVALID_TRANSITION',
          'Only pending bookings can be paid',
        );
      }

      const holdExpiry =
        new Date(booking.createdAt).getTime() +
        BOOKING_HOLD_MINUTES * 60 * 1000;

      if (clock.now().getTime() >= holdExpiry) {
        await releaseBookingSeats(
          booking,
          'pending',
          'cancelled',
        );

        throw new DomainError(
          'BOOKING_EXPIRED',
          'This booking has expired',
        );
      }

      const payment = await paymentGateway.charge({
        amountCents: booking.amountCents,
        outcome,
      });

      if (!payment.success) {
        throw new DomainError(
          'PAYMENT_DECLINED',
          payment.message || 'Payment was declined',
        );
      }

      assertTransition(booking.status, 'paid');

      booking.status = 'paid';
      booking.chargeId = payment.transactionId;

      await repository.saveBooking(booking);

      return enrichBooking(booking);
    },

    async getRefundPreview(reference, userId) {
      const booking = await repository.findBookingByReference(reference);

      if (!booking) {
        throw new DomainError('NOT_FOUND', 'Booking not found');
      }

      if (booking.userId !== userId) {
        throw new DomainError(
          'FORBIDDEN',
          'You cannot view another user’s booking',
        );
      }

      if (booking.status !== 'paid') {
        throw new DomainError(
          'INVALID_TRANSITION',
          'Only paid bookings can be cancelled for a refund',
        );
      }

      const event = await getBookingEvent(booking);

      const refund = calculateRefund({
        amountCents: booking.amountCents,
        startsAt: event.startsAt,
        now: clock.now(),
      });

      return {
        reference: booking.reference,
        amountCents: booking.amountCents,
        refundCents: refund.refundCents,
        percentage: refund.percentage,
        daysRemaining: refund.daysRemaining,
      };
    },

    async cancelBooking(reference, userId) {
      const booking = await repository.findBookingByReference(reference);

      if (!booking) {
        throw new DomainError('NOT_FOUND', 'Booking not found');
      }

      if (booking.userId !== userId) {
        throw new DomainError(
          'FORBIDDEN',
          'You cannot cancel another user’s booking',
        );
      }

      // Build 7: unpaid bookings can be cancelled without a refund.
      if (booking.status === 'pending') {
        const updated = await releaseBookingSeats(
          booking,
          'pending',
          'cancelled',
        );

        return enrichBooking(updated);
      }

      // Build 8: paid bookings follow the time-based refund policy.
      if (booking.status !== 'paid') {
        throw new DomainError(
          'INVALID_TRANSITION',
          'Only pending or paid bookings can be cancelled',
        );
      }

      const event = await getBookingEvent(booking);

      const refund = calculateRefund({
        amountCents: booking.amountCents,
        startsAt: event.startsAt,
        now: clock.now(),
      });

      if (refund.refundCents > 0) {
        const result = await paymentGateway.refund({
          chargeId: booking.chargeId,
          amountCents: refund.refundCents,
        });

        if (!result.success) {
          throw new DomainError(
            'REFUND_FAILED',
            result.message || 'Refund could not be processed',
          );
        }
      }

      // A positive refund records the booking as refunded.
      // A zero-refund cancellation records it as cancelled.
      const nextStatus =
        refund.refundCents > 0 ? 'refunded' : 'cancelled';

      const updated = await releaseBookingSeats(
        booking,
        'paid',
        nextStatus,
        refund.refundCents,
        refund.refundCents > 0 ? clock.now().toISOString() : null,
      );

      return {
        ...await enrichBooking(updated),
        refundCents: refund.refundCents,
        refundPercentage: refund.percentage,
      };
    },
  };
}
