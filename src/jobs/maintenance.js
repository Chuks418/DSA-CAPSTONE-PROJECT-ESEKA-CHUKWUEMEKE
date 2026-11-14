import { randomUUID } from 'node:crypto';
import { DomainError } from '../domain/errors.js';

const DEFAULT_HOLD_MINUTES = 15;
const DEFAULT_OFFER_MINUTES = 10;

export function createMaintenanceJob(
  repository,
  {
    clock = { now: () => new Date() },
    holdMinutes = DEFAULT_HOLD_MINUTES,
    offerMinutes = DEFAULT_OFFER_MINUTES,
  } = {},
) {
  if (!repository) {
    throw new TypeError('A repository is required');
  }

  if (!Number.isFinite(holdMinutes) || holdMinutes <= 0) {
    throw new TypeError('Hold duration must be positive');
  }

  if (!Number.isFinite(offerMinutes) || offerMinutes <= 0) {
    throw new TypeError('Offer duration must be positive');
  }

  return async function runMaintenance() {
    const now = clock.now();
    const nowIso = now.toISOString();

    const cutoff = new Date(
      now.getTime() - holdMinutes * 60 * 1000,
    ).toISOString();

    const expiredBookings =
      await repository.listExpiredPendingBookings(cutoff);

    const expired = [];
    const affectedTierIds = new Set();

    // Expire unpaid bookings and release their seats.
    for (const booking of expiredBookings) {
      if (typeof repository.cancelBookingAndReleaseSeats !== 'function') {
        throw new DomainError(
          'INVALID_STATE',
          'Atomic booking expiry is not supported by this repository',
        );
      }

      const updated = await repository.cancelBookingAndReleaseSeats(
        booking.reference,
        'pending',
        'cancelled',
      );

      if (updated) {
        expired.push(updated);
        affectedTierIds.add(updated.tierId);
      }
    }

    // Expire waitlist offers whose time has elapsed.
    const expiredOffers =
      await repository.listExpiredWaitlistOffers(nowIso);

    const offersExpired = [];

    for (const offer of expiredOffers) {
      const updated =
        await repository.expireWaitlistOfferAndReleaseSeats(
          offer.id,
          nowIso,
        );

      if (updated) {
        offersExpired.push(updated);
        affectedTierIds.add(updated.tier_id);
      }
    }

    // Safety net: any tier with people still waiting gets another chance.
    // If no seats are free, createNextWaitlistOffer simply returns null.
    if (typeof repository.listTierIdsWithWaitingEntries === 'function') {
      for (const tierId of await repository.listTierIdsWithWaitingEntries()) {
        affectedTierIds.add(tierId);
      }
    }

    // Offer available seats to the people waiting, in order.
    const offersCreated = [];

    for (const tierId of affectedTierIds) {
      for (let i = 0; i < 20; i += 1) {
        const expiresAt = new Date(
          now.getTime() + offerMinutes * 60 * 1000,
        ).toISOString();

        const offer = await repository.createNextWaitlistOffer(
          tierId,
          randomUUID(),
          nowIso,
          expiresAt,
        );

        if (!offer) break;
        offersCreated.push(offer);
      }
    }

    return {
      expiredCount: expired.length,
      bookings: expired,
      offersExpiredCount: offersExpired.length,
      offersExpired,
      offersCreatedCount: offersCreated.length,
      offersCreated,
    };
  };
}