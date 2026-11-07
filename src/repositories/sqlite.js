
function mapEvent(row) {
  if (!row) return null;

  return {
    id: row.id,
    organizerId: row.organizer_id,
    title: row.title,
    city: row.city,
    venue: row.venue,
    startsAt: row.starts_at,
    status: row.status,
  };
}

function mapTier(row) {
  if (!row) return null;

  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    priceCents: row.price_cents,
    capacity: row.capacity,
    sold: row.sold,
  };
}

function mapBooking(row) {
  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    tierId: row.tier_id,
    reference: row.reference,
    quantity: row.quantity,
    amountCents: row.amount_cents,
    status: row.status,
    chargeId: row.charge_id,
    createdAt: row.created_at,
  };
}

function mapUser(row) {
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at,
  };
}

export function createSqliteRepository(db) {
  const statements = {
    saveEvent: db.prepare(`
      INSERT INTO events (
        id, organizer_id, title, city, venue, starts_at, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        organizer_id = excluded.organizer_id,
        title = excluded.title,
        city = excluded.city,
        venue = excluded.venue,
        starts_at = excluded.starts_at,
        status = excluded.status
    `),

    findEventById: db.prepare(
      'SELECT * FROM events WHERE id = ?'
    ),

    listEvents: db.prepare(
      'SELECT * FROM events'
    ),

    listEventsByOrganizerId: db.prepare(
      'SELECT * FROM events WHERE organizer_id = ?'
    ),

    saveTier: db.prepare(`
      INSERT INTO ticket_tiers (
        id, event_id, name, price_cents, capacity, sold
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        event_id = excluded.event_id,
        name = excluded.name,
        price_cents = excluded.price_cents,
        capacity = excluded.capacity,
        sold = excluded.sold
    `),

    findTierById: db.prepare(
      'SELECT * FROM ticket_tiers WHERE id = ?'
    ),

    listTiersByEventId: db.prepare(
      'SELECT * FROM ticket_tiers WHERE event_id = ?'
    ),

    reserveTierSeats: db.prepare(`
      UPDATE ticket_tiers
      SET sold = sold + ?
      WHERE id = ?
      AND sold + ? <= capacity
    `),

    saveBooking: db.prepare(`
      INSERT INTO bookings (
        id, user_id, tier_id, reference, quantity,
        amount_cents, status, charge_id, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        tier_id = excluded.tier_id,
        reference = excluded.reference,
        quantity = excluded.quantity,
        amount_cents = excluded.amount_cents,
        status = excluded.status,
        charge_id = excluded.charge_id,
        created_at = excluded.created_at
    `),

    findBookingByReference: db.prepare(
      'SELECT * FROM bookings WHERE reference = ?'
    ),

    findBookingById: db.prepare(
      'SELECT * FROM bookings WHERE id = ?'
    ),

    listBookings: db.prepare(
      'SELECT * FROM bookings'
    ),

    listBookingsByUserId: db.prepare(
      'SELECT * FROM bookings WHERE user_id = ? ORDER BY created_at DESC'
    ),

    saveUser: db.prepare(`
      INSERT INTO users (id)
      VALUES (?)
      ON CONFLICT(id) DO NOTHING
    `),

    createUser: db.prepare(`
      INSERT INTO users (
        id, email, password_hash, role, created_at
      )
      VALUES (?, ?, ?, ?, ?)
    `),

    findUserByEmail: db.prepare(`
      SELECT * FROM users
      WHERE email = ? COLLATE NOCASE
    `),

    findUserById: db.prepare(`
      SELECT * FROM users
      WHERE id = ?
    `),
  };

  return {
    async saveEvent(event) {
      statements.saveUser.run(event.organizerId);

      statements.saveEvent.run(
        event.id,
        event.organizerId,
        event.title,
        event.city,
        event.venue,
        event.startsAt,
        event.status,
      );

      return event;
    },

    async findEventById(eventId) {
      return mapEvent(
        statements.findEventById.get(eventId)
      );
    },

    async listEvents() {
      return statements.listEvents.all().map(mapEvent);
    },

    async listEventsByOrganizerId(organizerId) {
      return statements.listEventsByOrganizerId
        .all(organizerId)
        .map(mapEvent);
    },

    async saveTier(tier) {
      statements.saveTier.run(
        tier.id,
        tier.eventId,
        tier.name,
        tier.priceCents,
        tier.capacity,
        tier.sold,
      );

      return tier;
    },

    async findTierById(tierId) {
      return mapTier(
        statements.findTierById.get(tierId)
      );
    },

    async listTiersByEventId(eventId) {
      return statements.listTiersByEventId
        .all(eventId)
        .map(mapTier);
    },

    async reserveTierSeats(tierId, quantity) {
      const result = statements.reserveTierSeats.run(
        quantity,
        tierId,
        quantity,
      );

      if (result.changes === 0) {
        return null;
      }

      return mapTier(
        statements.findTierById.get(tierId)
      );
    },

    async saveBooking(booking) {
      statements.saveUser.run(booking.userId);

      statements.saveBooking.run(
        booking.id,
        booking.userId,
        booking.tierId,
        booking.reference,
        booking.quantity,
        booking.amountCents,
        booking.status,
        booking.chargeId ?? null,
        booking.createdAt,
      );

      return booking;
    },

    async findBookingByReference(reference) {
      return mapBooking(
        statements.findBookingByReference.get(reference)
      );
    },

    async findBookingById(bookingId) {
      return mapBooking(
        statements.findBookingById.get(bookingId)
      );
    },

    async listBookings() {
      return statements.listBookings.all().map(mapBooking);
    },

    async listBookingsByUserId(userId) {
      return statements.listBookingsByUserId
        .all(userId)
        .map(mapBooking);
    },

    async createUser(user) {
      statements.createUser.run(
        user.id,
        user.email,
        user.passwordHash,
        user.role,
        user.createdAt,
      );

      return user;
    },

    async findUserByEmail(email) {
      return mapUser(
        statements.findUserByEmail.get(email)
      );
    },

    async findUserById(userId) {
      return mapUser(
        statements.findUserById.get(userId)
      );
    },
  };
}
