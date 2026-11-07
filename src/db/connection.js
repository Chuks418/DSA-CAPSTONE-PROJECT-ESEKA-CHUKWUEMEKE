
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

const databasePath = join(currentDirectory, '../../data/ticketing.db');

export function createDatabase() {
  // Ensure the database directory exists.
  mkdirSync(dirname(databasePath), { recursive: true });

  const db = new DatabaseSync(databasePath);

  // Enforce foreign key relationships.
  db.exec('PRAGMA foreign_keys = ON');

  // Read and execute the database schema.
  const schema = readFileSync(
    join(currentDirectory, 'schema.sql'),
    'utf8',
  );

  db.exec(schema);

  return db;
}
