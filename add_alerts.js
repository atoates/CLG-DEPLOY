const fs = require('fs');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
const alerts = JSON.parse(fs.readFileSync('/tmp/new_alerts.json', 'utf8'));

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL && DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function addAlerts() {
  let added = 0;
  let skipped = 0;
  
  for (const alert of alerts) {
    try {
      const id = `news_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const tags = JSON.stringify(alert.tags);
      
      await pool.query(`
        INSERT INTO alerts (id, token, title, description, severity, deadline, tags, further_info, source_type, source_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        id,
        alert.token,
        alert.title,
        alert.description,
        alert.severity,
        alert.deadline,
        tags,
        alert.further_info || '',
        alert.source_type || '',
        alert.source_url || ''
      ]);
      
      console.log(`✅ Added: ${alert.token} - ${alert.title}`);
      added++;
      
      // Small delay to ensure unique IDs
      await new Promise(resolve => setTimeout(resolve, 10));
    } catch (err) {
      console.error(`❌ Error adding ${alert.token} - ${alert.title}:`);
      console.error(err);
      skipped++;
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Added: ${added} alerts`);
  console.log(`   Skipped: ${skipped} alerts`);
  console.log(`   Total: ${alerts.length} alerts processed`);
  
  await pool.end();
}

addAlerts().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
