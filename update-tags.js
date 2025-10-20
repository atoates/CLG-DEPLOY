// Script to update tags for existing alerts
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

async function updateTags() {
  try {
    // Get the count of alerts before update
    const countResult = await pool.query('SELECT COUNT(*) as count FROM alerts');
    const countBefore = parseInt(countResult.rows[0].count);
    console.log(`Found ${countBefore} alerts total`);

    // First ensure the alerts table exists
    await pool.query(`
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
    await pool.query(`UPDATE alerts SET tags = '[]' WHERE tags IS NULL;`);

    // First check all alerts in the database
    const alertsResult = await pool.query('SELECT * FROM alerts');
    console.log('Found alerts:', alertsResult.rows);

    // Update all alerts, forcing new tag format based on severity
    // PostgreSQL doesn't have json_valid, but we can check for empty/null
    console.log('Updating tags for existing alerts...');
    const result = await pool.query(`
      UPDATE alerts 
      SET tags = CASE 
        WHEN severity = 'critical' THEN '["hack","exploit"]'
        WHEN severity = 'warning' THEN '["community","migration"]'
        WHEN severity = 'info' THEN '["community","news"]'
        ELSE '[]'
      END
      WHERE tags = '[]' OR tags IS NULL OR tags = '';
    `);
    
    console.log(`Updated ${result.rowCount} alerts`);

    await pool.end();
    console.log('Tag update complete');
  } catch (error) {
    console.error('Tag update error:', error);
    await pool.end();
    process.exit(1);
  }
}

updateTags();