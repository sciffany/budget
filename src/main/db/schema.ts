import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialised — call initDb() first')
  return db
}

export function initDb(): void {
  const dbPath = join(app.getPath('userData'), 'budget.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL
    );
  `)

  const row = db.prepare('SELECT version FROM schema_version').get() as
    | { version: number }
    | undefined
  const currentVersion = row?.version ?? 0

  if (currentVersion < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL,
        institution TEXT    NOT NULL DEFAULT '',
        type        TEXT    NOT NULL CHECK (type IN ('checking','savings','credit','ewallet')),
        currency    TEXT    NOT NULL DEFAULT 'SGD'
      );

      CREATE TABLE IF NOT EXISTS headings (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT    NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS categories (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        heading_id    INTEGER NOT NULL REFERENCES headings(id) ON DELETE RESTRICT,
        name          TEXT    NOT NULL,
        type          TEXT    NOT NULL CHECK (type IN ('expense','income','transfer')),
        display_order INTEGER NOT NULL DEFAULT 0,
        protected     INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS imports (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        filename          TEXT    NOT NULL,
        bank_type         TEXT    NOT NULL,
        format            TEXT    NOT NULL CHECK (format IN ('pdf','csv')),
        imported_at       TEXT    NOT NULL,
        transaction_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
        date        TEXT    NOT NULL,
        payee       TEXT    NOT NULL,
        amount      REAL    NOT NULL,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
        import_id   INTEGER REFERENCES imports(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS rules (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        keyword     TEXT    NOT NULL,
        amount_min  REAL,
        amount_max  REAL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      -- Seed: default heading + category
      INSERT INTO headings (name, display_order) VALUES ('Uncategorised', 0);
      INSERT INTO categories (heading_id, name, type, display_order, protected)
        VALUES (1, 'Default', 'expense', 0, 1);

      INSERT INTO settings (key, value) VALUES ('rule_priority', '[]');

      INSERT OR REPLACE INTO schema_version (version) VALUES (1);
    `)
  }
}
