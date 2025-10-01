const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, 'data');
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'clg.sqlite');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');

fs.mkdirSync(BACKUP_DIR, { recursive: true });

if (!fs.existsSync(DB_PATH)) {
  console.error('Database file not found at', DB_PATH);
  process.exit(1);
}

const iso = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.join(BACKUP_DIR, `app-${iso}.db`);

// Use VACUUM INTO when available (safe way to copy while preserving integrity)
try {
  const db = new Database(DB_PATH);
  try {
    db.pragma('journal_mode = WAL');
    // VACUUM INTO requires SQLite 3.27+; fallback to file copy if it fails
    try {
      db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
      console.log('Vacuumed DB into', out);
    } catch (e) {
      console.warn('VACUUM INTO failed, falling back to file copy:', e && e.message);
      db.close();
      fs.copyFileSync(DB_PATH, out);
      console.log('Copied DB to', out);
    }
  } finally {
    try { db.close(); } catch (e) {}
  }
} catch (e) {
  console.error('Backup failed', e && e.stack ? e.stack : e);
  process.exit(1);
}
