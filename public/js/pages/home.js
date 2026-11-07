import { listEvents } from '../api.js';
import { el } from '../ui.js';

const eventsList = document.querySelector('#events-list');
const resultsCount = document.querySelector('#results-count');
const filterForm = document.querySelector('#filter-form');
const cityFilter = document.querySelector('#city-filter');
const clearFiltersButton = document.querySelector('#clear-filters');

const currencyFormatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
});

function formatPrice(priceCents) {
  if (priceCents === null || priceCents === undefined) {
    return 'Price unavailable';
  }

  return currencyFormatter.format(priceCents / 100);
}

function formatDate(dateValue) {
  return new Date(dateValue).toLocaleDateString('en-NG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function populateCityFilter(events) {
  const cities = [
    ...new Set(events.map((event) => event.city)),
  ].sort((a, b) => a.localeCompare(b));

  for (const city of cities) {
    cityFilter.appendChild(
      el('option', {
        value: city,
        text: city,
      })
    );
  }
}

function createEventCard(event) {
  const available = event.seatsLeft > 0;

  const availability = available
    ? `${event.seatsLeft} tickets available`
    : 'Sold out';

  const availabilityClass = available
    ? 'availability available'
    : 'availability sold-out';

  const details = el('div', { className: 'event-card-details' }, [
    el('p', { className: 'event-city', text: event.city }),
    el('h3', { className: 'event-title', text: event.title }),
    el('p', {
      className: 'event-venue',
      text: event.venue,
    }),
    el('p', {
      className: 'event-date',
      text: formatDate(event.startsAt),
    }),
  ]);

  const footer = el('div', { className: 'event-card-footer' }, [
    el('div', { className: 'event-price' }, [
      el('span', {
        className: 'price-label',
        text: 'From',
      }),
      el('strong', {
        text: formatPrice(event.minPriceCents),
      }),
    ]),
    el('span', {
      className: availabilityClass,
      text: availability,
    }),
  ]);

  const link = el(
    'a',
    {
      className: 'button button-primary event-link',
      href: `/event.html?id=${encodeURIComponent(event.id)}`,
      text: 'View event',
      attrs: {
        'aria-label': `View ${event.title}`,
      },
    }
  );

  return el('article', { className: 'event-card' }, [
    details,
    footer,
    link,
  ]);
}

function displayEvents(events) {
  eventsList.replaceChildren();

  if (events.length === 0) {
    eventsList.appendChild(
      el('div', { className: 'empty-state' }, [
        el('h3', { text: 'No events found' }),
        el('p', {
          text: 'Try changing your search or filter options.',
        }),
      ])
    );

    return;
  }

  for (const event of events) {
    eventsList.appendChild(createEventCard(event));
  }
}

function showError(error) {
  eventsList.replaceChildren(
    el('div', { className: 'message message-error' }, [
      el('h3', { text: 'Unable to load events' }),
      el('p', {
        text: error.message || 'Something went wrong. Please try again.',
      }),
    ])
  );

  resultsCount.textContent = 'Events unavailable';
}

function getFilterCriteria() {
  const formData = new FormData(filterForm);

  const criteria = {
    q: String(formData.get('q') || '').trim(),
    city: String(formData.get('city') || '').trim(),
    sortBy: String(formData.get('sortBy') || 'date'),
  };

  const maxPrice = String(formData.get('maxPrice') || '').trim();

  if (maxPrice !== '') {
    criteria.maxPriceCents = Math.round(Number(maxPrice) * 100);
  }

  return criteria;
}

async function loadEvents(criteria = {}) {
  eventsList.setAttribute('aria-busy', 'true');

  try {
    const events = await listEvents(criteria);

    displayEvents(events);

    resultsCount.textContent =
      `${events.length} ${events.length === 1 ? 'event' : 'events'} found`;
  } catch (error) {
    showError(error);
  } finally {
    eventsList.setAttribute('aria-busy', 'false');
  }
}

async function initializeHomePage() {
  try {
    const events = await listEvents({ sortBy: 'date' });

    populateCityFilter(events);
    displayEvents(events);

    resultsCount.textContent =
      `${events.length} ${events.length === 1 ? 'event' : 'events'} found`;
  } catch (error) {
    showError(error);
  } finally {
    eventsList.setAttribute('aria-busy', 'false');
  }
}

filterForm.addEventListener('submit', (event) => {
  event.preventDefault();
  loadEvents(getFilterCriteria());
});

clearFiltersButton.addEventListener('click', () => {
  filterForm.reset();
  loadEvents({ sortBy: 'date' });
});

initializeHomePage();