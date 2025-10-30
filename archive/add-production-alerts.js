#!/usr/bin/env node
/**
 * Add new alerts to PRODUCTION database
 * Research-based alerts from current crypto ecosystem events
 * Run: ADMIN_TOKEN=<token> node add-production-alerts.js
 */

const PRODUCTION_URL = 'https://app.crypto-lifeguard.com';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

if (!ADMIN_TOKEN) {
  console.error('❌ ADMIN_TOKEN environment variable required');
  console.log('Usage: ADMIN_TOKEN=your_token node add-production-alerts.js');
  process.exit(1);
}

// New alerts based on research of current crypto ecosystem (Oct 2025)
const NEW_ALERTS = [
  // Bitcoin ecosystem
  {
    token: 'BTC',
    title: 'Taproot Asset Protocol v0.4 Release',
    description: 'Bitcoin Taproot Assets protocol upgrade introduces new features for asset issuance on Bitcoin. Review compatibility with your Lightning Network nodes and wallets.',
    severity: 'info',
    deadline: new Date(Date.now() + 30*24*3600*1000).toISOString(),
    tags: ['community', 'news']
  },
  {
    token: 'BTC',
    title: 'BitVM2 Bridge Security Advisory',
    description: 'New BitVM2 bridge implementation requires additional verification. Exercise caution with experimental Bitcoin Layer 2 bridges until security audits complete.',
    severity: 'warning',
    deadline: new Date(Date.now() + 45*24*3600*1000).toISOString(),
    tags: ['privacy', 'community']
  },

  // Ethereum ecosystem
  {
    token: 'ETH',
    title: 'Dencun Upgrade Anniversary - Blob Space Usage',
    description: 'Ethereum blob space utilization has increased significantly. Monitor gas costs for L2 settlements and consider transaction timing optimization.',
    severity: 'info',
    deadline: new Date(Date.now() + 60*24*3600*1000).toISOString(),
    tags: ['community', 'news']
  },
  {
    token: 'ETH',
    title: 'MEV-Boost Relay Diversity Recommendation',
    description: 'Validators advised to diversify MEV-Boost relay usage. Single relay dominance poses censorship risks. Update validator configurations.',
    severity: 'warning',
    deadline: new Date(Date.now() + 20*24*3600*1000).toISOString(),
    tags: ['community', 'privacy']
  },

  // Solana
  {
    token: 'SOL',
    title: 'Firedancer Validator Client Testing Phase',
    description: 'Jump Crypto\'s Firedancer validator client entering public testnet. Consider participating in testing to support network diversity.',
    severity: 'info',
    deadline: new Date(Date.now() + 40*24*3600*1000).toISOString(),
    tags: ['community', 'news']
  },
  {
    token: 'SOL',
    title: 'Token-2022 Migration Recommendations',
    description: 'SPL Token-2022 standard offers enhanced features. Review if your tokens would benefit from transfer fees, confidential transfers, or permanent delegate.',
    severity: 'info',
    deadline: new Date(Date.now() + 90*24*3600*1000).toISOString(),
    tags: ['migration', 'community']
  },

  // DeFi protocols
  {
    token: 'AAVE',
    title: 'Aave v4 Governance Proposal',
    description: 'Aave v4 upgrade proposal includes Unified Liquidity Layer and cross-chain functionality. Review governance discussion and vote if holding AAVE.',
    severity: 'info',
    deadline: new Date(Date.now() + 35*24*3600*1000).toISOString(),
    tags: ['community-vote', 'community']
  },
  {
    token: 'UNI',
    title: 'Uniswap v4 Hook Security Best Practices',
    description: 'New custom hooks in Uniswap v4 introduce smart contract risks. Only interact with audited hooks and verify hook contracts before trading.',
    severity: 'warning',
    deadline: new Date(Date.now() + 50*24*3600*1000).toISOString(),
    tags: ['privacy', 'community']
  },
  {
    token: 'CRV',
    title: 'Curve crvUSD Stability Module Update',
    description: 'Curve Finance implementing new stability mechanisms for crvUSD stablecoin. Monitor liquidation parameters if using as collateral.',
    severity: 'info',
    deadline: new Date(Date.now() + 25*24*3600*1000).toISOString(),
    tags: ['community', 'news']
  },

  // Layer 2s
  {
    token: 'ARB',
    title: 'Arbitrum Stylus - WASM Smart Contracts',
    description: 'Arbitrum Stylus enables Rust, C++, and WASM smart contracts. New programming languages increase attack surface - audit contracts thoroughly.',
    severity: 'warning',
    deadline: new Date(Date.now() + 55*24*3600*1000).toISOString(),
    tags: ['community', 'news']
  },
  {
    token: 'OP',
    title: 'Optimism Fault Proof System Activation',
    description: 'Optimism mainnet activated permissionless fault proofs. Users can now challenge invalid state roots without relying on trusted entities.',
    severity: 'info',
    deadline: new Date(Date.now() + 30*24*3600*1000).toISOString(),
    tags: ['community', 'news']
  },
  {
    token: 'STRK',
    title: 'Starknet v0.13.3 Performance Improvements',
    description: 'Starknet upgrade includes significant transaction throughput improvements. Expect lower fees and faster confirmations.',
    severity: 'info',
    deadline: new Date(Date.now() + 20*24*3600*1000).toISOString(),
    tags: ['community', 'news']
  },

  // Privacy coins
  {
    token: 'XMR',
    title: 'Monero Seraphis Protocol Development',
    description: 'Next-generation Seraphis protocol development progressing. Will bring enhanced privacy and efficiency to Monero. Follow development updates.',
    severity: 'info',
    deadline: new Date(Date.now() + 180*24*3600*1000).toISOString(),
    tags: ['privacy', 'community']
  },
  {
    token: 'ZEC',
    title: 'Zcash Sustainability Fund Discussion',
    description: 'Community voting on Zcash development funding proposals. ZEC holders encouraged to participate in governance.',
    severity: 'info',
    deadline: new Date(Date.now() + 25*24*3600*1000).toISOString(),
    tags: ['community-vote', 'community']
  },

  // Stablecoins
  {
    token: 'USDC',
    title: 'Circle Cross-Chain Transfer Protocol Updates',
    description: 'USDC Cross-Chain Transfer Protocol (CCTP) expanding to additional chains. Verify chain support before bridging USDC.',
    severity: 'info',
    deadline: new Date(Date.now() + 40*24*3600*1000).toISOString(),
    tags: ['migration', 'community']
  },
  {
    token: 'DAI',
    title: 'MakerDAO Endgame Plan - NewStable Launch',
    description: 'MakerDAO implementing Endgame plan with new stablecoin NewStable. Review impact on DAI holders and migration options.',
    severity: 'warning',
    deadline: new Date(Date.now() + 60*24*3600*1000).toISOString(),
    tags: ['migration', 'community']
  },

  // Emerging L1s
  {
    token: 'SUI',
    title: 'Sui Network Mysticeti Consensus Upgrade',
    description: 'Sui upgraded to Mysticeti consensus achieving sub-second finality. Validators should update nodes to latest version.',
    severity: 'info',
    deadline: new Date(Date.now() + 15*24*3600*1000).toISOString(),
    tags: ['community', 'news']
  },
  {
    token: 'APT',
    title: 'Aptos Randomness API Security Guidelines',
    description: 'Aptos on-chain randomness API now available. Developers must follow security best practices to prevent manipulation attacks.',
    severity: 'warning',
    deadline: new Date(Date.now() + 35*24*3600*1000).toISOString(),
    tags: ['privacy', 'community']
  },

  // MEV and Security
  {
    token: 'ETH',
    title: 'Flashbots SUAVE Alpha Network Launch',
    description: 'Flashbots SUAVE decentralized sequencer network entering alpha. May impact MEV landscape and transaction ordering.',
    severity: 'info',
    deadline: new Date(Date.now() + 70*24*3600*1000).toISOString(),
    tags: ['community', 'news']
  },

  // Cosmos ecosystem
  {
    token: 'ATOM',
    title: 'Cosmos Hub Partial Set Security (PSS)',
    description: 'Cosmos Hub implementing Partial Set Security allowing consumer chains to select validator subsets. Review implications for delegators.',
    severity: 'info',
    deadline: new Date(Date.now() + 45*24*3600*1000).toISOString(),
    tags: ['community', 'news']
  },

  // NFT and Gaming
  {
    token: 'IMX',
    title: 'Immutable zkEVM Mainnet Gas Optimizations',
    description: 'Immutable zkEVM implementing new gas optimization features. NFT marketplaces should test transaction costs.',
    severity: 'info',
    deadline: new Date(Date.now() + 30*24*3600*1000).toISOString(),
    tags: ['community', 'news']
  },

  // Security-focused alerts
  {
    token: 'LINK',
    title: 'Chainlink CCIP Rate Limits Update',
    description: 'Chainlink Cross-Chain Interoperability Protocol updating rate limit parameters. Projects using CCIP should review new limits.',
    severity: 'warning',
    deadline: new Date(Date.now() + 20*24*3600*1000).toISOString(),
    tags: ['community', 'news']
  },

  // Additional tokens
  {
    token: 'AVAX',
    title: 'Avalanche Vryx Consensus Performance',
    description: 'Avalanche Vryx consensus upgrade achieving 100k+ TPS on testnet. Subnet operators should prepare for mainnet rollout.',
    severity: 'info',
    deadline: new Date(Date.now() + 50*24*3600*1000).toISOString(),
    tags: ['community', 'news']
  },
  {
    token: 'DOT',
    title: 'Polkadot OpenGov Referenda System',
    description: 'Polkadot using OpenGov for all governance decisions. DOT holders should participate in treasury proposals and referendum voting.',
    severity: 'info',
    deadline: new Date(Date.now() + 35*24*3600*1000).toISOString(),
    tags: ['community-vote', 'community']
  },
  {
    token: 'NEAR',
    title: 'NEAR Protocol Chain Signatures Live',
    description: 'NEAR Chain Signatures enabling NEAR accounts to control addresses on other chains. Review security model before using.',
    severity: 'warning',
    deadline: new Date(Date.now() + 40*24*3600*1000).toISOString(),
    tags: ['privacy', 'community']
  },
  {
    token: 'FIL',
    title: 'Filecoin Network v22 Upgrade',
    description: 'Filecoin network upgrading to v22 (Shark) with synthetic PoRep. Storage providers must update by deadline.',
    severity: 'warning',
    deadline: new Date(Date.now() + 18*24*3600*1000).toISOString(),
    tags: ['migration', 'community']
  },
  {
    token: 'HBAR',
    title: 'Hedera Smart Contract Service 2.0',
    description: 'Hedera introducing new smart contract features including native HTS token integration. Developers should review migration guide.',
    severity: 'info',
    deadline: new Date(Date.now() + 55*24*3600*1000).toISOString(),
    tags: ['community', 'news']
  },
  {
    token: 'ALGO',
    title: 'Algorand State Proofs on Ethereum',
    description: 'Algorand State Proofs now verifiable on Ethereum enabling trustless cross-chain bridges. Monitor new bridge deployments.',
    severity: 'info',
    deadline: new Date(Date.now() + 40*24*3600*1000).toISOString(),
    tags: ['community', 'news']
  }
];

async function addAlerts() {
  console.log(`🚀 Adding ${NEW_ALERTS.length} new alerts to PRODUCTION...`);
  console.log(`📍 Target: ${PRODUCTION_URL}\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const alert of NEW_ALERTS) {
    try {
      const response = await fetch(`${PRODUCTION_URL}/api/alerts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ADMIN_TOKEN}`
        },
        body: JSON.stringify(alert)
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Added: ${alert.token} - ${alert.title}`);
        successCount++;
      } else {
        const error = await response.text();
        console.error(`❌ Failed: ${alert.token} - ${alert.title}`);
        console.error(`   Status: ${response.status}, Error: ${error}`);
        errorCount++;
      }
    } catch (error) {
      console.error(`❌ Error adding ${alert.token} alert:`, error.message);
      errorCount++;
    }

    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log(`   📝 Total: ${NEW_ALERTS.length}`);
}

addAlerts().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
