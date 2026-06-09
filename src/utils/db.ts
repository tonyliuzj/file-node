import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { isProtectedSecret, protectSecret } from '@/lib/credentials';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.prepare(`
  CREATE TABLE IF NOT EXISTS backends (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT    NOT NULL,
    url            TEXT    NOT NULL,
    authEnabled    INTEGER NOT NULL DEFAULT 0,
    username       TEXT,
    password       TEXT,
    rescanInterval INTEGER,
    scannedAt      TEXT
  );
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS files (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    backendId   INTEGER NOT NULL,
    path        TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    url         TEXT    NOT NULL,
    isDirectory INTEGER NOT NULL,
    size        INTEGER,
    modifiedAt  TEXT,
    scannedAt   TEXT    NOT NULL,
    UNIQUE(backendId, path),
    FOREIGN KEY (backendId) REFERENCES backends(id) ON DELETE CASCADE
  );
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT    NOT NULL UNIQUE,
    password TEXT    NOT NULL
  );
`).run();

db.prepare(
  'CREATE INDEX IF NOT EXISTS idx_files_backend_path ON files (backendId, path)'
).run();
db.prepare(
  'CREATE INDEX IF NOT EXISTS idx_files_backend_directory ON files (backendId, isDirectory, path)'
).run();
db.prepare(
  'CREATE INDEX IF NOT EXISTS idx_files_name_nocase ON files (name COLLATE NOCASE)'
).run();
db.prepare(
  'CREATE INDEX IF NOT EXISTS idx_backends_rescan ON backends (rescanInterval, scannedAt)'
).run();

const migrateUsers = db.transaction(() => {
  const users = db.prepare('SELECT id, password FROM users').all() as {
    id: number;
    password: string;
  }[];

  for (const user of users) {
    if (!user.password.startsWith('$2')) {
      db.prepare('UPDATE users SET password = ? WHERE id = ?').run(
        bcrypt.hashSync(user.password, 12),
        user.id
      );
    }
  }
});

const migrateBackendSecrets = db.transaction(() => {
  const backends = db.prepare('SELECT id, password FROM backends').all() as {
    id: number;
    password: string | null;
  }[];

  for (const backend of backends) {
    if (backend.password && !isProtectedSecret(backend.password)) {
      db.prepare('UPDATE backends SET password = ? WHERE id = ?').run(
        protectSecret(backend.password),
        backend.id
      );
    }
  }
});

migrateUsers();
migrateBackendSecrets();

export default db;
