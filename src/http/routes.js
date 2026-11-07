
import { Router } from './router.js';
import { DomainError } from '../domain/errors.js';
import { requireUser, requireRole } from './guards.js';

function requireBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new DomainError('VALIDATION', 'A JSON request body is required');
  }

  return body;
}

export function createApiRouter(
  eventService,
  bookingService,
  authService,
  repository
) {
  const router = new Router();

  // Authentication
  router.post('/api/auth/signup', async ({ body }) => {
    const result = await authService.signup(requireBody(body));

    return { status: 201, body: result };
  });

  router.post('/api/auth/login', async ({ body }) => {
    const result = await authService.login(requireBody(body));

    return { status: 200, body: result };
  });

  router.get('/api/auth/me', async ({ request }) => {
    const user = await requireUser(request, repository);
    const currentUser = await authService.getMe(user.id);

    return { status: 200, body: currentUser };
  });

  // Organizer event management
  router.post('/api/events', async ({ request, body }) => {
    const user = await requireUser(request, repository);
    requireRole(user, 'organizer');

    const event = await eventService.createEvent({
      ...requireBody(body),
      organizerId: user.id,
    });

    return { status: 201, body: event };
  });

  router.post('/api/events/:id/tiers', async ({ request, params, body }) => {
    const user = await requireUser(request, repository);
    requireRole(user, 'organizer');

    const tier = await eventService.addTier(
      params.id,
      requireBody(body),
      user.id
    );

    return { status: 201, body: tier };
  });

  router.post('/api/events/:id/publish', async ({ request, params }) => {
    const user = await requireUser(request, repository);
    requireRole(user, 'organizer');

    const event = await eventService.publishEvent(params.id, user.id);

    return { status: 200, body: event };
  });

  router.post('/api/events/:id/unpublish', async ({ request, params }) => {
    const user = await requireUser(request, repository);
    requireRole(user, 'organizer');

    const event = await eventService.unpublishEvent(params.id, user.id);

    return { status: 200, body: event };
  });

  router.get('/api/organizer/events', async ({ request }) => {
    const user = await requireUser(request, repository);
    requireRole(user, 'organizer');

    const events = await eventService.listOrganizerEvents(user.id);

    return { status: 200, body: events };
  });

  // Public event browsing
  router.get('/api/events', async ({ request }) => {
    const params = new URL(request.url, 'http://localhost').searchParams;

    const criteria = {
      q: params.get('q') ?? undefined,
      city: params.get('city') ?? undefined,
      from: params.get('from') ?? undefined,
      to: params.get('to') ?? undefined,
    };

    const maxPrice = params.get('maxPriceCents');

    if (maxPrice !== null) {
      if (maxPrice.trim() === '') {
        throw new DomainError(
          'VALIDATION',
          'maxPriceCents must be a whole number of cents'
        );
      }

      criteria.maxPriceCents = Number(maxPrice);
    }

    const availability = params.get('onlyAvailable');

    if (availability !== null) {
      if (!['true', 'false'].includes(availability.toLowerCase())) {
        throw new DomainError(
          'VALIDATION',
          'onlyAvailable must be true or false'
        );
      }

      criteria.onlyAvailable = availability.toLowerCase() === 'true';
    }

    const sortBy = params.get('sortBy') ?? 'date';
    const events = await eventService.listEvents(criteria, sortBy);

    return { status: 200, body: events };
  });

  router.get('/api/events/:id', async ({ params }) => {
    const event = await eventService.getEvent(params.id);

    return { status: 200, body: event };
  });

  // Attendee bookings
  router.post('/api/bookings', async ({ request, body }) => {
    const user = await requireUser(request, repository);
    requireRole(user, 'attendee');

    const booking = await bookingService.createBooking({
      ...requireBody(body),
      userId: user.id,
    });

    return { status: 201, body: booking };
  });

  router.get('/api/bookings', async ({ request }) => {
    const user = await requireUser(request, repository);
    requireRole(user, 'attendee');

    const bookings = await bookingService.listBookings(user.id);

    return { status: 200, body: bookings };
  });

  router.get('/api/bookings/:reference', async ({ request, params }) => {
    const user = await requireUser(request, repository);
    requireRole(user, 'attendee');

    const booking = await bookingService.getBooking(
      params.reference,
      user.id
    );

    return { status: 200, body: booking };
  });

  router.post('/api/bookings/:reference/pay', async ({ request, params, body }) => {
    const user = await requireUser(request, repository);
    requireRole(user, 'attendee');

    const paymentBody = body === undefined ? {} : requireBody(body);
    const outcome = paymentBody.outcome ?? 'success';

    const booking = await bookingService.payBooking(
      params.reference,
      user.id,
      outcome
    );

    return { status: 200, body: booking };
  });

  router.post('/api/bookings/:reference/cancel', async ({ request, params }) => {
    const user = await requireUser(request, repository);
    requireRole(user, 'attendee');

    const booking = await bookingService.cancelBooking(
      params.reference,
      user.id
    );

    return { status: 200, body: booking };
  });

  return router;
}
