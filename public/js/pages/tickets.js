
import {
  listBookings,
  cancelBooking,
  getCurrentUser,
} from '../api.js';

import {
  isAuthenticated,
  getUserRole,
  clearSession,
  logout,
} from '../session.js';

const ticketsList = document.querySelector('#tickets-list');
const ticketsMessage = document.querySelector('#tickets-message');
const logoutButton = document.querySelector('#logout-button');

function formatMoney(amountCents) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

function formatDate(dateValue) {
  if (!dateValue) return 'Date not available';

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return 'Date not available';
  }

  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date);
}

function showMessage(message, type = 'error') {
  ticketsMessage.textContent = message;
  ticketsMessage.className = `message message-${type}`;
  ticketsMessage.hidden = false;
}

function hideMessage() {
  ticketsMessage.hidden = true;
  ticketsMessage.textContent = '';
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    element.textContent = text;
  }

  return element;
}

function createBookingCard(booking) {
  const card = createElement('article', 'ticket-card');

  const heading = createElement('div', 'ticket-card-heading');
  const eventDetails = createElement('div', 'ticket-event-details');

  const eventTitle = createElement(
    'h2',
    'ticket-event-title',
    booking.event?.title || 'Event details unavailable'
  );

  const venue = createElement(
    'p',
    'ticket-muted',
    booking.event?.venue
      ? `${booking.event.venue}, ${booking.event.city || ''}`
      : booking.event?.city || 'Venue unavailable'
  );

  const eventDate = createElement(
    'p',
    'ticket-muted',
    formatDate(booking.event?.startsAt)
  );

  eventDetails.append(eventTitle, venue, eventDate);

  const status = createElement(
    'span',
    `booking-status status-${booking.status}`,
    booking.status.replaceAll('_', ' ')
  );

  heading.append(eventDetails, status);

  const divider = createElement('div', 'ticket-divider');

  const details = createElement('div', 'ticket-details');

  const detailItems = [
    ['Ticket type', booking.tier?.name || 'Unavailable'],
    ['Quantity', String(booking.quantity)],
    ['Amount', formatMoney(booking.amountCents)],
    ['Booking reference', booking.reference],
  ];

  for (const [label, value] of detailItems) {
    const item = createElement('div', 'ticket-detail');
    item.append(
      createElement('span', 'ticket-detail-label', label),
      createElement('strong', 'ticket-detail-value', value)
    );
    details.append(item);
  }

  card.append(heading, divider, details);

  const actions = createElement('div', 'ticket-actions');

  if (booking.event?.id) {
    const eventLink = createElement(
      'a',
      'button button-secondary',
      'View event'
    );

    eventLink.href = `/event.html?id=${encodeURIComponent(booking.event.id)}`;
    actions.append(eventLink);
  }

  if (booking.status === 'pending') {
    const cancelButton = createElement(
      'button',
      'button button-secondary cancel-booking-button',
      'Cancel booking'
    );

    cancelButton.type = 'button';

    cancelButton.addEventListener('click', async () => {
      const confirmed = window.confirm(
        'Are you sure you want to cancel this booking?'
      );

      if (!confirmed) return;

      cancelButton.disabled = true;
      cancelButton.textContent = 'Cancelling...';

      try {
        await cancelBooking(booking.reference);
        showMessage('Your booking has been cancelled.', 'success');
        await loadTickets();
      } catch (error) {
        showMessage(error.message);
        cancelButton.disabled = false;
        cancelButton.textContent = 'Cancel booking';
      }
    });

    actions.append(cancelButton);
  }

  if (actions.children.length > 0) {
    card.append(actions);
  }

  return card;
}

function renderBookings(bookings) {
  ticketsList.replaceChildren();

  if (!Array.isArray(bookings) || bookings.length === 0) {
    const emptyState = createElement('div', 'empty-state');

    emptyState.append(
      createElement('h3', '', 'No bookings yet'),
      createElement(
        'p',
        '',
        'You have not booked any tickets. Explore upcoming events to get started.'
      )
    );

    const exploreLink = createElement(
      'a',
      'button button-primary',
      'Discover events'
    );

    exploreLink.href = '/';

    emptyState.append(exploreLink);
    ticketsList.append(emptyState);
    return;
  }

  for (const booking of bookings) {
    ticketsList.append(createBookingCard(booking));
  }
}

async function loadTickets() {
  hideMessage();

  ticketsList.setAttribute('aria-busy', 'true');
  ticketsList.replaceChildren(
    createElement('p', '', 'Loading your tickets...')
  );

  try {
    const bookings = await listBookings();

    renderBookings(bookings);
  } catch (error) {
    ticketsList.replaceChildren();

    if (error.code === 'UNAUTHENTICATED') {
      clearSession();
      window.location.href = '/login.html?returnTo=%2Ftickets.html';
      return;
    }

    showMessage(error.message || 'Unable to load your bookings.');
  } finally {
    ticketsList.setAttribute('aria-busy', 'false');
  }
}

async function initialize() {
  if (!isAuthenticated()) {
    window.location.href = '/login.html?returnTo=%2Ftickets.html';
    return;
  }

  if (getUserRole() !== 'attendee') {
    if (getUserRole() === 'organizer') {
      window.location.href = '/organizer.html';
    } else {
      showMessage('This page is only available to attendee accounts.');
    }
    return;
  }

  try {
    await getCurrentUser();
    await loadTickets();
  } catch (error) {
    if (error.code === 'UNAUTHENTICATED') {
      clearSession();
      window.location.href = '/login.html?returnTo=%2Ftickets.html';
      return;
    }

    showMessage(error.message || 'Unable to verify your account.');
    ticketsList.setAttribute('aria-busy', 'false');
  }
}

logoutButton.addEventListener('click', logout);

initialize();
