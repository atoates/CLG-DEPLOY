const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const DATABASE_URL = process.env.DATABASE_URL;
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, 'data');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });

const iso = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.join(BACKUP_DIR, `app-${iso}.sql`);

async function backup() {
  try {
    console.log('Creating PostgreSQL backup...');
    
    // Use pg_dump to create backup
    const command = `pg_dump "${DATABASE_URL}" > "${out}"`;
    
    await execAsync(command);
    
    const stats = fs.statSync(out);
    console.log(`Backup created: ${out} (${(stats.size / 1024).toFixed(2)} KB)`);
  } catch (e) {
    console.error('Backup failed:', e.message);
    console.log('\nNote: PostgreSQL backups on Railway are managed automatically.');
    console.log('For manual backups, ensure pg_dump is installed locally.');
    process.exit(1);
  }
}

backup();
