import {
  newId,
} from '../domain/ids.js';
import { DomainError } from '../domain/errors.js';
import { searchEvents, summarizeEvent } from '../domain/eventSearch.js';

export function createEventService(repository) {
  if (!repository) {
    throw new TypeError('An event repository is required');
  }

  return {
    async createEvent({ title, city, venue = '', startsAt, organizerId }) {
      if (typeof title !== 'string' || !title.trim()) {
        throw new DomainError('VALIDATION', 'Event title is required');
      }

      if (typeof city !== 'string' || !city.trim()) {
        throw new DomainError('VALIDATION', 'Event city is required');
      }

      if (typeof venue !== 'string') {
        throw new DomainError('VALIDATION', 'Event venue must be text');
      }

      if (typeof organizerId !== 'string' || !organizerId.trim()) {
        throw new DomainError('VALIDATION', 'Organizer ID is required');
      }

      if (typeof startsAt !== 'string' || !startsAt.trim() || Number.isNaN(Date.parse(startsAt))) {
        throw new DomainError('VALIDATION', 'Event date must be valid');
      }

      const event = {
        id: newId(),
        organizerId: organizerId.trim(),
        title: title.trim(),
        city: city.trim(),
        venue: venue.trim(),
        startsAt: new Date(startsAt).toISOString(),
        status: 'draft',
      };

      await repository.saveEvent(event);
      return event;
    },

    async addTier(eventId, { name, priceCents, capacity }) {
      const event = await repository.findEventById(eventId);

      if (!event) {
        throw new DomainError('NOT_FOUND', 'Event not found');
      }

      if (typeof name !== 'string' || !name.trim()) {
        throw new DomainError('VALIDATION', 'Tier name is required');
      }

      if (!Number.isInteger(priceCents) || priceCents < 0) {
        throw new DomainError('VALIDATION', 'Price must be a whole number of cents');
      }

      if (!Number.isInteger(capacity) || capacity < 1) {
        throw new DomainError('VALIDATION', 'Capacity must be a whole number greater than zero');
      }

      const tier = {
        id: newId(),
        eventId,
        name: name.trim(),
        priceCents,
        capacity,
        sold: 0,
      };

      await repository.saveTier(tier);
      return tier;
    },

    async publishEvent(eventId) {
      const event = await repository.findEventById(eventId);

      if (!event) {
        throw new DomainError('NOT_FOUND', 'Event not found');
      }

      const tiers = await repository.listTiersByEventId(eventId);

      if (tiers.length === 0) {
        throw new DomainError('INVALID_STATE', 'An event needs at least one ticket tier before publishing');
      }

      event.status = 'published';
      await repository.saveEvent(event);
      return event;
    },

    async unpublishEvent(eventId) {
      const event = await repository.findEventById(eventId);

      if (!event) {
        throw new DomainError('NOT_FOUND', 'Event not found');
      }

      event.status = 'draft';
      await repository.saveEvent(event);
      return event;
    },

    async listEvents(criteria = {}, sortBy = 'date') {
      const events = await repository.listEvents();
      const publishedEvents = events.filter((event) => event.status === 'published');

      const summaries = await Promise.all(
        publishedEvents.map(async (event) => {
          const tiers = await repository.listTiersByEventId(event.id);
          return summarizeEvent(event, tiers);
        }),
      );

      return searchEvents(summaries, criteria, sortBy);
    },
  };
}