
import {
  getEvent,
  createBooking,
  pay,
} from '../api.js';

import { getToken, getUserRole } from '../session.js';
import { el } from '../ui.js';

const eventContent = document.querySelector('#event-content');
const checkoutSection = document.querySelector('#checkout-section');
const checkoutSummary = document.querySelector('#checkout-summary');
const checkoutTotal = document.querySelector('#checkout-total');
const countdown = document.querySelector('#countdown');
const paymentForm = document.querySelector('#payment-form');
const paymentError = document.querySelector('#payment-error');
const paymentSuccess = document.querySelector('#payment-success');
const payButton = document.querySelector('#pay-button');

const params = new URLSearchParams(window.location.search);
const eventId = params.get('id');

const currencyFormatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
});

let currentBooking = null;

function formatPrice(priceCents) {
  return currencyFormatter.format(priceCents / 100);
}

function formatDate(dateValue) {
  return new Date(dateValue).toLocaleString('en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function showEventError(message) {
  eventContent.replaceChildren(
    el('div', { className: 'message message-error' }, [
      el('h2', { text: 'Unable to load event' }),
      el('p', { text: message }),
      el('a', {
        className: 'button button-primary',
        href: '/',
        text: 'Back to events',
      }),
    ])
  );

  eventContent.setAttribute('aria-busy', 'false');
}

function showBookingError(container, message) {
  const errorMessage = container.querySelector('.booking-error');

  if (errorMessage) {
    errorMessage.textContent = message;
    errorMessage.hidden = false;
  }
}

function createTierCard(tier) {
  const seatsLeft = Math.max(0, tier.capacity - tier.sold);
  const soldOut = seatsLeft === 0;
  const maximumQuantity = Math.min(10, seatsLeft);

  const quantityInput = el('input', {
    id: `quantity-${tier.id}`,
    name: 'quantity',
    type: 'number',
    min: '1',
    max: String(maximumQuantity),
    value: '1',
    required: true,
    disabled: soldOut,
    attrs: {
      inputmode: 'numeric',
    },
  });

  const quantityLabel = el('label', {
    htmlFor: `quantity-${tier.id}`,
    text: 'Number of tickets',
  });

  const availability = el('p', {
    className: soldOut
      ? 'availability sold-out'
      : 'availability available',
    text: soldOut
      ? 'Sold out'
      : `${seatsLeft} tickets available`,
  });

  const bookingError = el('p', {
    className: 'booking-error message message-error',
    hidden: true,
    attrs: {
      role: 'alert',
    },
  });

  const bookButton = el('button', {
    className: 'button button-primary',
    type: 'submit',
    disabled: soldOut,
    text: soldOut ? 'Sold out' : 'Book tickets',
  });

  const bookingForm = el('form', {
    className: 'tier-booking-form',
  }, [
    el('div', { className: 'form-group' }, [
      quantityLabel,
      quantityInput,
    ]),
    bookingError,
    bookButton,
  ]);

  bookingForm.addEventListener('submit', async (submitEvent) => {
    submitEvent.preventDefault();

    bookingError.hidden = true;

    if (!getToken()) {
      const returnTo = window.location.pathname + window.location.search;

      window.location.href =
        `/login.html?returnTo=${encodeURIComponent(returnTo)}`;

      return;
    }

    if (getUserRole() !== 'attendee') {
      showBookingError(
        bookingForm,
        'Only attendee accounts can book tickets.'
      );
      return;
    }

    bookButton.disabled = true;
    bookButton.textContent = 'Reserving...';

    const quantity = Number(quantityInput.value);

    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > maximumQuantity
    ) {
      showBookingError(
        bookingForm,
        `Choose between 1 and ${maximumQuantity} tickets.`
      );

      bookButton.disabled = false;
      bookButton.textContent = 'Book tickets';
      return;
    }

    try {
      const booking = await createBooking({
        tierId: tier.id,
        quantity,
      });

      currentBooking = booking;
      showCheckout(tier, booking);
    } catch (error) {
      showBookingError(
        bookingForm,
        error.message || 'Unable to reserve tickets. Please try again.'
      );
    } finally {
      bookButton.disabled = soldOut;
      bookButton.textContent = soldOut ? 'Sold out' : 'Book tickets';
    }
  });

  return el('article', { className: 'tier-card' }, [
    el('div', { className: 'tier-card-heading' }, [
      el('h3', { text: tier.name }),
      el('strong', {
        className: 'tier-price',
        text: formatPrice(tier.priceCents),
      }),
    ]),
    availability,
    bookingForm,
  ]);
}

