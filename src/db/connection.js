
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

const databasePath = join(currentDirectory, '../../data/ticketing.db');

function migrateUsersTable(db) {
  const columns = db.prepare(
    'PRAGMA table_info(users)',
  ).all();

  const existingColumns = new Set(
    columns.map((column) => column.name),
  );

  if (!existingColumns.has('email')) {
    db.exec('ALTER TABLE users ADD COLUMN email TEXT');
  }

  if (!existingColumns.has('password_hash')) {
    db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
  }

  if (!existingColumns.has('role')) {
    db.exec(`
      ALTER TABLE users
      ADD COLUMN role TEXT NOT NULL DEFAULT 'attendee'
      CHECK (role IN ('attendee', 'organizer', 'staff'))
    `);
  }

  if (!existingColumns.has('created_at')) {
    db.exec('ALTER TABLE users ADD COLUMN created_at TEXT');
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
    ON users(email COLLATE NOCASE)
    WHERE email IS NOT NULL
  `);
}

export function createDatabase() {
  mkdirSync(dirname(databasePath), { recursive: true });

  const db = new DatabaseSync(databasePath);

  db.exec('PRAGMA foreign_keys = ON');

  const schema = readFileSync(
    join(currentDirectory, 'schema.sql'),
    'utf8',
  );

  db.exec(schema);

  migrateUsersTable(db);

  return db;
}
