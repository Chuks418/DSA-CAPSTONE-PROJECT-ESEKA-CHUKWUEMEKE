
import { createDatabase } from '../src/db/connection.js';
import { createSqliteRepository } from '../src/repositories/sqlite.js';

const SEED_EVENT_ID = 'seed-event-001';
const SEED_TIER_ID = 'seed-tier-001';

async function seed() {
  const db = createDatabase();
  const repository = createSqliteRepository(db);

  try {
    const existingEvent = await repository.findEventById(
      SEED_EVENT_ID,
    );

    if (existingEvent) {
      console.log('Seed data already exists. Nothing to add.');
      return;
    }

    const event = {
      id: SEED_EVENT_ID,
      organizerId: 'seed-organizer',
      title: 'Database Seed Event',
      city: 'Benin City',
      venue: 'Edo Innovation Hub',
      startsAt: '2027-12-15T10:00:00.000Z',
      status: 'published',
    };

    const tier = {
      id: SEED_TIER_ID,
      eventId: SEED_EVENT_ID,
      name: 'Regular',
      priceCents: 500000,
      capacity: 100,
      sold: 0,
    };

    await repository.saveEvent(event);
    await repository.saveTier(tier);

    console.log('Seed data created successfully.');
    console.log('Event:', event.title);
    console.log('Ticket capacity:', tier.capacity);
  } finally {
    db.close();
  }
}

await seed();
