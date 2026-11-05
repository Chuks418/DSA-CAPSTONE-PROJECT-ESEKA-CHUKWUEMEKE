export function createMockPaymentGateway() {
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
        };
      }

      return {
        success: true,
        transactionId: `MOCK-${Date.now()}`,
        amountCents,
      };
    },
  };
}