import { Router } from './router.js';
import { DomainError } from '../domain/errors.js';

function requireUserId(request) {
  const userId = request.headers['x-user-id'];

  if (typeof userId !== 'string' || !userId.trim()) {
    throw new DomainError('VALIDATION', 'The x-user-id header is required');
  }

  return userId.trim();
}

function requireBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new DomainError('VALIDATION', 'A JSON request body is required');
  }

  return body;
}

export function createApiRouter(eventService, bookingService) {
  const router = new Router();

  router.post('/api/events', async ({ request, body }) => {
    const userId = requireUserId(request);
    const event = await eventService.createEvent({
      ...requireBody(body),
      organizerId: userId,
    });

    return { status: 201, body: event };
  });

  router.post('/api/events/:id/tiers', async ({ request, params, body }) => {
    requireUserId(request);
    const tier = await eventService.addTier(params.id, requireBody(body));

    return { status: 201, body: tier };
  });

  router.post('/api/events/:id/publish', async ({ request, params }) => {
    requireUserId(request);
    const event = await eventService.publishEvent(params.id);

    return { status: 200, body: event };
  });

  router.post('/api/events/:id/unpublish', async ({ request, params }) => {
    requireUserId(request);
    const event = await eventService.unpublishEvent(params.id);

    return { status: 200, body: event };
  });

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
        throw new DomainError('VALIDATION', 'maxPriceCents must be a whole number of cents');
      }
      criteria.maxPriceCents = Number(maxPrice);
    }

    const availability = params.get('onlyAvailable');
    if (availability !== null) {
      if (!['true', 'false'].includes(availability.toLowerCase())) {
        throw new DomainError('VALIDATION', 'onlyAvailable must be true or false');
      }
      criteria.onlyAvailable = availability.toLowerCase() === 'true';
    }

    const sortBy = params.get('sortBy') ?? 'date';
    const events = await eventService.listEvents(criteria, sortBy);

    return { status: 200, body: events };
  });

  router.post('/api/bookings', async ({ request, body }) => {
    const userId = requireUserId(request);
    const booking = await bookingService.createBooking({
      ...requireBody(body),
      userId,
    });

    return { status: 201, body: booking };
  });

  router.post('/api/bookings/:reference/pay', async ({ request, params, body }) => {
    const userId = requireUserId(request);
    const paymentBody = body === undefined ? {} : requireBody(body);
    const outcome = paymentBody.outcome ?? 'success';

    const booking = await bookingService.payBooking(
      params.reference,
      userId,
      outcome,
    );

    return { status: 200, body: booking };
  });

  router.post('/api/bookings/:reference/cancel', async ({ request, params }) => {
    const userId = requireUserId(request);
    const booking = await bookingService.cancelBooking(params.reference, userId);

    return { status: 200, body: booking };
  });

  return router;
}