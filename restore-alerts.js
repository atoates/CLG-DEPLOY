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
  tags TEXT DEFAULT '[]',
  further_info TEXT,
  source_type TEXT,
  source_url TEXT
);`);

// Ensure new columns exist (for existing tables)
try{
  const cols = db.prepare('PRAGMA table_info(alerts)').all().map(c => c.name);
  const addStmts = [];
  if (!cols.includes('further_info')) addStmts.push("ALTER TABLE alerts ADD COLUMN further_info TEXT");
  if (!cols.includes('source_type')) addStmts.push("ALTER TABLE alerts ADD COLUMN source_type TEXT");
  if (!cols.includes('source_url')) addStmts.push("ALTER TABLE alerts ADD COLUMN source_url TEXT");
  if (addStmts.length){
    console.log('Adding missing alert columns:', addStmts);
    addStmts.forEach(sql => db.exec(sql));
    console.log('Alert columns updated');
  }
}catch(e){ console.warn('Column check failed', e && e.message ? e.message : e); }

// Read alerts from JSON
console.log('Reading alerts from alerts.json...');
const alerts = JSON.parse(fs.readFileSync('alerts.json', 'utf8'));
console.log(`Found ${alerts.length} alerts in JSON file`);

// Clear existing alerts first
console.log('Clearing existing alerts...');
db.exec('DELETE FROM alerts');

// Prepare insert statement
const insert = db.prepare(`
INSERT OR REPLACE INTO alerts (id, token, title, description, severity, deadline, tags, further_info, source_type, source_url)
VALUES (@id, @token, @title, @description, @severity, @deadline, @tags, @further_info, @source_type, @source_url)
`);

// Helper: normalize provided source type labels to enum values
function normalizeSourceType(val){
  if (!val) return '';
  const s = String(val).trim().toLowerCase();
  if (s === 'trusted source') return 'trusted-source';
  if (s === 'social media') return 'social-media';
  if (s === 'dev. team' || s === 'dev team' || s === 'developer' || s === 'dev-team') return 'dev-team';
  if (s === 'mainstream media' || s === 'main stream media' || s === 'main-stream media') return 'mainstream-media';
  if (s === 'anonymous') return 'anonymous';
  return '';
}

function safeUrl(u){
  if (!u) return '';
  try{
    const url = new URL(String(u));
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  }catch(_e){}
  return '';
}

// Insert all alerts
const tx = db.transaction((alerts) => {
  alerts.forEach((alert, index) => {
    const id = `restored_${index}_${Date.now()}`;
    const further_info = alert.further_info || alert['more info'] || '';
    const source_url = alert.source_url || alert.Link || '';
    const source_type = normalizeSourceType(alert.source_type || alert.Source || '');
    const tags = Array.isArray(alert.tags) ? alert.tags : [];
    insert.run({
      id,
      token: alert.token,
      title: alert.title,
      description: alert.description || '',
      severity: alert.severity || 'info',
      deadline: alert.deadline,
      tags: JSON.stringify(tags),
      further_info,
      source_type,
      source_url: safeUrl(source_url)
    });
  });
});

console.log('Restoring alerts from alerts.json...');
tx(alerts);
console.log(`Restored ${alerts.length} alerts`);

db.close();