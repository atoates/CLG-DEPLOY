// restore-alerts.js
const fs = require('fs');
const { Pool } = require('pg');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function restoreAlerts() {
  try {
    // Ensure alerts table exists
    await pool.query(`
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
      );
    `);

    // Ensure new columns exist (for existing tables)
    try {
      const colsResult = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'alerts'
      `);
      const cols = colsResult.rows.map(c => c.column_name);
      const addStmts = [];
      if (!cols.includes('further_info')) addStmts.push("ALTER TABLE alerts ADD COLUMN further_info TEXT");
      if (!cols.includes('source_type')) addStmts.push("ALTER TABLE alerts ADD COLUMN source_type TEXT");
      if (!cols.includes('source_url')) addStmts.push("ALTER TABLE alerts ADD COLUMN source_url TEXT");
      if (addStmts.length) {
        console.log('Adding missing alert columns:', addStmts);
        for (const stmt of addStmts) {
          await pool.query(stmt);
        }
        console.log('Alert columns updated');
      }
    } catch (e) {
      console.warn('Column check failed', e && e.message ? e.message : e);
    }

    // Read alerts from JSON
    console.log('Reading alerts from alerts.json...');
    const alerts = JSON.parse(fs.readFileSync('alerts.json', 'utf8'));
    console.log(`Found ${alerts.length} alerts in JSON file`);

    // Check if database already has alerts (to avoid wiping user uploads)
    const existingResult = await pool.query('SELECT COUNT(*) as count FROM alerts');
    const existingCount = parseInt(existingResult.rows[0].count);
    console.log(`Found ${existingCount} existing alerts in database`);

    if (existingCount > 0) {
      console.log('Database already contains alerts. Skipping restore to preserve user data.');
      console.log('To force restore, manually clear the database first.');
      await pool.end();
      process.exit(0);
    }

    // Clear existing alerts first (only if database was empty)
    console.log('Database is empty. Clearing existing alerts...');
    await pool.query('DELETE FROM alerts');

    // Helper: normalize provided source type labels to enum values
    function normalizeSourceType(val) {
      if (!val) return '';
      const s = String(val).trim().toLowerCase();
      if (s === 'trusted source') return 'trusted-source';
      if (s === 'social media') return 'social-media';
      if (s === 'dev. team' || s === 'dev team' || s === 'developer' || s === 'dev-team') return 'dev-team';
      if (s === 'mainstream media' || s === 'main stream media' || s === 'main-stream media') return 'mainstream-media';
      if (s === 'anonymous') return 'anonymous';
      return '';
    }

    function safeUrl(u) {
      if (!u) return '';
      try {
        const url = new URL(String(u));
        if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
      } catch (_e) { }
      return '';
    }

    // Insert all alerts in a transaction
    console.log('Restoring alerts from alerts.json...');
    await pool.query('BEGIN');
    
    for (let index = 0; index < alerts.length; index++) {
      const alert = alerts[index];
      const id = `restored_${index}_${Date.now()}`;
      const further_info = alert.further_info || alert['more info'] || '';
      const source_url = alert.source_url || alert.Link || '';
      const source_type = normalizeSourceType(alert.source_type || alert.Source || '');
      const tags = Array.isArray(alert.tags) ? alert.tags : [];
      
      await pool.query(`
        INSERT INTO alerts (id, token, title, description, severity, deadline, tags, further_info, source_type, source_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          token = excluded.token,
          title = excluded.title,
          description = excluded.description,
          severity = excluded.severity,
          deadline = excluded.deadline,
          tags = excluded.tags,
          further_info = excluded.further_info,
          source_type = excluded.source_type,
          source_url = excluded.source_url
      `, [
        id,
        alert.token,
        alert.title,
        alert.description || '',
        alert.severity || 'info',
        alert.deadline,
        JSON.stringify(tags),
        further_info,
        source_type,
        safeUrl(source_url)
      ]);
    }
    
    await pool.query('COMMIT');
    console.log(`Restored ${alerts.length} alerts`);

    await pool.end();
    console.log('Restore complete');
  } catch (error) {
    console.error('Restore error:', error);
    try {
      await pool.query('ROLLBACK');
    } catch (e) { }
    await pool.end();
    process.exit(1);
  }
}

restoreAlerts();