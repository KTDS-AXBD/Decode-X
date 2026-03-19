import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
  }
  return db;
}

export function createTestDb(): Database.Database {
  const testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');
  applyMigrations(testDb);
  return testDb;
}

function applyMigrations(database: Database.Database): void {
  const migrationPath = join(import.meta.dirname, '..', 'migrations', '0001_init.sql');
  const sql = readFileSync(migrationPath, 'utf-8');
  database.exec(sql);
}

export function resetDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
