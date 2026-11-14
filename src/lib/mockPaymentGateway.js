
export function createMockPaymentGateway() {
  const refunds = new Map();

  return {
    async charge({ amountCents, outcome = 'success' }) {
      if (!Number.isInteger(amountCents) || amountCents < 0) {
        throw new TypeError('A valid amount in whole cents is required');
      }

      if (!['success', 'declined'].includes(outcome)) {
        throw new TypeError('Payment outcome must be success or declined');
      }

      if (outcome === 'declined') {
        return {
          success: false,
          reason: 'PAYMENT_DECLINED',
          message: 'Payment was declined',
        };
      }

      return {
        success: true,
        transactionId: `MOCK-${Date.now()}`,
        amountCents,
      };
    },

    async refund({ chargeId, amountCents }) {
      if (typeof chargeId !== 'string' || !chargeId.trim()) {
        throw new TypeError('A valid charge ID is required');
      }

      if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
        throw new TypeError(
          'A valid refund amount in whole cents is required',
        );
      }

      if (refunds.has(chargeId)) {
        const existingRefund = refunds.get(chargeId);

        if (existingRefund.amountCents !== amountCents) {
          throw new TypeError(
            'This charge has already been refunded with a different amount',
          );
        }

        return existingRefund;
      }

      const result = {
        success: true,
        refundId: `MOCK-REFUND-${Date.now()}`,
        amountCents,
      };

      refunds.set(chargeId, result);

      return result;
    },
  };
}