function displayEvent(event) {
  const eventHeader = el('section', { className: 'event-hero' }, [
    el('p', {
      className: 'eyebrow',
      text: event.city,
    }),
    el('h1', { text: event.title }),
    el('p', {
      className: 'event-venue',
      text: event.venue,
    }),
    el('p', {
      className: 'event-date',
      text: formatDate(event.startsAt),
    }),
  ]);

  const tiersHeading = el('div', { className: 'section-heading' }, [
    el('div', {}, [
      el('p', {
        className: 'eyebrow',
        text: 'CHOOSE YOUR TICKET',
      }),
      el('h2', { text: 'Available ticket tiers' }),
    ]),
  ]);

  const tiersGrid = el('div', { className: 'tiers-grid' });

  for (const tier of event.tiers) {
    tiersGrid.appendChild(createTierCard(tier));
  }

  eventContent.replaceChildren(
    eventHeader,
    tiersHeading,
    tiersGrid
  );

  eventContent.setAttribute('aria-busy', 'false');
}

function showCheckout(tier, booking) {
  checkoutSummary.textContent =
    `${booking.quantity} × ${tier.name}`;

  checkoutTotal.textContent = formatPrice(booking.amountCents);

  paymentError.hidden = true;
  paymentSuccess.hidden = true;
  paymentForm.reset();

  countdown.textContent = 'Complete payment to confirm your booking.';

  checkoutSection.hidden = false;

  checkoutSection.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

function showPaymentError(message) {
  paymentSuccess.hidden = true;
  paymentError.textContent = message;
  paymentError.hidden = false;
}

function showPaymentSuccess(booking) {
  paymentError.hidden = true;

  paymentSuccess.replaceChildren(
    el('h3', { text: 'Payment successful' }),
    el('p', {
      text: `Your booking reference is ${booking.reference}.`,
    }),
    el('p', {
      text: 'Your tickets have been confirmed.',
    }),
    el('a', {
      className: 'button button-primary',
      href: '/tickets.html',
      text: 'View my tickets',
    })
  );

  paymentSuccess.hidden = false;
  payButton.disabled = true;
  payButton.textContent = 'Payment complete';

  const cardInputs = paymentForm.querySelectorAll('input');

  for (const input of cardInputs) {
    input.disabled = true;
  }
}

paymentForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!currentBooking) {
    showPaymentError('No active booking was found. Please book again.');
    return;
  }

  const formData = new FormData(paymentForm);

  const cardNumber = String(formData.get('cardNumber') || '')
    .replace(/\D/g, '');

  if (cardNumber.length < 12 || cardNumber.length > 19) {
    showPaymentError('Enter a valid test card number.');
    return;
  }

  const outcome = cardNumber.endsWith('0000')
    ? 'declined'
    : 'success';

  paymentError.hidden = true;
  paymentSuccess.hidden = true;
  payButton.disabled = true;
  payButton.textContent = 'Processing...';

  try {
    const booking = await pay(currentBooking.reference, { outcome });

    currentBooking = booking;
    showPaymentSuccess(booking);
  } catch (error) {
    showPaymentError(
      error.message || 'Payment failed. Please try again.'
    );

    payButton.disabled = false;
    payButton.textContent = 'Retry payment';
  }
});

async function initializeEventPage() {
  if (!eventId) {
    showEventError('No event was selected. Please choose an event first.');
    return;
  }

  try {
    const event = await getEvent(eventId);
    displayEvent(event);
  } catch (error) {
    showEventError(
      error.message || 'The requested event could not be found.'
    );
  }
}

initializeEventPage();
