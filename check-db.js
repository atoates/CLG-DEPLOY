// check-db.js
const Database = require('better-sqlite3');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, 'data');
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'clg.sqlite');

const db = new Database(DB_PATH);

// Get all alerts
console.log('Current alerts in database:');
const alerts = db.prepare('SELECT * FROM alerts').all();
alerts.forEach(alert => {
  console.log('Alert:', {
    id: alert.id,
    token: alert.token,
    severity: alert.severity,
    tags: alert.tags
  });
});

db.close();