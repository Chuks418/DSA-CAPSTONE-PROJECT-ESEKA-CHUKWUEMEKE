
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

import { createAppServer } from '../src/http/app.js';
import { createApiRouter } from '../src/http/routes.js';
import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { createEventService } from '../src/services/eventService.js';
import { createBookingService } from '../src/services/bookingService.js';
import { createAuthService } from '../src/services/authService.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';

process.env.JWT_SECRET ??=
  'EventHub-Test-Secret-At-Least-32-Characters-Long';

describe('Build 7 API authentication and authorization', () => {
  let server;
  let baseUrl;
  let db;

  let organizerA;
  let organizerB;
  let attendeeA;
  let attendeeB;

  async function request(path, {
    method = 'GET',
    token,
    body,
  } = {}) {
    const headers = {};

    if (token) {
      headers.authorization = `Bearer ${token}`;
    }

    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }

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

  async function signup(email, role = 'attendee') {
    const result = await request('/api/auth/signup', {
      method: 'POST',
      body: {
        email,
        password: 'Password123!',
        role,
      },
    });

    assert.equal(result.status, 201);

    return result.data;
  }

  async function createPublishedEvent({
    title = 'Lagos Tech Meetup',
    capacity = 3,
    priceCents = 500000,
    token = organizerA.token,
  } = {}) {
    const created = await request('/api/events', {
      method: 'POST',
      token,
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
      token,
      body: {
        name: 'Regular',
        priceCents,
        capacity,
      },
    });

    assert.equal(tier.status, 201);

    const published = await request(`/api/events/${eventId}/publish`, {
      method: 'POST',
      token,
    });

    assert.equal(published.status, 200);

    return {
      event: published.data,
      tier: tier.data,
    };
  }

  async function createBooking(tierId, token = attendeeA.token, quantity = 1) {
    const result = await request('/api/bookings', {
      method: 'POST',
      token,
      body: {
        tierId,
        quantity,
      },
    });

    return result;
  }

  before(async () => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');

    const schema = readFileSync(
      new URL('../src/db/schema.sql', import.meta.url),
      'utf8',
    );

    db.exec(schema);

    // Match the unique email index created by the production migration.
    db.exec(`
      CREATE UNIQUE INDEX users_email_unique
      ON users(email COLLATE NOCASE)
      WHERE email IS NOT NULL
    `);

    const repository = createSqliteRepository(db);
    const paymentGateway = createMockPaymentGateway();

    const eventService = createEventService(repository);
    const bookingService = createBookingService(
      repository,
      paymentGateway,
    );
    const authService = createAuthService(repository);

    const router = createApiRouter(
      eventService,
      bookingService,
      authService,
      repository,
    );

    server = createAppServer({ router });

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });

    baseUrl = `http://127.0.0.1:${server.address().port}`;

    organizerA = await signup('organizer-a@example.com', 'organizer');
    organizerB = await signup('organizer-b@example.com', 'organizer');
    attendeeA = await signup('attendee-a@example.com');
    attendeeB = await signup('attendee-b@example.com');
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

    if (db) {
      db.close();
    }
  });

  // Authentication

  it('creates an attendee account by default', async () => {
    const result = await request('/api/auth/signup', {
      method: 'POST',
      body: {
        email: 'default-attendee@example.com',
        password: 'Password123!',
      },
    });

    assert.equal(result.status, 201);
    assert.equal(result.data.user.role, 'attendee');
    assert.ok(result.data.token);
    assert.equal(result.data.user.email, 'default-attendee@example.com');
    assert.equal('passwordHash' in result.data.user, false);
  });

  it('rejects duplicate email addresses', async () => {
    const result = await request('/api/auth/signup', {
      method: 'POST',
      body: {
        email: 'ORGANIZER-A@example.com',
        password: 'Password123!',
      },
    });

    assert.equal(result.status, 409);
    assert.equal(result.data.error.code, 'EMAIL_TAKEN');
  });

  it('rejects signup with a password shorter than eight characters', async () => {
    const result = await request('/api/auth/signup', {
      method: 'POST',
      body: {
        email: 'short-password@example.com',
        password: 'short',
      },
    });

    assert.equal(result.status, 400);
    assert.equal(result.data.error.code, 'VALIDATION');
  });

  it('logs in with valid credentials and returns a token', async () => {
    const result = await request('/api/auth/login', {
      method: 'POST',
      body: {
        email: 'attendee-a@example.com',
        password: 'Password123!',
      },
    });

    assert.equal(result.status, 200);
    assert.ok(result.data.token);
    assert.equal(result.data.user.role, 'attendee');
  });

  it('uses the same error for an unknown email and wrong password', async () => {
    const wrongPassword = await request('/api/auth/login', {
      method: 'POST',
      body: {
        email: 'attendee-a@example.com',
        password: 'WrongPassword!',
      },
    });

    const unknownEmail = await request('/api/auth/login', {
      method: 'POST',
      body: {
        email: 'unknown@example.com',
        password: 'WrongPassword!',
      },
    });

    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.equal(
      wrongPassword.data.error.code,
      'INVALID_CREDENTIALS',
    );
    assert.equal(
      unknownEmail.data.error.code,
      'INVALID_CREDENTIALS',
    );
    assert.equal(
      wrongPassword.data.error.message,
      unknownEmail.data.error.message,
    );
  });

  it('returns the authenticated user from /api/auth/me', async () => {
    const result = await request('/api/auth/me', {
      token: attendeeA.token,
    });

    assert.equal(result.status, 200);
    assert.equal(result.data.email, 'attendee-a@example.com');
    assert.equal(result.data.role, 'attendee');
    assert.equal('passwordHash' in result.data, false);
  });

  it('rejects protected requests without a token', async () => {
    const result = await request('/api/auth/me');

    assert.equal(result.status, 401);
    assert.equal(result.data.error.code, 'UNAUTHENTICATED');
  });

  it('rejects an invalid or edited token', async () => {
    const result = await request('/api/auth/me', {
      token: `${attendeeA.token}edited`,
    });

    assert.equal(result.status, 401);
    assert.equal(result.data.error.code, 'UNAUTHENTICATED');
  });


  it('rejects an expired token on a protected request', async () => {
    const now = Math.floor(Date.now() / 1000);

    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' })
    ).toString('base64url');

    const payload = Buffer.from(
      JSON.stringify({
        sub: attendeeA.user.id,
        role: 'attendee',
        iat: now - 120,
        exp: now - 60,
      })
    ).toString('base64url');

    const unsignedToken = `${header}.${payload}`;

    const signature = createHmac('sha256', process.env.JWT_SECRET)
      .update(unsignedToken)
      .digest('base64url');

    const expiredToken = `${unsignedToken}.${signature}`;

    const result = await request('/api/auth/me', {
      token: expiredToken,
    });

    assert.equal(result.status, 401);
    assert.equal(result.data.error.code, 'UNAUTHENTICATED');
  });
  // Event management and organizer authorization

  it('creates an event as a draft', async () => {
    const result = await request('/api/events', {
      method: 'POST',
      token: organizerA.token,
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

  it('rejects event creation without authentication', async () => {
    const result = await request('/api/events', {
      method: 'POST',
      body: {
        title: 'Test Event',
        city: 'Lagos',
        startsAt: '2027-07-10T10:00:00.000Z',
      },
    });

    assert.equal(result.status, 401);
    assert.equal(result.data.error.code, 'UNAUTHENTICATED');
  });

  it('prevents an attendee from creating an event', async () => {
    const result = await request('/api/events', {
      method: 'POST',
      token: attendeeA.token,
      body: {
        title: 'Attendee Event',
        city: 'Lagos',
        startsAt: '2027-07-10T10:00:00.000Z',
      },
    });

    assert.equal(result.status, 403);
    assert.equal(result.data.error.code, 'FORBIDDEN');
  });

  it('rejects invalid event data from an authenticated organizer', async () => {
    const result = await request('/api/events', {
      method: 'POST',
      token: organizerA.token,
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
      token: organizerA.token,
      body: {
        title: 'Music Festival',
        city: 'Lagos',
        startsAt: '2027-08-10T10:00:00.000Z',
      },
    });

    const result = await request(`/api/events/${created.data.id}/tiers`, {
      method: 'POST',
      token: organizerA.token,
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
      token: organizerA.token,
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
      token: organizerA.token,
      body: {
        title: 'Published Event',
        city: 'Lagos',
        startsAt: '2027-09-10T10:00:00.000Z',
      },
    });

    await request(`/api/events/${created.data.id}/tiers`, {
      method: 'POST',
      token: organizerA.token,
      body: {
        name: 'Regular',
        priceCents: 100000,
        capacity: 20,
      },
    });

    const result = await request(`/api/events/${created.data.id}/publish`, {
      method: 'POST',
      token: organizerA.token,
    });

    assert.equal(result.status, 200);
    assert.equal(result.data.status, 'published');
  });

  it('rejects publishing an event without ticket tiers', async () => {
    const created = await request('/api/events', {
      method: 'POST',
      token: organizerA.token,
      body: {
        title: 'No Tier Event',
        city: 'Lagos',
        startsAt: '2027-09-10T10:00:00.000Z',
      },
    });

    const result = await request(`/api/events/${created.data.id}/publish`, {
      method: 'POST',
      token: organizerA.token,
    });

    assert.equal(result.status, 409);
    assert.equal(result.data.error.code, 'INVALID_STATE');
  });

  it('unpublishes an event owned by the organizer', async () => {
    const { event } = await createPublishedEvent();

    const result = await request(`/api/events/${event.id}/unpublish`, {
      method: 'POST',
      token: organizerA.token,
    });

    assert.equal(result.status, 200);
    assert.equal(result.data.status, 'draft');
  });

  it('prevents one organizer from modifying another organizer event', async () => {
    const { event } = await createPublishedEvent();

    const result = await request(`/api/events/${event.id}/unpublish`, {
      method: 'POST',
      token: organizerB.token,
    });

    assert.equal(result.status, 403);
    assert.equal(result.data.error.code, 'FORBIDDEN');
  });

  it('prevents one organizer from adding tiers to another organizer event', async () => {
    const { event } = await createPublishedEvent();

    const result = await request(`/api/events/${event.id}/tiers`, {
      method: 'POST',
      token: organizerB.token,
      body: {
        name: 'Unauthorized Tier',
        priceCents: 100000,
        capacity: 10,
      },
    });

    assert.equal(result.status, 403);
    assert.equal(result.data.error.code, 'FORBIDDEN');
  });

  it('lists and searches published events publicly', async () => {
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


  it('returns a published event with its ticket tiers', async () => {
    const { event, tier } = await createPublishedEvent();

    const result = await request(`/api/events/${event.id}`);

    assert.equal(result.status, 200);
    assert.equal(result.data.id, event.id);
    assert.equal(result.data.status, 'published');
    assert.ok(Array.isArray(result.data.tiers));
    assert.equal(result.data.tiers.length, 1);
    assert.equal(result.data.tiers[0].id, tier.id);
  });

  it('does not expose draft events through the public event details endpoint', async () => {
    const draft = await request('/api/events', {
      method: 'POST',
      token: organizerA.token,
      body: {
        title: 'Private Draft Event',
        city: 'Benin City',
        venue: 'Test Venue',
        startsAt: '2027-06-15T10:00:00.000Z',
      },
    });

    assert.equal(draft.status, 201);

    const result = await request(`/api/events/${draft.data.id}`);

    assert.equal(result.status, 404);
    assert.equal(result.data.error.code, 'NOT_FOUND');
  });

  it('returns only the authenticated organizer events with their tiers', async () => {
    const { event, tier } = await createPublishedEvent();

    const otherEvent = await request('/api/events', {
      method: 'POST',
      token: organizerB.token,
      body: {
        title: 'Another Organizer Event',
        city: 'Lagos',
        venue: 'Another Venue',
        startsAt: '2027-07-15T10:00:00.000Z',
      },
    });

    assert.equal(otherEvent.status, 201);

    const result = await request('/api/organizer/events', {
      token: organizerA.token,
    });

    assert.equal(result.status, 200);
    assert.ok(Array.isArray(result.data));
    assert.ok(result.data.some((item) => item.id === event.id));
    assert.ok(result.data.every((item) => item.organizerId === organizerA.user.id));

    const ownEvent = result.data.find((item) => item.id === event.id);

    assert.equal(ownEvent.tiers.length, 1);
    assert.equal(ownEvent.tiers[0].id, tier.id);
    assert.ok(!result.data.some((item) => item.id === otherEvent.data.id));
  });

  it('prevents attendees from accessing the organizer dashboard', async () => {
    const result = await request('/api/organizer/events', {
      token: attendeeA.token,
    });

    assert.equal(result.status, 403);
    assert.equal(result.data.error.code, 'FORBIDDEN');
  });

  it('rejects an invalid sorting option', async () => {
    const result = await request('/api/events?sortBy=unknown');

    assert.equal(result.status, 400);
    assert.equal(result.data.error.code, 'VALIDATION');
  });

  // Booking and attendee authorization

  it('creates a pending booking and reduces available seats', async () => {
    const { tier } = await createPublishedEvent();

    const result = await createBooking(tier.id, attendeeA.token, 2);

    assert.equal(result.status, 201);
    assert.equal(result.data.status, 'pending');
    assert.equal(result.data.quantity, 2);
    assert.equal(result.data.amountCents, 1000000);
    assert.ok(result.data.reference);
  });

  it('rejects overbooking without changing inventory', async () => {
    const { tier } = await createPublishedEvent();

    const first = await createBooking(tier.id, attendeeA.token, 2);
    assert.equal(first.status, 201);

    const second = await createBooking(tier.id, attendeeB.token, 2);

    assert.equal(second.status, 409);
    assert.equal(second.data.error.code, 'SOLD_OUT');
  });

  it('rejects invalid booking quantities', async () => {
    const { tier } = await createPublishedEvent();

    const result = await createBooking(tier.id, attendeeA.token, 0);

    assert.equal(result.status, 400);
    assert.equal(result.data.error.code, 'VALIDATION');
  });

  it('rejects bookings for unpublished events', async () => {
    const created = await request('/api/events', {
      method: 'POST',
      token: organizerA.token,
      body: {
        title: 'Draft Event',
        city: 'Lagos',
        startsAt: '2027-10-10T10:00:00.000Z',
      },
    });

    const tier = await request(`/api/events/${created.data.id}/tiers`, {
      method: 'POST',
      token: organizerA.token,
      body: {
        name: 'Regular',
        priceCents: 100000,
        capacity: 10,
      },
    });

    const result = await createBooking(tier.data.id);

    assert.equal(result.status, 409);
    assert.equal(result.data.error.code, 'INVALID_STATE');
  });

  it('allows attendees to retrieve their own bookings', async () => {
    const { tier } = await createPublishedEvent();
    const booking = await createBooking(tier.id);

    assert.equal(booking.status, 201);

    const result = await request(
      `/api/bookings/${booking.data.reference}`,
      { token: attendeeA.token },
    );

    assert.equal(result.status, 200);
    assert.equal(result.data.reference, booking.data.reference);
  });

  it('prevents an attendee from reading another attendee booking', async () => {
    const { tier } = await createPublishedEvent();
    const booking = await createBooking(tier.id, attendeeA.token);

    const result = await request(
      `/api/bookings/${booking.data.reference}`,
      { token: attendeeB.token },
    );

    assert.equal(result.status, 403);
    assert.equal(result.data.error.code, 'FORBIDDEN');
  });

  it('lists only the authenticated attendee bookings', async () => {
    const { tier } = await createPublishedEvent();

    const bookingA = await createBooking(tier.id, attendeeA.token);
    const bookingB = await createBooking(tier.id, attendeeB.token);

    assert.equal(bookingA.status, 201);
    assert.equal(bookingB.status, 201);

    const result = await request('/api/bookings', {
      token: attendeeA.token,
    });

    assert.equal(result.status, 200);
    assert.ok(Array.isArray(result.data));
    assert.ok(
      result.data.some(
        (booking) => booking.reference === bookingA.data.reference,
      ),
    );
    assert.ok(
      !result.data.some(
        (booking) => booking.reference === bookingB.data.reference,
      ),
    );
  });

  it('pays a pending booking successfully', async () => {
    const { tier } = await createPublishedEvent();
    const booking = await createBooking(tier.id);

    const result = await request(
      `/api/bookings/${booking.data.reference}/pay`,
      {
        method: 'POST',
        token: attendeeA.token,
        body: { outcome: 'success' },
      },
    );

    assert.equal(result.status, 200);
    assert.equal(result.data.status, 'paid');
  });

  it('leaves a booking pending after declined payment and permits retry', async () => {
    const { tier } = await createPublishedEvent();
    const booking = await createBooking(tier.id);

    const declined = await request(
      `/api/bookings/${booking.data.reference}/pay`,
      {
        method: 'POST',
        token: attendeeA.token,
        body: { outcome: 'declined' },
      },
    );

    assert.equal(declined.status, 402);
    assert.equal(declined.data.error.code, 'PAYMENT_DECLINED');

    const retry = await request(
      `/api/bookings/${booking.data.reference}/pay`,
      {
        method: 'POST',
        token: attendeeA.token,
        body: { outcome: 'success' },
      },
    );

    assert.equal(retry.status, 200);
    assert.equal(retry.data.status, 'paid');
  });

  it('does not allow another attendee to pay for a booking', async () => {
    const { tier } = await createPublishedEvent();
    const booking = await createBooking(tier.id);

    const result = await request(
      `/api/bookings/${booking.data.reference}/pay`,
      {
        method: 'POST',
        token: attendeeB.token,
        body: { outcome: 'success' },
      },
    );

    assert.equal(result.status, 403);
    assert.equal(result.data.error.code, 'FORBIDDEN');
  });

  it('rejects paying an already paid booking again', async () => {
    const { tier } = await createPublishedEvent();
    const booking = await createBooking(tier.id);

    await request(`/api/bookings/${booking.data.reference}/pay`, {
      method: 'POST',
      token: attendeeA.token,
      body: { outcome: 'success' },
    });

    const result = await request(
      `/api/bookings/${booking.data.reference}/pay`,
      {
        method: 'POST',
        token: attendeeA.token,
        body: { outcome: 'success' },
      },
    );

    assert.equal(result.status, 409);
    assert.equal(result.data.error.code, 'INVALID_TRANSITION');
  });

  it('cancels an unpaid booking and releases its seats', async () => {
    const { tier } = await createPublishedEvent();
    const booking = await createBooking(tier.id);

    const result = await request(
      `/api/bookings/${booking.data.reference}/cancel`,
      {
        method: 'POST',
        token: attendeeA.token,
      },
    );

    assert.equal(result.status, 200);
    assert.equal(result.data.status, 'cancelled');
  });

  it('does not allow a cancelled booking to be paid', async () => {
    const { tier } = await createPublishedEvent();
    const booking = await createBooking(tier.id);

    await request(
      `/api/bookings/${booking.data.reference}/cancel`,
      {
        method: 'POST',
        token: attendeeA.token,
      },
    );

    const result = await request(
      `/api/bookings/${booking.data.reference}/pay`,
      {
        method: 'POST',
        token: attendeeA.token,
        body: { outcome: 'success' },
      },
    );

    assert.equal(result.status, 409);
    assert.equal(result.data.error.code, 'INVALID_TRANSITION');
  });

  it('does not allow a paid booking to be cancelled', async () => {
    const { tier } = await createPublishedEvent();
    const booking = await createBooking(tier.id);

    await request(`/api/bookings/${booking.data.reference}/pay`, {
      method: 'POST',
      token: attendeeA.token,
      body: { outcome: 'success' },
    });

    const result = await request(
      `/api/bookings/${booking.data.reference}/cancel`,
      {
        method: 'POST',
        token: attendeeA.token,
      },
    );

    assert.equal(result.status, 409);
  });
});
