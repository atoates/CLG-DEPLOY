const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, 'data');
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'clg.sqlite');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Ensure required tables exist
db.exec(`
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL UNIQUE,
  applied_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'info',
  deadline TEXT NOT NULL,
  tags TEXT DEFAULT '[]'
);
`);

const migrationsDir = path.resolve(__dirname, 'migrations');
if (!fs.existsSync(migrationsDir)) {
  console.log('No migrations directory found — creating', migrationsDir);
  fs.mkdirSync(migrationsDir, { recursive: true });
  console.log('Created empty migrations/ — add numbered .sql files and re-run this script.');
  process.exit(0);
}

const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
if (!files.length) {
  console.log('No .sql migrations found in', migrationsDir);
  process.exit(0);
}

const applied = new Set(db.prepare('SELECT filename FROM schema_migrations').all().map(r => r.filename));

for (const file of files) {
  if (applied.has(file)) {
    console.log('Skipping already applied:', file);
    continue;
  }
  const full = path.join(migrationsDir, file);
  const sql = fs.readFileSync(full, 'utf8');
  console.log('Applying migration:', file);
  try {
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)').run(file);
    })();
    console.log('Applied', file);
  } catch (e) {
    console.error('Failed to apply', file, e && e.stack ? e.stack : e);
    process.exit(1);
  }
}

console.log('All migrations applied');
db.close();
