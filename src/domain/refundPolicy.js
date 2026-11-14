import { DomainError } from './errors.js';

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export function calculateRefund({ amountCents, startsAt, now }) {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new DomainError(
      'INVALID_AMOUNT',
      'Refund amount must be a non-negative integer.'
    );
  }

  const eventTime = new Date(startsAt).getTime();
  const currentTime = new Date(now).getTime();

  if (
    !Number.isFinite(eventTime) ||
    !Number.isFinite(currentTime)
  ) {
    throw new DomainError(
      'INVALID_DATE',
      'Valid event and current dates are required.'
    );
  }

  const timeUntilEvent = eventTime - currentTime;

  if (timeUntilEvent <= 0) {
    throw new DomainError(
      'EVENT_STARTED',
      'This event has already started.'
    );
  }

  const daysRemaining = timeUntilEvent / DAY_IN_MILLISECONDS;

  let percentage;

  if (daysRemaining >= 7) {
    percentage = 100;
  } else if (daysRemaining >= 2) {
    percentage = 50;
  } else {
    percentage = 0;
  }

  const refundCents = Math.floor(
    amountCents * percentage / 100
  );

  return {
    amountCents,
    refundCents,
    percentage,
    daysRemaining,
  };
}