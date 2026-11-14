
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
    refundCents: row.refund_cents ?? 0,
    refundedAt: row.refunded_at ?? null,
    checkedInAt: row.checked_in_at ?? null,
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
    amount_cents, status, charge_id, created_at,
    refund_cents, refunded_at, checked_in_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    user_id = excluded.user_id,
    tier_id = excluded.tier_id,
    reference = excluded.reference,
    quantity = excluded.quantity,
    amount_cents = excluded.amount_cents,
    status = excluded.status,
    charge_id = excluded.charge_id,
    created_at = excluded.created_at,
    refund_cents = excluded.refund_cents,
    refunded_at = excluded.refunded_at,
    checked_in_at = excluded.checked_in_at
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
        booking.refundCents ?? 0,
        booking.refundedAt ?? null,
        booking.checkedInAt ?? null,
      );

      return booking;
    },

    async cancelBookingAndReleaseSeats(
  reference,
  expectedStatus,
  nextStatus,
  refundCents = 0,
  refundedAt = null,
) {
  db.exec('BEGIN IMMEDIATE');

  try {
    const current = statements.findBookingByReference.get(reference);

    if (!current || current.status !== expectedStatus) {
      db.exec('ROLLBACK');
      return null;
    }

    const update = db.prepare(`
      UPDATE bookings
      SET status = ?,
          refund_cents = ?,
          refunded_at = ?
      WHERE reference = ?
        AND status = ?
    `);

    const result = update.run(
      nextStatus,
      refundCents,
      refundedAt,
      reference,
      expectedStatus,
    );

    if (result.changes !== 1) {
      db.exec('ROLLBACK');
      return null;
    }

    const booking = mapBooking(
      statements.findBookingByReference.get(reference)
    );

    const release = db.prepare(`
      UPDATE ticket_tiers
      SET sold = sold - ?
      WHERE id = ?
        AND sold >= ?
    `).run(
      booking.quantity,
      booking.tierId,
      booking.quantity,
    );

    if (release.changes !== 1) {
      throw new Error('Could not release booking seats.');
    }

    db.exec('COMMIT');
    return booking;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
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

    async listExpiredPendingBookings(cutoff) {
  return db.prepare(`
    SELECT *
    FROM bookings
    WHERE status = 'pending'
      AND created_at <= ?
    ORDER BY created_at ASC
  `).all(cutoff).map(mapBooking);
},

    async createWaitlistEntry(entry) {
      db.prepare(`
        INSERT INTO waitlist_entries (
          id, tier_id, user_id, quantity, status, created_at
        )
        VALUES (?, ?, ?, ?, 'waiting', ?)
      `).run(
        entry.id,
        entry.tierId,
        entry.userId,
        entry.quantity,
        entry.createdAt,
      );

      return entry;
    },

    async findActiveWaitlistEntry(tierId, userId) {
      return db.prepare(`
        SELECT *
        FROM waitlist_entries
        WHERE tier_id = ?
          AND user_id = ?
          AND status IN ('waiting', 'offered')
      `).get(tierId, userId) ?? null;
    },

    async listWaitingEntries(tierId) {
      return db.prepare(`
        SELECT *
        FROM waitlist_entries
        WHERE tier_id = ?
          AND status = 'waiting'
        ORDER BY created_at ASC, rowid ASC
      `).all(tierId);
    },

        async listTierIdsWithWaitingEntries() {
      return db.prepare(`
        SELECT DISTINCT tier_id
        FROM waitlist_entries
        WHERE status = 'waiting'
        ORDER BY tier_id ASC
      `).all().map((row) => row.tier_id);
    },

    async listWaitlistEntriesByUserId(userId) {
      return db.prepare(`
        SELECT
          w.id,
          w.tier_id,
          w.user_id,
          w.quantity,
          w.status,
          w.created_at,
          t.name AS tier_name,
          e.title AS event_title,
          e.starts_at AS event_starts_at
        FROM waitlist_entries w
        JOIN ticket_tiers t ON t.id = w.tier_id
        JOIN events e ON e.id = t.event_id
        WHERE w.user_id = ?
          AND w.status IN ('waiting', 'offered')
        ORDER BY w.created_at DESC
      `).all(userId).map((row) => ({
        id: row.id,
        tierId: row.tier_id,
        userId: row.user_id,
        quantity: row.quantity,
        status: row.status,
        createdAt: row.created_at,
        tierName: row.tier_name,
        eventTitle: row.event_title,
        eventStartsAt: row.event_starts_at,
      }));
    },

        async createNextWaitlistOffer(tierId, offerId, createdAt, expiresAt) {
      db.exec('BEGIN IMMEDIATE');

      try {
        const entry = db.prepare(`
          SELECT *
          FROM waitlist_entries
          WHERE tier_id = ? AND status = 'waiting'
          ORDER BY created_at ASC, rowid ASC
          LIMIT 1
        `).get(tierId);

        if (!entry) {
          db.exec('COMMIT');
          return null;
        }

        // Reserve the requested seats before creating the offer.
        const tierUpdate = statements.reserveTierSeats.run(
          entry.quantity,
          tierId,
          entry.quantity,
        );

        if (tierUpdate.changes !== 1) {
          db.exec('COMMIT');
          return null;
        }

        db.prepare(`
          UPDATE waitlist_entries
          SET status = 'offered'
          WHERE id = ? AND status = 'waiting'
        `).run(entry.id);

        db.prepare(`
          INSERT INTO waitlist_offers (
            id, entry_id, tier_id, user_id, quantity,
            status, created_at, expires_at
          )
          VALUES (?, ?, ?, ?, ?, 'offered', ?, ?)
        `).run(
          offerId,
          entry.id,
          entry.tier_id,
          entry.user_id,
          entry.quantity,
          createdAt,
          expiresAt,
        );

        db.exec('COMMIT');

        return {
          id: offerId,
          entryId: entry.id,
          tierId: entry.tier_id,
          userId: entry.user_id,
          quantity: entry.quantity,
          status: 'offered',
          createdAt,
          expiresAt,
        };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },

        async listExpiredWaitlistOffers(now) {
      return db.prepare(`
        SELECT id
        FROM waitlist_offers
        WHERE status = 'offered'
          AND expires_at <= ?
        ORDER BY expires_at ASC
      `).all(now);
    },

    async expireWaitlistOfferAndReleaseSeats(offerId, now) {
      db.exec('BEGIN IMMEDIATE');

      try {
        const offer = db.prepare(`
          SELECT *
          FROM waitlist_offers
          WHERE id = ?
            AND status = 'offered'
            AND expires_at <= ?
        `).get(offerId, now);

        if (!offer) {
          db.exec('COMMIT');
          return null;
        }

        const offerUpdate = db.prepare(`
          UPDATE waitlist_offers
          SET status = 'expired'
          WHERE id = ? AND status = 'offered'
        `).run(offerId);

        if (offerUpdate.changes !== 1) {
          db.exec('ROLLBACK');
          return null;
        }

        db.prepare(`
          UPDATE waitlist_entries
          SET status = 'expired'
          WHERE id = ? AND status = 'offered'
        `).run(offer.entry_id);

        const release = db.prepare(`
          UPDATE ticket_tiers
          SET sold = sold - ?
          WHERE id = ? AND sold >= ?
        `).run(offer.quantity, offer.tier_id, offer.quantity);

        if (release.changes !== 1) {
          throw new Error('Could not release expired waitlist offer seats.');
        }

        db.exec('COMMIT');
        return offer;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },

        async acceptWaitlistOffer(offerId, userId, booking, now) {
      db.exec('BEGIN IMMEDIATE');

      try {
        const offer = db.prepare(`
          SELECT *
          FROM waitlist_offers
          WHERE id = ?
            AND user_id = ?
            AND status = 'offered'
        `).get(offerId, userId);

        if (!offer) {
          db.exec('ROLLBACK');
          return { accepted: false };
        }

        if (offer.expires_at <= now) {
          db.exec('ROLLBACK');
          return { accepted: false, expired: true };
        }

        db.prepare(`
          UPDATE waitlist_offers
          SET status = 'accepted'
          WHERE id = ? AND status = 'offered'
        `).run(offerId);

        db.prepare(`
          UPDATE waitlist_entries
          SET status = 'accepted'
          WHERE id = ? AND status = 'offered'
        `).run(offer.entry_id);

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
          booking.refundCents ?? 0,
          booking.refundedAt ?? null,
          booking.checkedInAt ?? null,
        );

        db.exec('COMMIT');

        return { accepted: true, booking };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },

    async findWaitlistOfferById(offerId, userId) {
  const row = db.prepare(`
    SELECT *
    FROM waitlist_offers
    WHERE id = ?
      AND user_id = ?
      AND status = 'offered'
  `).get(offerId, userId);

  if (!row) return null;

  return {
    id: row.id,
    entryId: row.entry_id,
    tierId: row.tier_id,
    userId: row.user_id,
    quantity: row.quantity,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
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

    async listActiveWaitlistOffers(userId) {
  return db.prepare(`
    SELECT
      o.id,
      o.entry_id,
      o.tier_id,
      o.user_id,
      o.quantity,
      o.status,
      o.created_at,
      o.expires_at
    FROM waitlist_offers o
    WHERE o.user_id = ?
      AND o.status = 'offered'
    ORDER BY o.expires_at ASC
  `).all(userId).map(row => ({
    id: row.id,
    entryId: row.entry_id,
    tierId: row.tier_id,
    userId: row.user_id,
    quantity: row.quantity,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }));
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
