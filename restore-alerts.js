// restore-alerts.js
const fs = require('fs');
const Database = require('better-sqlite3');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, 'data');
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'clg.sqlite');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Ensure alerts table exists
db.exec(`
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'info',
  deadline TEXT NOT NULL,
  tags TEXT DEFAULT '[]'
);`);

// Read alerts from JSON
const alerts = JSON.parse(fs.readFileSync('alerts.json', 'utf8'));

// Prepare insert statement
const insert = db.prepare(`
INSERT OR REPLACE INTO alerts (id, token, title, description, severity, deadline, tags)
VALUES (@id, @token, @title, @description, @severity, @deadline, @tags)
`);

// Insert all alerts
const tx = db.transaction((alerts) => {
  alerts.forEach((alert, index) => {
    const id = `restored_${index}_${Date.now()}`;
    insert.run({
      id,
      token: alert.token,
      title: alert.title,
      description: alert.description || '',
      severity: alert.severity || 'info',
      deadline: alert.deadline,
      tags: JSON.stringify(alert.tags || [])
    });
  });
});

console.log('Restoring alerts from alerts.json...');
tx(alerts);
console.log(`Restored ${alerts.length} alerts`);

db.close();