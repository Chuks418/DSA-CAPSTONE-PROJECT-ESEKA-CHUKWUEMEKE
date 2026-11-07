
import { getToken } from './session.js';

const API_BASE_URL = '/api';

async function apiRequest(path, options = {}) {
  const token = getToken();

  const headers = {
    Accept: 'application/json',
    ...options.headers,
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      body:
        options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined,
    });
  } catch {
    throw new Error('Unable to connect to EventHub. Check that the server is running.');
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      data?.error?.message || `Request failed with status ${response.status}`
    );

    error.code = data?.error?.code || 'REQUEST_FAILED';
    error.status = response.status;

    throw error;
  }

  return data;
}

function buildQuery(criteria = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(criteria)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

// Authentication

export function signup({ email, password, role = 'attendee' }) {
  return apiRequest('/auth/signup', {
    method: 'POST',
    body: { email, password, role },
  });
}

export function login({ email, password }) {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function getCurrentUser() {
  return apiRequest('/auth/me');
}

// Public events

export function listEvents(criteria = {}) {
  return apiRequest(`/events${buildQuery(criteria)}`);
}

export function getEvent(eventId) {
  return apiRequest(`/events/${encodeURIComponent(eventId)}`);
}

// Attendee bookings

export function createBooking({ tierId, quantity }) {
  return apiRequest('/bookings', {
    method: 'POST',
    body: { tierId, quantity },
  });
}

export function listBookings() {
  return apiRequest('/bookings');
}

export function getBooking(reference) {
  return apiRequest(`/bookings/${encodeURIComponent(reference)}`);
}

export function pay(reference, { outcome = 'success' } = {}) {
  return apiRequest(
    `/bookings/${encodeURIComponent(reference)}/pay`,
    {
      method: 'POST',
      body: { outcome },
    }
  );
}

export function cancelBooking(reference) {
  return apiRequest(
    `/bookings/${encodeURIComponent(reference)}/cancel`,
    {
      method: 'POST',
      body: {},
    }
  );
}

// Organizer actions

export function listOrganizerEvents() {
  return apiRequest('/organizer/events');
}

export function createEvent(eventDetails) {
  return apiRequest('/events', {
    method: 'POST',
    body: eventDetails,
  });
}

export function addTicketTier(eventId, tierDetails) {
  return apiRequest(
    `/events/${encodeURIComponent(eventId)}/tiers`,
    {
      method: 'POST',
      body: tierDetails,
    }
  );
}

export function publishEvent(eventId) {
  return apiRequest(
    `/events/${encodeURIComponent(eventId)}/publish`,
    {
      method: 'POST',
      body: {},
    }
  );
}

export function unpublishEvent(eventId) {
  return apiRequest(
    `/events/${encodeURIComponent(eventId)}/unpublish`,
    {
      method: 'POST',
      body: {},
    }
  );
}
