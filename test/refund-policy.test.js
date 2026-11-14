import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { calculateRefund } from '../src/domain/refundPolicy.js';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-07T12:00:00.000Z');

function eventAfter(days) {
  return new Date(now.getTime() + days * DAY).toISOString();
}

describe('Build 8 refund policy', () => {
  it('gives a 100% refund exactly 7 days before the event', () => {
    const result = calculateRefund({
      amountCents: 10001,
      startsAt: eventAfter(7),
      now,
    });

    assert.equal(result.percentage, 100);
    assert.equal(result.refundCents, 10001);
  });

  it('gives a 50% refund at 6 days and 23 hours', () => {
    const result = calculateRefund({
      amountCents: 10000,
      startsAt: eventAfter(6 + 23 / 24),
      now,
    });

    assert.equal(result.percentage, 50);
    assert.equal(result.refundCents, 5000);
  });

  it('gives a 50% refund exactly 2 days before the event', () => {
    const result = calculateRefund({
      amountCents: 10000,
      startsAt: eventAfter(2),
      now,
    });

    assert.equal(result.percentage, 50);
    assert.equal(result.refundCents, 5000);
  });

  it('gives no refund at 1 day and 23 hours', () => {
    const result = calculateRefund({
      amountCents: 10000,
      startsAt: eventAfter(1 + 23 / 24),
      now,
    });

    assert.equal(result.percentage, 0);
    assert.equal(result.refundCents, 0);
  });

  it('rounds fractional refund amounts down', () => {
    const result = calculateRefund({
      amountCents: 10001,
      startsAt: eventAfter(2),
      now,
    });

    assert.equal(result.refundCents, 5000);
  });

  it('rejects cancellation after the event has started', () => {
    assert.throws(
      () => calculateRefund({
        amountCents: 10000,
        startsAt: eventAfter(-1),
        now,
      }),
      { code: 'EVENT_STARTED' }
    );
  });

  it('rejects invalid booking amounts', () => {
    assert.throws(
      () => calculateRefund({
        amountCents: -100,
        startsAt: eventAfter(7),
        now,
      }),
      { code: 'INVALID_AMOUNT' }
    );
  });
});