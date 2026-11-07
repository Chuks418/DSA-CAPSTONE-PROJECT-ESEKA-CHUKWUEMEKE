
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
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (tier_id) REFERENCES ticket_tiers(id)
);
