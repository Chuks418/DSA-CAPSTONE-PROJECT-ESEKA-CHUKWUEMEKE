
import {
  listOrganizerEvents,
  createEvent,
  addTicketTier,
  publishEvent,
  unpublishEvent,
} from '../api.js';

import {
  isAuthenticated,
  getUserRole,
  getUser,
  logout,
} from '../session.js';

import { el } from '../ui.js';

const createEventForm = document.querySelector('#create-event-form');
const createEventButton = document.querySelector('#create-event-button');
const createEventMessage = document.querySelector('#create-event-message');
const eventsList = document.querySelector('#organizer-events-list');
const logoutButton = document.querySelector('#logout-button');

const currencyFormatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
});

function formatPrice(priceCents) {
  return currencyFormatter.format(priceCents / 100);
}

function formatDate(dateValue) {
  return new Date(dateValue).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function showMessage(container, message, type = 'error') {
  container.className = `message message-${type}`;
  container.textContent = message;
  container.hidden = false;
}

function hideMessage(container) {
  container.hidden = true;
  container.textContent = '';
}

function requireOrganizer() {
  if (!isAuthenticated()) {
    window.location.href =
      `/login.html?returnTo=${encodeURIComponent('/organizer.html')}`;
    return false;
  }

  if (getUserRole() !== 'organizer') {
    window.location.href = '/';
    return false;
  }

  return true;
}

function createTierForm(event) {
  const nameInput = el('input', {
    id: `tier-name-${event.id}`,
    name: 'name',
    type: 'text',
    placeholder: 'e.g. Regular',
    required: true,
  });

  const priceInput = el('input', {
    id: `tier-price-${event.id}`,
    name: 'price',
    type: 'number',
    min: '1',
    step: '1',
    placeholder: 'e.g. 5000',
    required: true,
  });

  const capacityInput = el('input', {
    id: `tier-capacity-${event.id}`,
    name: 'capacity',
    type: 'number',
    min: '1',
    step: '1',
    placeholder: 'e.g. 100',
    required: true,
  });

  const message = el('p', {
    className: 'message',
    hidden: true,
    attrs: { role: 'alert' },
  });

  const submitButton = el('button', {
    className: 'button button-primary',
    type: 'submit',
    text: 'Add ticket tier',
  });

  const form = el('form', {
    className: 'filter-panel organizer-tier-form',
  }, [
    el('div', { className: 'form-group' }, [
      el('label', {
        htmlFor: nameInput.id,
        text: 'Ticket name',
      }),
      nameInput,
    ]),
    el('div', { className: 'form-group' }, [
      el('label', {
        htmlFor: priceInput.id,
        text: 'Price (NGN)',
      }),
      priceInput,
    ]),
    el('div', { className: 'form-group' }, [
      el('label', {
        htmlFor: capacityInput.id,
        text: 'Ticket capacity',
      }),
      capacityInput,
    ]),
    message,
    submitButton,
  ]);

  form.addEventListener('submit', async (submitEvent) => {
    submitEvent.preventDefault();
    hideMessage(message);

    const priceNaira = Number(priceInput.value);
    const capacity = Number(capacityInput.value);

    if (
      !Number.isSafeInteger(priceNaira) ||
      priceNaira < 1 ||
      !Number.isSafeInteger(capacity) ||
      capacity < 1 ||
      priceNaira > Number.MAX_SAFE_INTEGER / 100
    ) {
      showMessage(
        message,
        'Enter a valid whole-number price and ticket capacity.'
      );
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Adding tier...';

    try {
      await addTicketTier(event.id, {
        name: nameInput.value.trim(),
        priceCents: priceNaira * 100,
        capacity,
      });

      await loadOrganizerEvents();
    } catch (error) {
      showMessage(message, error.message);
      submitButton.disabled = false;
      submitButton.textContent = 'Add ticket tier';
    }
  });

  return form;
}

function createEventCard(event) {
  const tiers = Array.isArray(event.tiers) ? event.tiers : [];

  const tierList = el('div', { className: 'organizer-tier-list' });

  if (tiers.length === 0) {
    tierList.appendChild(
      el('p', {
        className: 'form-hint',
        text: 'No ticket tiers added yet.',
      })
    );
  } else {
    for (const tier of tiers) {
      tierList.appendChild(
        el('div', { className: 'organizer-tier-item' }, [
          el('strong', { text: tier.name }),
          el('span', {
            text: formatPrice(tier.priceCents),
          }),
          el('span', {
            text: `${tier.sold} / ${tier.capacity} sold`,
          }),
        ])
      );
    }
  }

  const status = el('span', {
    className: `status-pill status-${event.status}`,
    text: event.status,
  });

  const message = el('p', {
    className: 'message',
    hidden: true,
    attrs: { role: 'alert' },
  });

  const publishButton = el('button', {
    className: 'button button-primary',
    type: 'button',
    text: event.status === 'published' ? 'Unpublish event' : 'Publish event',
    disabled: tiers.length === 0,
  });

  publishButton.addEventListener('click', async () => {
    hideMessage(message);
    publishButton.disabled = true;
    publishButton.textContent = 'Updating...';

    try {
      if (event.status === 'published') {
        await unpublishEvent(event.id);
      } else {
        await publishEvent(event.id);
      }

      await loadOrganizerEvents();
    } catch (error) {
      showMessage(message, error.message);
      publishButton.disabled = false;
      publishButton.textContent =
        event.status === 'published' ? 'Unpublish event' : 'Publish event';
    }
  });

  const card = el('article', { className: 'event-card organizer-event-card' }, [
    el('div', { className: 'event-card-content' }, [
      el('div', { className: 'organizer-event-heading' }, [
        el('h3', { text: event.title }),
        status,
      ]),
      el('p', {
        className: 'event-venue',
        text: `${event.venue}, ${event.city}`,
      }),
      el('p', {
        className: 'event-date',
        text: formatDate(event.startsAt),
      }),
      el('h4', { text: 'Ticket tiers' }),
      tierList,
      message,
      publishButton,
    ]),
  ]);

  if (event.status === 'published') {
    card.querySelector('.event-card-content').appendChild(
      el('a', {
        className: 'back-link',
        href: `/event.html?id=${encodeURIComponent(event.id)}`,
        text: 'View public event',
      })
    );
  }

  card.querySelector('.event-card-content').appendChild(
    createTierForm(event)
  );

  return card;
}

async function loadOrganizerEvents() {
  eventsList.setAttribute('aria-busy', 'true');
  eventsList.replaceChildren(
    el('p', { text: 'Loading your events...' })
  );

  try {
    const events = await listOrganizerEvents();

    if (!events.length) {
      eventsList.replaceChildren(
        el('div', { className: 'empty-state' }, [
          el('h3', { text: 'No events yet' }),
          el('p', {
            text: 'Create your first event using the form above.',
          }),
        ])
      );
      return;
    }

    const grid = el('div', { className: 'events-grid' });

    for (const event of events) {
      grid.appendChild(createEventCard(event));
    }

    eventsList.replaceChildren(grid);
  } catch (error) {
    eventsList.replaceChildren(
      el('div', { className: 'message message-error' }, [
        el('p', { text: error.message }),
        el('button', {
          className: 'button button-secondary',
          type: 'button',
          text: 'Try again',
        }),
      ])
    );

    eventsList.querySelector('button').addEventListener(
      'click',
      loadOrganizerEvents
    );
  } finally {
    eventsList.setAttribute('aria-busy', 'false');
  }
}

createEventForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage(createEventMessage);

  const formData = new FormData(createEventForm);
  const startsAt = new Date(formData.get('startsAt'));

  if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) {
    showMessage(
      createEventMessage,
      'Choose a valid date and time in the future.'
    );
    return;
  }

  createEventButton.disabled = true;
  createEventButton.textContent = 'Creating event...';

  try {
    await createEvent({
      title: String(formData.get('title')).trim(),
      city: String(formData.get('city')).trim(),
      venue: String(formData.get('venue')).trim(),
      startsAt: startsAt.toISOString(),
    });

    createEventForm.reset();

    showMessage(
      createEventMessage,
      'Event created successfully. Add ticket tiers below.',
      'success'
    );

    await loadOrganizerEvents();
  } catch (error) {
    showMessage(createEventMessage, error.message);
  } finally {
    createEventButton.disabled = false;
    createEventButton.textContent = 'Create event';
  }
});

logoutButton.addEventListener('click', logout);

async function initializeOrganizerPage() {
  if (!requireOrganizer()) return;

  try {
    await getUser();
  } catch {
    window.location.href =
      `/login.html?returnTo=${encodeURIComponent('/organizer.html')}`;
    return;
  }

  await loadOrganizerEvents();
}

initializeOrganizerPage();
