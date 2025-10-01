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

// Update all alerts, forcing new tag format
const updateTags = db.prepare(`
  UPDATE alerts 
  SET tags = CASE 
    WHEN severity = 'critical' THEN '["hack","exploit"]'
    WHEN severity = 'warning' THEN '["community","migration"]'
    WHEN severity = 'info' THEN '["community","news"]'
    ELSE '[]'
  END;
`);

console.log('Updating tags for existing alerts...');
const result = updateTags.run();
console.log(`Updated ${result.changes} alerts`);

db.close();