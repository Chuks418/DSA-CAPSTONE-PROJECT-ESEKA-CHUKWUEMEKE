
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'attendee'
    CHECK (role IN ('attendee', 'organizer', 'staff')),
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  organizer_id TEXT NOT NULL,
  title TEXT NOT NULL,
  city TEXT NOT NULL,
  venue TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  FOREIGN KEY (organizer_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS ticket_tiers (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL
    CHECK (price_cents >= 0),
  capacity INTEGER NOT NULL
    CHECK (capacity > 0),
  sold INTEGER NOT NULL DEFAULT 0
    CHECK (sold >= 0 AND sold <= capacity),
  FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tier_id TEXT NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  quantity INTEGER NOT NULL
    CHECK (quantity BETWEEN 1 AND 10),
  amount_cents INTEGER NOT NULL
    CHECK (amount_cents >= 0),
  status TEXT NOT NULL
    CHECK (
      status IN (
        'pending',
        'paid',
        'cancelled',
        'refunded',
        'checked_in'
      )
    ),
  charge_id TEXT,
  created_at TEXT NOT NULL,
  refund_cents INTEGER NOT NULL DEFAULT 0,
  refunded_at TEXT,
  checked_in_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (tier_id) REFERENCES ticket_tiers(id)
);

-- Build 8: refund and check-in tracking
-- Existing databases receive these columns through connection.js migration.

-- Build 8: waitlist entries
CREATE TABLE IF NOT EXISTS waitlist_entries (
  id TEXT PRIMARY KEY,
  tier_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'offered', 'accepted', 'expired', 'cancelled')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (tier_id) REFERENCES ticket_tiers(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS waitlist_queue_idx
ON waitlist_entries(tier_id, status, created_at);

-- One active waitlist entry per attendee per tier.
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_active_unique
ON waitlist_entries(tier_id, user_id)
WHERE status IN ('waiting', 'offered');

-- Build 8: timed seat offers
CREATE TABLE IF NOT EXISTS waitlist_offers (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  tier_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  status TEXT NOT NULL DEFAULT 'offered'
    CHECK (status IN ('offered', 'accepted', 'expired')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (entry_id) REFERENCES waitlist_entries(id),
  FOREIGN KEY (tier_id) REFERENCES ticket_tiers(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS waitlist_offers_expiry_idx
ON waitlist_offers(status, expires_at);