// Script to update specific alerts with new community-vote and token-unlocks tags
const Database = require('better-sqlite3');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, 'data');
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'clg.sqlite');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Check if database exists and has alerts
try {
  const countBefore = db.prepare('SELECT COUNT(*) as count FROM alerts').get().count;
  console.log(`Found ${countBefore} alerts in database`);
  
  if (countBefore === 0) {
    console.log('No alerts in database. Skipping tag updates.');
    db.close();
    process.exit(0);
  }
} catch (e) {
  console.log('Database not ready or no alerts table. Skipping tag updates.');
  db.close();
  process.exit(0);
}

// Prepare update statement
const updateAlert = db.prepare(`
  UPDATE alerts 
  SET tags = @tags 
  WHERE token = @token AND title = @title
`);

// Define the specific alerts we want to update with new tags
const alertUpdates = [
  // Token unlock alerts
  {
    token: 'ONDO',
    title: 'Ondo Token Unlock',
    tags: '["token-unlocks","price-change"]'
  },
  {
    token: 'CFX', 
    title: 'Conflux Hard Fork',
    tags: '["fork","token-unlocks"]'
  },
  
  // Community vote alerts
  {
    token: 'SOL',
    title: 'Alpenglow Upgrade Proposal', 
    tags: '["fork","community-vote"]'
  },
  {
    token: 'ADA',
    title: 'Cardano Chang Hard Fork',
    tags: '["fork","community-vote"]'
  },
  {
    token: 'BNB',
    title: 'BNB Chain Gas Fee Reduction',
    tags: '["community-vote","price-change"]'
  },
  {
    token: 'UNI', 
    title: 'Uniswap Fee Switch Proposal',
    tags: '["community-vote","price-change"]'
  },
  {
    token: 'XTZ',
    title: 'Tezos Adaptive Inflation Vote',
    tags: '["community-vote","price-change"]'
  },
  {
    token: 'MKR',
    title: 'MakerDAO Endgame Phase',
    tags: '["community-vote","news"]'
  },
  {
    token: 'CRV',
    title: 'Curve DAO Tokenomics Update',
    tags: '["community-vote","price-change"]'
  },
  {
    token: 'XRP',
    title: 'Ripple Protocol Amendment Vote',
    tags: '["community-vote","community"]'
  },
  {
    token: 'PI',
    title: 'Pi Network Protocol Upgrade to V23',
    tags: '["fork","community-vote"]'
  },
  {
    token: 'PI',
    title: 'Pi Network Blockchain Vote',
    tags: '["community-vote","community"]'
  }
];

console.log(`Attempting to update ${alertUpdates.length} alerts with new tags...`);

let updatedCount = 0;
let notFoundCount = 0;

alertUpdates.forEach(update => {
  try {
    const result = updateAlert.run({
      token: update.token,
      title: update.title,
      tags: update.tags
    });
    
    if (result.changes > 0) {
      console.log(`✅ Updated: ${update.token} - ${update.title}`);
      updatedCount++;
    } else {
      console.log(`⚠️  Not found: ${update.token} - ${update.title}`);
      notFoundCount++;
    }
  } catch (e) {
    console.error(`❌ Error updating ${update.token} - ${update.title}:`, e.message);
  }
});

console.log(`\nSummary:`);
console.log(`- Successfully updated: ${updatedCount} alerts`);
console.log(`- Not found: ${notFoundCount} alerts`);
console.log(`- Total attempted: ${alertUpdates.length} alerts`);

// Verify the updates
if (updatedCount > 0) {
  console.log('\nVerifying updates...');
  alertUpdates.forEach(update => {
    try {
      const alert = db.prepare('SELECT token, title, tags FROM alerts WHERE token = ? AND title = ?')
        .get(update.token, update.title);
      
      if (alert) {
        console.log(`${alert.token} - ${alert.title}: ${alert.tags}`);
      }
    } catch (e) {
      console.error(`Error verifying ${update.token}:`, e.message);
    }
  });
}

db.close();
console.log('\nTag update script completed.');