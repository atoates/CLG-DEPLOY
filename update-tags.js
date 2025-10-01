// Script to update tags for existing alerts
const Database = require('better-sqlite3');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, 'data');
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'clg.sqlite');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Get the count of alerts before update
const countBefore = db.prepare('SELECT COUNT(*) as count FROM alerts').get().count;
console.log(`Found ${countBefore} alerts total`);

// First ensure the alerts table exists
db.exec(`
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

// Initialize any NULL tags to empty array
db.exec(`UPDATE alerts SET tags = '[]' WHERE tags IS NULL;`);

// Update all alerts, forcing new tag format based on severity
const updateTags = db.prepare(`
  UPDATE alerts 
  SET tags = CASE 
    WHEN severity = 'critical' THEN '["hack","exploit"]'
    WHEN severity = 'warning' THEN '["community","migration"]'
    WHEN severity = 'info' THEN '["community","news"]'
    ELSE '[]'
  END
  WHERE tags = '[]';
`);

console.log('Updating tags for existing alerts...');
const result = updateTags.run();
console.log(`Updated ${result.changes} alerts`);

db.close();