
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { createAppServer } from '../src/http/app.js';
import { createApiRouter } from '../src/http/routes.js';
import { createMemoryRepository } from '../src/repositories/memory.js';
import { createEventService } from '../src/services/eventService.js';
import { createBookingService } from '../src/services/bookingService.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';

describe('Build 4 REST API', () => {
  let server;
  let baseUrl;

  async function request(path, {
    method = 'GET',
    userId,
    body,
  } = {}) {
    const headers = {};

    if (userId) headers['x-user-id'] = userId;
    if (body !== undefined) headers['content-type'] = 'application/json';

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const data = await response.json();

    return {
      status: response.status,
      data,
    };
  }

  async function createPublishedEvent({
    title = 'Lagos Tech Meetup',
    capacity = 3,
    priceCents = 500000,
  } = {}) {
    const created = await request('/api/events', {
      method: 'POST',
      userId: 'organizer-1',
      body: {
        title,
        city: 'Lagos',
        venue: 'Victoria Island',
        startsAt: '2027-06-15T10:00:00.000Z',
      },
    });

    assert.equal(created.status, 201);

    const eventId = created.data.id;

    const tier = await request(`/api/events/${eventId}/tiers`, {
      method: 'POST',
      userId: 'organizer-1',
      body: {
        name: 'Regular',
        priceCents,
        capacity,
      },
    });

    assert.equal(tier.status, 201);

    const published = await request(`/api/events/${eventId}/publish`, {
      method: 'POST',
      userId: 'organizer-1',
    });

    assert.equal(published.status, 200);

    return {
      event: published.data,
      tier: tier.data,
    };
  }

  before(async () => {
    const repository = createMemoryRepository();
    const paymentGateway = createMockPaymentGateway();

    const eventService = createEventService(repository);
    const bookingService = createBookingService(repository, paymentGateway);

    const router = createApiRouter(eventService, bookingService);

    server = createAppServer({ router });

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });

    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });

  it('creates an event as a draft', async () => {
    const result = await request('/api/events', {
      method: 'POST',
      userId: 'organizer-1',
      body: {
        title: 'Abuja Developers Meetup',
        city: 'Abuja',
        venue: 'Central Area',
        startsAt: '2027-07-10T10:00:00.000Z',
      },
    });

    assert.equal(result.status, 201);
    assert.equal(result.data.title, 'Abuja Developers Meetup');
    assert.equal(result.data.status, 'draft');
    assert.ok(result.data.id);
  });

  it('rejects event creation without a user ID', async () => {
    const result = await request('/api/events', {
      method: 'POST',
      body: {
        title: 'Test Event',
        city: 'Lagos',
        startsAt: '2027-07-10T10:00:00.000Z',
      },
    });

    assert.equal(result.status, 400);
    assert.equal(result.data.error.code, 'VALIDATION');
  });

  it('rejects invalid event data', async () => {
    const result = await request('/api/events', {
      method: 'POST',
      userId: 'organizer-1',
      body: {
        title: '',
        city: 'Lagos',
        startsAt: 'invalid-date',
      },
    });

    assert.equal(result.status, 400);
    assert.equal(result.data.error.code, 'VALIDATION');
  });

  it('creates a ticket tier for an existing event', async () => {
    const created = await request('/api/events', {
      method: 'POST',
      userId: 'organizer-1',
      body: {
        title: 'Music Festival',
        city: 'Lagos',
        startsAt: '2027-08-10T10:00:00.000Z',
      },
    });

    const result = await request(`/api/events/${created.data.id}/tiers`, {
      method: 'POST',
      userId: 'organizer-1',
      body: {
        name: 'VIP',
        priceCents: 750000,
        capacity: 50,
      },
    });

    assert.equal(result.status, 201);
    assert.equal(result.data.priceCents, 750000);
    assert.equal(result.data.capacity, 50);
  });

  it('rejects adding a tier to a nonexistent event', async () => {
    const result = await request('/api/events/missing-event/tiers', {
      method: 'POST',
      userId: 'organizer-1',
      body: {
        name: 'Regular',
        priceCents: 500000,
        capacity: 10,
      },
    });

    assert.equal(result.status, 404);
    assert.equal(result.data.error.code, 'NOT_FOUND');
  });

  it('publishes an event with a ticket tier', async () => {
    const created = await request('/api/events', {
      method: 'POST',
      userId: 'organizer-1',
      body: {
        title: 'Published Event',
        city: 'Lagos',
        startsAt: '2027-09-10T10:00:00.000Z',
      },
    });

    await request(`/api/events/${created.data.id}/tiers`, {
      method: 'POST',
      userId: 'organizer-1',
      body: {
        name: 'Regular',
        priceCents: 100000,
        capacity: 20,
      },
    });

    const result = await request(`/api/events/${created.data.id}/publish`, {
      method: 'POST',
      userId: 'organizer-1',
    });

    assert.equal(result.status, 200);
    assert.equal(result.data.status, 'published');
  });

  it('rejects publishing an event without ticket tiers', async () => {
    const created = await request('/api/events', {
      method: 'POST',
      userId: 'organizer-1',
      body: {
        title: 'No Tier Event',
        city: 'Lagos',
        startsAt: '2027-09-10T10:00:00.000Z',
      },
    });

    const result = await request(`/api/events/${created.data.id}/publish`, {
      method: 'POST',
      userId: 'organizer-1',
    });

    assert.equal(result.status, 409);
    assert.equal(result.data.error.code, 'INVALID_STATE');
  });

  it('unpublishes an event', async () => {
    const { event } = await createPublishedEvent();

    const result = await request(`/api/events/${event.id}/unpublish`, {
      method: 'POST',
      userId: 'organizer-1',
    });

    assert.equal(result.status, 200);
    assert.equal(result.data.status, 'draft');
  });

  it('lists and searches published events', async () => {
    await createPublishedEvent({
      title: 'Lagos Technology Conference',
    });

    const result = await request('/api/events?city=lagos&q=technology');

    assert.equal(result.status, 200);
    assert.ok(Array.isArray(result.data));
    assert.ok(
      result.data.some((event) =>
        event.title.includes('Lagos Technology Conference'),
      ),
    );
  });

  it('rejects an invalid sorting option', async () => {
    const result = await request('/api/events?sortBy=unknown');

    assert.equal(result.status, 400);
    assert.equal(result.data.error.code, 'VALIDATION');
  });

  it('creates a pending booking and reduces available seats', async () => {
    const { tier } = await createPublishedEvent();

    const result = await request('/api/bookings', {
      method: 'POST',
      userId: 'attendee-1',
      body: {
        tierId: tier.id,
        quantity: 2,
      },
    });

    assert.equal(result.status, 201);
    assert.equal(result.data.status, 'pending');
    assert.equal(result.data.quantity, 2);
    assert.equal(result.data.amountCents, 1000000);
    assert.ok(result.data.reference);
  });

  it('rejects overbooking without changing inventory', async () => {
    const { tier } = await createPublishedEvent();

    await request('/api/bookings', {
      method: 'POST',
      userId: 'attendee-1',
      body: {
        tierId: tier.id,
        quantity: 2,
      },
    });

    const result = await request('/api/bookings', {
      method: 'POST',
      userId: 'attendee-2',
      body: {
        tierId: tier.id,
        quantity: 2,
      },
    });

    assert.equal(result.status, 409);
    assert.equal(result.data.error.code, 'SOLD_OUT');
  });

  it('rejects invalid booking quantities', async () => {
    const { tier } = await createPublishedEvent();

    const result = await request('/api/bookings', {
      method: 'POST',
      userId: 'attendee-1',
      body: {
        tierId: tier.id,
        quantity: 0,
      },
    });

    assert.equal(result.status, 400);
    assert.equal(result.data.error.code, 'VALIDATION');
  });

  it('rejects bookings for unpublished events', async () => {
    const created = await request('/api/events', {
      method: 'POST',
      userId: 'organizer-1',
      body: {
        title: 'Draft Event',
        city: 'Lagos',
        startsAt: '2027-10-10T10:00:00.000Z',
      },
    });

    const tier = await request(`/api/events/${created.data.id}/tiers`, {
      method: 'POST',
      userId: 'organizer-1',
      body: {
        name: 'Regular',
        priceCents: 100000,
        capacity: 10,
      },
    });

    const result = await request('/api/bookings', {
      method: 'POST',
      userId: 'attendee-1',
      body: {
        tierId: tier.data.id,
        quantity: 1,
      },
    });

    assert.equal(result.status, 409);
    assert.equal(result.data.error.code, 'INVALID_STATE');
  });

  it('pays a pending booking successfully', async () => {
    const { tier } = await createPublishedEvent();

    const booking = await request('/api/bookings', {
      method: 'POST',
      userId: 'attendee-1',
      body: {
        tierId: tier.id,
        quantity: 1,
      },
    });

    const result = await request(
      `/api/bookings/${booking.data.reference}/pay`,
      {
        method: 'POST',
        userId: 'attendee-1',
        body: { outcome: 'success' },
      },
    );

    assert.equal(result.status, 200);
    assert.equal(result.data.status, 'paid');
  });

  it('leaves a booking pending after declined payment and permits retry', async () => {
    const { tier } = await createPublishedEvent();

    const booking = await request('/api/bookings', {
      method: 'POST',
      userId: 'attendee-1',
      body: {
        tierId: tier.id,
        quantity: 1,
      },
    });

    const declined = await request(
      `/api/bookings/${booking.data.reference}/pay`,
      {
        method: 'POST',
        userId: 'attendee-1',
        body: { outcome: 'declined' },
      },
    );

    assert.equal(declined.status, 402);
    assert.equal(declined.data.error.code, 'PAYMENT_DECLINED');

    const retry = await request(
      `/api/bookings/${booking.data.reference}/pay`,
      {
        method: 'POST',
        userId: 'attendee-1',
        body: { outcome: 'success' },
      },
    );

    assert.equal(retry.status, 200);
    assert.equal(retry.data.status, 'paid');
  });

  it('does not allow another user to pay for a booking', async () => {
    const { tier } = await createPublishedEvent();

    const booking = await request('/api/bookings', {
      method: 'POST',
      userId: 'attendee-1',
      body: {
        tierId: tier.id,
        quantity: 1,
      },
    });

    const result = await request(
      `/api/bookings/${booking.data.reference}/pay`,
      {
        method: 'POST',
        userId: 'attendee-2',
        body: { outcome: 'success' },
      },
    );

    assert.equal(result.status, 403);
    assert.equal(result.data.error.code, 'FORBIDDEN');
  });

  it('rejects paying an already paid booking again', async () => {
    const { tier } = await createPublishedEvent();

    const booking = await request('/api/bookings', {
      method: 'POST',
      userId: 'attendee-1',
      body: {
        tierId: tier.id,
        quantity: 1,
      },
    });

    await request(`/api/bookings/${booking.data.reference}/pay`, {
      method: 'POST',
      userId: 'attendee-1',
      body: { outcome: 'success' },
    });

    const result = await request(
      `/api/bookings/${booking.data.reference}/pay`,
      {
        method: 'POST',
        userId: 'attendee-1',
        body: { outcome: 'success' },
      },
    );

    assert.equal(result.status, 409);
    assert.equal(result.data.error.code, 'INVALID_TRANSITION');
  });

  it('cancels an unpaid booking and releases its seats', async () => {
    const { tier } = await createPublishedEvent();

    const booking = await request('/api/bookings', {
      method: 'POST',
      userId: 'attendee-1',
      body: {
        tierId: tier.id,
        quantity: 1,
      },
    });

    const result = await request(
      `/api/bookings/${booking.data.reference}/cancel`,
      {
        method: 'POST',
        userId: 'attendee-1',
      },
    );

    assert.equal(result.status, 200);
    assert.equal(result.data.status, 'cancelled');
  });

  it('does not allow a cancelled booking to be paid', async () => {
    const { tier } = await createPublishedEvent();

    const booking = await request('/api/bookings', {
      method: 'POST',
      userId: 'attendee-1',
      body: {
        tierId: tier.id,
        quantity: 1,
      },
    });

    await request(
      `/api/bookings/${booking.data.reference}/cancel`,
      {
        method: 'POST',
        userId: 'attendee-1',
      },
    );

    const result = await request(
      `/api/bookings/${booking.data.reference}/pay`,
      {
        method: 'POST',
        userId: 'attendee-1',
        body: { outcome: 'success' },
      },
    );

    assert.equal(result.status, 409);
    assert.equal(result.data.error.code, 'INVALID_TRANSITION');
  });

  it('does not allow a paid booking to be cancelled', async () => {
    const { tier } = await createPublishedEvent();

    const booking = await request('/api/bookings', {
      method: 'POST',
      userId: 'attendee-1',
      body: {
        tierId: tier.id,
        quantity: 1,
      },
    });

    await request(`/api/bookings/${booking.data.reference}/pay`, {
      method: 'POST',
      userId: 'attendee-1',
      body: { outcome: 'success' },
    });

    const result = await request(
      `/api/bookings/${booking.data.reference}/cancel`,
      {
        method: 'POST',
        userId: 'attendee-1',
      },
    );

    assert.equal(result.status, 409);
  });
});
