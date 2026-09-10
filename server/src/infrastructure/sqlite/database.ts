import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './migrations';

/** Opens (and migrates) the SQLite database. Pass ':memory:' for an isolated test database. */
export function openDatabase(file: string): DatabaseSync {
  const inMemory = file === ':memory:';
  if (!inMemory) mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (!inMemory) {
    // WAL lets the API read while the evaluation worker writes.
    db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  }
  migrate(db);
  return db;
}
