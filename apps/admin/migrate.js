const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function runMigrations() {
  try {
    // Ensure required tables exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
      );
    `);

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

    const migrationsDir = path.resolve(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('No migrations directory found — creating', migrationsDir);
      fs.mkdirSync(migrationsDir, { recursive: true });
      console.log('Created empty migrations/ — add numbered .sql files and re-run this script.');
      await pool.end();
      process.exit(0);
    }

    console.log('Scanning migrations directory:', migrationsDir);
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    console.log('Found migration files:', files);
    if (!files.length) {
      console.log('No .sql migrations found in', migrationsDir);
      await pool.end();
      process.exit(0);
    }

    const appliedResult = await pool.query('SELECT filename FROM schema_migrations');
    const applied = new Set(appliedResult.rows.map(r => r.filename));

    for (const file of files) {
      if (applied.has(file)) {
        console.log('Skipping already applied:', file);
        continue;
      }
      const full = path.join(migrationsDir, file);
      const sql = fs.readFileSync(full, 'utf8');
      console.log('Applying migration:', file);
      try {
        // Use a transaction
        await pool.query('BEGIN');
        await pool.query(sql);
        await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await pool.query('COMMIT');
        console.log('Applied', file);
      } catch (e) {
        await pool.query('ROLLBACK');
        console.error('Failed to apply', file, e && e.stack ? e.stack : e);
        await pool.end();
        process.exit(1);
      }
    }

    console.log('All migrations applied');
    
    // Ensure alerts table has new metadata columns even on older DBs
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
    
    await pool.end();
    console.log('Migration complete');
  } catch (error) {
    console.error('Migration error:', error);
    await pool.end();
    process.exit(1);
  }
}

runMigrations();
