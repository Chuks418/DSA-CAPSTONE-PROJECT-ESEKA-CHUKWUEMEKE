import { newId, newReference } from '../domain/ids.js';
import { DomainError } from '../domain/errors.js';

const MAX_TICKETS_PER_BOOKING = 10;

export function createWaitlistService(
  repository,
  { clock = { now: () => new Date() } } = {},
) {
  return {
    async join({ tierId, userId, quantity }) {
      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > MAX_TICKETS_PER_BOOKING
      ) {
        throw new DomainError(
          'VALIDATION',
          `Quantity must be between 1 and ${MAX_TICKETS_PER_BOOKING}`,
        );
      }

      const tier = await repository.findTierById(tierId);

      if (!tier) {
        throw new DomainError('NOT_FOUND', 'Ticket tier not found');
      }

      if (tier.capacity - tier.sold >= quantity) {
        throw new DomainError(
          'NOT_SOLD_OUT',
          'Seats are available. Please book instead.',
        );
      }

      const existing = await repository.findActiveWaitlistEntry(
        tierId,
        userId,
      );

      if (existing) {
        throw new DomainError(
          'ALREADY_ON_WAITLIST',
          'You are already on this waitlist.',
        );
      }

      const entry = {
        id: newId(),
        tierId,
        userId,
        quantity,
        createdAt: clock.now().toISOString(),
      };

      await repository.createWaitlistEntry(entry);

      const queue = await repository.listWaitingEntries(tierId);

      return {
        entry,
        position: queue.length,
      };
    },

    async listActiveOffers({ userId }) {
  return repository.listActiveWaitlistOffers(userId);
},

    async listEntries({ userId }) {
      return repository.listWaitlistEntriesByUserId(userId);
    },

    async offerAvailableSeats({ tierId }) {
  const now = clock.now();
  const expiresAt = new Date(
    now.getTime() + 10 * 60 * 1000
  ).toISOString();

  const offers = [];

  for (let i = 0; i < 20; i += 1) {
    const offer = await repository.createNextWaitlistOffer(
      tierId,
      newId(),
      now.toISOString(),
      expiresAt
    );

    if (!offer) break;

    offers.push(offer);
  }

  return offers;
},

    async accept({ offerId, userId }) {
      const now = clock.now();
      const nowIso = now.toISOString();

      const offer = await repository.findWaitlistOfferById(
        offerId,
        userId,
      );

      if (!offer) {
        throw new DomainError('NOT_FOUND', 'Waitlist offer not found');
      }

      if (new Date(offer.expiresAt).getTime() <= now.getTime()) {
        throw new DomainError(
          'OFFER_EXPIRED',
          'This waitlist offer has expired.',
        );
      }

      const tier = await repository.findTierById(offer.tierId);

      if (!tier) {
        throw new DomainError('NOT_FOUND', 'Ticket tier not found');
      }

      const booking = {
        id: newId(),
        userId,
        tierId: offer.tierId,
        reference: newReference(),
        quantity: offer.quantity,
        amountCents: tier.priceCents * offer.quantity,
        status: 'pending',
        createdAt: nowIso,
      };

      const result = await repository.acceptWaitlistOffer(
        offerId,
        userId,
        booking,
        nowIso,
      );

      if (result.expired) {
        throw new DomainError(
          'OFFER_EXPIRED',
          'This waitlist offer has expired.',
        );
      }

      if (!result.accepted) {
        throw new DomainError(
          'INVALID_STATE',
          'This waitlist offer is no longer available.',
        );
      }

      return booking;
    },
  };
}