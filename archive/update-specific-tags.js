// Script to update specific alerts with new community-vote and token-unlocks tags
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL && DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

// Check if database exists and has alerts
async function main() {
  try {
    const result = await pool.query('SELECT COUNT(*) as count FROM alerts');
    const countBefore = parseInt(result.rows[0].count);
    console.log(`Found ${countBefore} alerts in database`);
    
    if (countBefore === 0) {
      console.log('No alerts in database. Skipping tag updates.');
      await pool.end();
      process.exit(0);
    }
  } catch (e) {
    console.log('Database not ready or no alerts table. Skipping tag updates.');
    await pool.end();
    process.exit(0);
  }

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

  for (const update of alertUpdates) {
    try {
      const result = await pool.query(
        'UPDATE alerts SET tags = $1 WHERE token = $2 AND title = $3',
        [update.tags, update.token, update.title]
      );
      
      if (result.rowCount > 0) {
        // Silently count updates to avoid log flooding
        updatedCount++;
      } else {
        notFoundCount++;
      }
    } catch (e) {
      console.error(`Error updating ${update.token} - ${update.title}:`, e.message);
    }
  }

  console.log(`Tag updates: ${updatedCount} successful, ${notFoundCount} not found (${alertUpdates.length} total)`);

  await pool.end();
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});