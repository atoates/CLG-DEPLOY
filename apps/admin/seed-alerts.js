/**
 * seed-alerts.js
 * Populates the database with high-quality crypto security alerts
 * spanning the last 6 months (Oct 2025 - Apr 2026).
 *
 * Usage:  DATABASE_URL=postgres://... node seed-alerts.js
 *   or:  node seed-alerts.js  (uses DATABASE_URL from .env / environment)
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false
});

// Helper: ISO date from "YYYY-MM-DD" with optional hours offset from midnight
function d(dateStr, hoursOffset = 12) {
  const dt = new Date(dateStr + 'T00:00:00Z');
  dt.setUTCHours(hoursOffset);
  return dt.toISOString();
}

const alerts = [

  // ──────────────────────────────────────────
  //  OCTOBER 2025
  // ──────────────────────────────────────────
  {
    id: 'hist-2025-10-01',
    token: 'ETH',
    title: 'Bunni DEX exploit drains $8.4M from Ethereum and Unichain pools',
    description: 'Decentralised exchange Bunni suffered a critical exploit targeting its core smart contracts on Ethereum and Unichain, draining up to $8.4 million in user funds. The protocol has announced permanent shutdown. Users should revoke any outstanding token approvals to Bunni contracts immediately.',
    severity: 'critical',
    deadline: d('2025-10-12'),
    tags: JSON.stringify(['hack', 'exploit', 'defi']),
    further_info: 'Attack targeted core smart contracts across two chains. Protocol confirmed permanent shutdown following the incident.',
    source_type: 'mainstream-media',
    source_url: 'https://www.theblock.co/post/380992/biggest-crypto-hacks-2025',
    logo_url: ''
  },
  {
    id: 'hist-2025-10-02',
    token: 'SUI',
    title: 'Typus Finance oracle manipulation attack on Sui network',
    description: 'Yield platform Typus Finance was hit by an oracle manipulation attack on 15 October, draining roughly $3.4 million from its liquidity pools. Sui ecosystem users who provided liquidity on Typus should check their positions and revoke approvals.',
    severity: 'warning',
    deadline: d('2025-10-20'),
    tags: JSON.stringify(['hack', 'oracle', 'defi']),
    further_info: 'Oracle manipulation allowed the attacker to extract value from liquidity pools by feeding incorrect price data.',
    source_type: 'trusted-source',
    source_url: 'https://deepstrike.io/blog/crypto-hacking-incidents-statistics-2025-losses-trends',
    logo_url: ''
  },
  {
    id: 'hist-2025-10-03',
    token: 'ETH',
    title: 'Abracadabra DeFi lending platform suffers third exploit',
    description: 'DeFi lending platform Abracadabra endured its third exploit since launch, with attackers bypassing solvency checks through a smart contract vulnerability to drain roughly $1.8 million in MIM stablecoins. Users with active positions on Abracadabra should review their exposure.',
    severity: 'warning',
    deadline: d('2025-10-18'),
    tags: JSON.stringify(['hack', 'exploit', 'defi']),
    further_info: 'Repeated exploits raise serious concerns about the protocol audit process. This is the third security incident for the platform.',
    source_type: 'trusted-source',
    source_url: '',
    logo_url: ''
  },
  {
    id: 'hist-2025-10-04',
    token: 'BTC',
    title: 'North Korean groups embedding malicious code in open-source libraries',
    description: 'Security researchers have warned that DPRK-linked hacking groups are experimenting with embedding malicious code directly into popular open-source cryptocurrency libraries. Developers building Bitcoin and crypto applications should audit their dependencies and use lockfiles to pin known-safe versions.',
    severity: 'warning',
    deadline: d('2025-11-01'),
    tags: JSON.stringify(['supply-chain', 'security', 'development']),
    further_info: 'State-sponsored groups are shifting tactics from direct protocol exploits to supply-chain attacks targeting developer tooling.',
    source_type: 'trusted-source',
    source_url: 'https://www.coindesk.com/business/2026/01/19/crypto-s-worst-year-for-hacks-wasn-t-a-smart-contract-problem-it-was-a-people-problem',
    logo_url: ''
  },

  // ──────────────────────────────────────────
  //  NOVEMBER 2025
  // ──────────────────────────────────────────
  {
    id: 'hist-2025-11-01',
    token: 'ETH',
    title: 'Balancer V2 exploit drains $128M across Ethereum, Polygon and Base',
    description: 'Attackers exploited a rounding-error vulnerability in Balancer V2 Composable Stable Pools to drain over $128 million in assets across Ethereum, Polygon and Base. The attack manipulated liquidity pool invariants via micro-transactions, exploiting the batchSwap function. All Balancer V2 LPs should withdraw liquidity from affected pools immediately.',
    severity: 'critical',
    deadline: d('2025-11-15'),
    tags: JSON.stringify(['hack', 'exploit', 'defi']),
    further_info: 'Root cause was a "rounding down precision loss" in the Balancer Vault calculations. The batchSwap function amplified this vulnerability across multiple chains simultaneously.',
    source_type: 'mainstream-media',
    source_url: 'https://www.infosecurity-magazine.com/news/defi-protocol-balancer-loses-120m/',
    logo_url: ''
  },
  {
    id: 'hist-2025-11-02',
    token: 'ETH',
    title: 'Gnosis Chain hard fork to recover $9M from Balancer hack',
    description: 'Gnosis Chain validators coordinated a hard fork to recover $9 million lost in the November Balancer exploit. A majority of validators updated their software before the deadline to reverse the hack transactions. This sets a precedent for chain-level intervention in DeFi exploits.',
    severity: 'info',
    deadline: d('2025-11-20'),
    tags: JSON.stringify(['fork', 'recovery', 'governance']),
    further_info: 'The hard fork effectively reversed hack transactions on Gnosis Chain. Raises questions about immutability versus user protection in blockchain governance.',
    source_type: 'mainstream-media',
    source_url: 'https://www.dlnews.com/articles/defi/gnosis-chain-forks-to-recover-millions-lost-in-balancer-hack/',
    logo_url: ''
  },
  {
    id: 'hist-2025-11-03',
    token: 'BTC',
    title: 'Babylon staking protocol vulnerability threatens consensus stability',
    description: 'A newly discovered security flaw in the Bitcoin staking protocol Babylon could allow attackers to bypass core consensus mechanisms. The vulnerability targets the staking validation logic, allowing malicious actors to simulate legitimate stake without locking up the required capital. Users staking BTC through Babylon should monitor for protocol updates.',
    severity: 'warning',
    deadline: d('2025-12-01'),
    tags: JSON.stringify(['vulnerability', 'staking', 'consensus']),
    further_info: 'The flaw allows simulated staking without actual capital commitment, potentially destabilising the validation process.',
    source_type: 'trusted-source',
    source_url: 'https://www.btcc.com/en-US/amp/square/Cryptonews/1398177',
    logo_url: ''
  },

  // ──────────────────────────────────────────
  //  DECEMBER 2025
  // ──────────────────────────────────────────
  {
    id: 'hist-2025-12-01',
    token: 'ETH',
    title: 'Suspected AI-assisted hacking spree hits Ribbon, Rari and Yearn Finance',
    description: 'A trio of exploits struck Ribbon Finance, Rari Capital and Yearn Finance in December, with security researchers suspecting a coordinated AI-assisted hacking campaign. Yearn alone lost $9 million, though $2.4 million was later recovered. DeFi users with positions on these protocols should check their funds.',
    severity: 'critical',
    deadline: d('2025-12-20'),
    tags: JSON.stringify(['hack', 'exploit', 'ai-threat']),
    further_info: 'Multiple protocols hit in rapid succession suggests automated exploit discovery. $2.4M of the $9M Yearn loss was recovered. The coordinated nature points to AI-augmented attack tooling.',
    source_type: 'mainstream-media',
    source_url: 'https://protos.com/2025s-biggest-crypto-hacks-from-exchange-breaches-to-defi-exploits/',
    logo_url: ''
  },
  {
    id: 'hist-2025-12-02',
    token: 'ETH',
    title: 'Garden Finance bridge hack results in $11M loss',
    description: 'Blockchain bridge Garden suffered an $11 million exploit in December, adding to the growing list of bridge-related security incidents. Cross-chain bridge users should review their pending transactions and revoke any approvals to the Garden bridge contracts.',
    severity: 'critical',
    deadline: d('2025-12-15'),
    tags: JSON.stringify(['hack', 'bridge', 'exploit']),
    further_info: 'Bridge protocols continue to be high-value targets due to the large amounts of locked liquidity they hold.',
    source_type: 'mainstream-media',
    source_url: 'https://www.theblock.co/post/380992/biggest-crypto-hacks-2025',
    logo_url: ''
  },
  {
    id: 'hist-2025-12-03',
    token: 'BTC',
    title: 'Critical token-draining vulnerability found affecting thousands of sites',
    description: 'Security researchers disclosed a critical bug capable of draining all tokens from wallets when interacting with thousands of affected websites. The vulnerability exists in a widely-used Web3 frontend library. Users should ensure their browser wallet extensions are updated and avoid connecting wallets to unfamiliar dApps.',
    severity: 'critical',
    deadline: d('2025-12-22'),
    tags: JSON.stringify(['vulnerability', 'supply-chain', 'wallet']),
    further_info: 'The vulnerability affects a popular frontend library used by thousands of cryptocurrency-related websites. Exploitation requires the user to connect their wallet to an affected site.',
    source_type: 'trusted-source',
    source_url: 'https://www.coindesk.com/tech/2025/12/17/the-protocol-bug-that-can-drain-all-your-tokens-impacting-thousands-sites',
    logo_url: ''
  },
  {
    id: 'hist-2025-12-04',
    token: 'ETH',
    title: 'Phishing scams surge 1,400% year-over-year driven by AI impersonation',
    description: 'Chainalysis data reveals that impersonation and AI-enabled phishing scams surged 1,400% year-over-year in 2025, with scammers increasingly using deepfake video calls and AI-generated messages to target crypto holders. Never share seed phrases or private keys, and verify all communications through official channels.',
    severity: 'warning',
    deadline: d('2026-01-15'),
    tags: JSON.stringify(['scam', 'phishing', 'ai-threat']),
    further_info: 'AI-generated impersonation scams now outpace traditional infrastructure hacks. Roughly $17 billion in crypto was lost to scams and frauds in 2025 overall.',
    source_type: 'trusted-source',
    source_url: 'https://www.chainalysis.com/blog/2026-crypto-crime-report-introduction/',
    logo_url: ''
  },

  // ──────────────────────────────────────────
  //  JANUARY 2026
  // ──────────────────────────────────────────
  {
    id: 'hist-2026-01-01',
    token: 'SOL',
    title: 'Solana wallet phishing attack exploits Owner permission vulnerability',
    description: 'A sophisticated phishing attack targeting Solana wallets was detected on 7 January, manipulating the "Owner" permission field to silently transfer complete account control without triggering traditional security warnings. OKX Wallet and Phantom issued high-risk alerts. Solana users should verify no unexpected owner changes have been made to their accounts.',
    severity: 'critical',
    deadline: d('2026-01-15'),
    tags: JSON.stringify(['phishing', 'wallet', 'vulnerability']),
    further_info: 'The attack exploits a design quirk in Solana account permissions, bypassing standard wallet security notifications. Major wallet providers have pushed emergency updates.',
    source_type: 'trusted-source',
    source_url: 'https://www.btcc.com/en-US/square/SOL%20News/1390450',
    logo_url: ''
  },
  {
    id: 'hist-2026-01-02',
    token: 'BTC',
    title: 'January crypto theft hits $370M across 40 incidents',
    description: 'Blockchain security firm CertiK reported 40 recorded incidents costing the crypto industry approximately $370 million in January 2026 alone, making it one of the worst months on record. Users should enable hardware wallet signing for all high-value transactions and review exchange withdrawal whitelist settings.',
    severity: 'warning',
    deadline: d('2026-02-10'),
    tags: JSON.stringify(['security', 'industry']),
    further_info: 'January 2026 saw an alarming spike in both the number and severity of attacks. Hardware wallet usage and withdrawal whitelists remain the strongest defences.',
    source_type: 'mainstream-media',
    source_url: 'https://finance.yahoo.com/news/crypto-theft-hit-nearly-400-180626234.html',
    logo_url: ''
  },
  {
    id: 'hist-2026-01-03',
    token: 'ETH',
    title: 'North Korean IT worker infiltration of crypto companies intensifies',
    description: 'Reports indicate that DPRK-linked operatives embedded as IT workers inside crypto companies contributed to multiple breaches in late 2025 and early 2026. The Lazarus Group stole $2.02 billion in 2025 alone, a 51% year-over-year increase. Crypto companies should strengthen hiring verification and access controls.',
    severity: 'warning',
    deadline: d('2026-02-15'),
    tags: JSON.stringify(['security', 'social-engineering', 'nation-state']),
    further_info: 'DPRK is achieving larger thefts with fewer incidents by using sophisticated impersonation tactics and embedding operatives inside target organisations.',
    source_type: 'trusted-source',
    source_url: 'https://www.chainalysis.com/blog/crypto-hacking-stolen-funds-2026/',
    logo_url: ''
  },

  // ──────────────────────────────────────────
  //  FEBRUARY 2026
  // ──────────────────────────────────────────
  {
    id: 'hist-2026-02-01',
    token: 'ETH',
    title: 'Anniversary of Bybit $1.5B hack highlights ongoing exchange security gaps',
    description: 'One year after the largest crypto theft in history, when North Korea\'s Lazarus Group stole $1.5 billion from Bybit by compromising a Safe{Wallet} developer\'s workstation, security researchers warn that many exchanges still rely on similar custodial architectures. Users should prefer exchanges with proof-of-reserves and multi-party computation (MPC) wallets.',
    severity: 'info',
    deadline: d('2026-03-01'),
    tags: JSON.stringify(['security', 'exchange', 'nation-state']),
    further_info: 'The Bybit attack compromised transaction signing via a social engineering attack on a third-party developer. 86% of stolen ETH was converted to BTC within a month. The FBI attributed it to Lazarus Group / TraderTraitor.',
    source_type: 'mainstream-media',
    source_url: 'https://www.nccgroup.com/research/in-depth-technical-analysis-of-the-bybit-hack/',
    logo_url: ''
  },
  {
    id: 'hist-2026-02-02',
    token: 'BTC',
    title: 'Bitcoin mining difficulty drops 7.76% as miners pivot to AI',
    description: 'Bitcoin mining difficulty saw its second-biggest decline of 2026 as major miners including Core Scientific, Marathon Digital and Riot Platforms accelerate their pivot to AI data centre operations. While not an immediate security threat, reduced hash rate could lower the cost of potential 51% attacks. Monitor network hash rate trends.',
    severity: 'info',
    deadline: d('2026-03-15'),
    tags: JSON.stringify(['mining', 'security', 'network']),
    further_info: 'If miners increasingly prioritise AI revenue over Bitcoin mining, the network\'s long-term security model may face economic challenges rather than technical vulnerabilities.',
    source_type: 'mainstream-media',
    source_url: 'https://www.techi.com/bitcoin-miners-ai-pivot-security-risk/',
    logo_url: ''
  },
  {
    id: 'hist-2026-02-03',
    token: 'BTC',
    title: 'Quantum computing research advances renew Bitcoin cryptography concerns',
    description: 'Google researchers published findings suggesting a sufficiently powerful quantum computer could break Bitcoin\'s core ECDSA cryptography in under nine minutes. While current quantum machines are far from this capability, roughly 1.7 million BTC sits in vulnerable pay-to-public-key (P2PK) addresses. The Bitcoin community is actively developing quantum-resistant migration paths.',
    severity: 'info',
    deadline: d('2026-04-01'),
    tags: JSON.stringify(['quantum', 'security', 'research']),
    further_info: 'The threat is not imminent but is being taken seriously. P2PK and Taproot addresses expose public keys directly. Key initiatives for quantum-proofing are underway.',
    source_type: 'mainstream-media',
    source_url: 'https://www.coindesk.com/tech/2026/04/04/bitcoin-s-usd1-3-trillion-security-race-key-initiatives-aimed-at-quantum-proofing-the-world-s-largest-blockchain',
    logo_url: ''
  },

  // ──────────────────────────────────────────
  //  MARCH 2026
  // ──────────────────────────────────────────
  {
    id: 'hist-2026-03-01',
    token: 'ETH',
    title: 'Resolv Labs exploit mints $80M unbacked USR stablecoins, triggers depeg',
    description: 'Attackers compromised Resolv Labs\' AWS Key Management Service to mint approximately 80 million unbacked USR stablecoin tokens on 22 March. The token crashed 74% to $0.025 within 17 minutes, causing roughly $25 million in direct losses. The attack exploited a compromised cloud signing key, not a smart contract bug. DeFi users holding USR should monitor the recovery process.',
    severity: 'critical',
    deadline: d('2026-04-05'),
    tags: JSON.stringify(['hack', 'stablecoin', 'infrastructure']),
    further_info: 'The attacker deposited just $100,000 in USDC and minted $80M in USR using a compromised SERVICE_ROLE signing key from AWS KMS. This highlights cloud infrastructure as a major attack vector for DeFi protocols.',
    source_type: 'mainstream-media',
    source_url: 'https://news.bitcoin.com/resolv-labs-pauses-protocol-after-23m-exploit-triggers-usr-stablecoin-depeg/',
    logo_url: ''
  },
  {
    id: 'hist-2026-03-02',
    token: 'ETH',
    title: 'March 2026 exploit losses jump 96% from February to $52M',
    description: 'PeckShield reported that approximately 20 significant crypto security incidents occurred in March 2026, resulting in roughly $52 million in stolen funds. This represents a 96% increase from February\'s $26.5 million. The Resolv Labs breach accounted for nearly half of the total. Users should maintain heightened vigilance with token approvals and contract interactions.',
    severity: 'warning',
    deadline: d('2026-04-10'),
    tags: JSON.stringify(['security', 'industry']),
    further_info: 'The sharp month-on-month increase suggests evolving attack techniques. Cloud infrastructure and key management remain the weakest links.',
    source_type: 'trusted-source',
    source_url: 'https://www.crowdfundinsider.com/2026/04/270705-crypto-exploit-losses-climb-sharply-in-march-2026-as-security-threats-evolve-report-reveals/',
    logo_url: ''
  },

  // ──────────────────────────────────────────
  //  APRIL 2026
  // ──────────────────────────────────────────
  {
    id: 'hist-2026-04-01',
    token: 'SOL',
    title: 'Drift Protocol drained of $285M via Solana durable nonce exploit',
    description: 'The largest DeFi breach of 2026 struck Solana\'s ecosystem when attackers exploited Drift Protocol using "durable nonces", a legitimate Solana transaction feature that allows offline signing with no expiration. A North Korean state-linked group posed as a quantitative trading firm for six months before executing the attack. All Drift users should revoke delegated authorities immediately.',
    severity: 'critical',
    deadline: d('2026-04-15'),
    tags: JSON.stringify(['hack', 'exploit', 'defi', 'nation-state']),
    further_info: 'The attacker pre-signed administrative transfers weeks in advance, then executed them all at once, bypassing multisig security. Security researcher Samczsun called it "a systemic risk baked into Solana\'s architecture".',
    source_type: 'mainstream-media',
    source_url: 'https://www.coindesk.com/tech/2026/04/02/how-a-solana-feature-designed-for-convenience-let-an-attacker-drain-usd270-million-from-drift',
    logo_url: ''
  },
  {
    id: 'hist-2026-04-02',
    token: 'SOL',
    title: 'Solana Foundation announces security architecture overhaul after Drift exploit',
    description: 'Following the $285 million Drift Protocol exploit, the Solana Foundation announced a comprehensive security review focusing on the durable nonce feature and other transaction signing mechanisms. Developers building on Solana should review the updated security guidelines and implement additional safeguards for nonce-based transactions.',
    severity: 'warning',
    deadline: d('2026-04-20'),
    tags: JSON.stringify(['security', 'development', 'governance']),
    further_info: 'The Solana Foundation is working on protocol-level mitigations to limit the risk posed by durable nonces in DeFi applications.',
    source_type: 'trusted-source',
    source_url: 'https://www.ainvest.com/news/solana-sol-faces-security-challenges-infrastructure-upgrades-2026-2604/',
    logo_url: ''
  },
  {
    id: 'hist-2026-04-03',
    token: 'BTC',
    title: 'Industry report: 95% of crypto theft stems from human error, not code bugs',
    description: 'A comprehensive 2026 industry analysis confirms that over 95% of cryptocurrency theft occurs through user error, compromised third parties or social engineering rather than protocol-level smart contract exploits. Use hardware wallets, enable 2FA everywhere, and never share seed phrases. The biggest threat to your crypto is not code, it is people.',
    severity: 'info',
    deadline: d('2026-05-01'),
    tags: JSON.stringify(['security', 'education', 'social-engineering']),
    further_info: 'Operational security (key management, employee vetting, phishing resistance) is now far more important than smart contract auditing alone.',
    source_type: 'trusted-source',
    source_url: 'https://earnpark.com/en/posts/bitcoin-security-in-2026-are-you-actually-protected/',
    logo_url: ''
  },

  // ──────────────────────────────────────────
  //  HISTORICAL MAJOR EVENTS (still relevant)
  // ──────────────────────────────────────────
  {
    id: 'hist-2025-07-01',
    token: 'AVAX',
    title: 'GMX V1 reentrancy exploit drains $42M on Arbitrum and Avalanche',
    description: 'On 9 July 2025, GMX suffered a $42 million exploit due to a classic reentrancy vulnerability in its V1 PositionManager.executeDecreaseOrder() function. The attacker manipulated BTC average short prices to inflate GLP token values and used flash loans to siphon funds. Approximately $40.5 million was later returned under a white-hat agreement.',
    severity: 'warning',
    deadline: d('2025-10-15'),
    tags: JSON.stringify(['hack', 'exploit', 'defi']),
    further_info: 'The attacker retained a $5M bounty under the white-hat agreement. Root cause was a circular dependency between global short positions, average prices, AUM calculations and GLP token values.',
    source_type: 'mainstream-media',
    source_url: 'https://www.halborn.com/blog/post/explained-the-gmx-hack-july-2025',
    logo_url: ''
  },
  {
    id: 'hist-2025-05-01',
    token: 'SUI',
    title: 'Cetus Protocol exploit drains $223M from Sui\'s largest DEX',
    description: 'On 22 May 2025, attackers exploited an integer overflow bug in the checked_shlw function of the integer-mate math library used by Cetus, Sui\'s largest DEX, draining approximately $223 million in under 15 minutes. The attacker deployed worthless spoof tokens to manipulate price curves. Around $162M was frozen on-chain and Cetus relaunched with recovered funds.',
    severity: 'critical',
    deadline: d('2025-10-15'),
    tags: JSON.stringify(['hack', 'exploit', 'defi']),
    further_info: 'A single incorrect number in the overflow check function allowed the attacker to obtain liquidity worth billions at the cost of only 1 token. $60M was bridged to Ethereum before freezing.',
    source_type: 'mainstream-media',
    source_url: 'https://www.halborn.com/blog/post/explained-the-cetus-hack-may-2025',
    logo_url: ''
  }
];

async function seedAlerts() {
  console.log(`Seeding ${alerts.length} alerts into the database...`);

  let inserted = 0;
  let errors = 0;

  for (const a of alerts) {
    try {
      await pool.query(`
        INSERT INTO alerts (id, token, title, description, severity, deadline, tags, further_info, source_type, source_url, logo_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          token = excluded.token,
          title = excluded.title,
          description = excluded.description,
          severity = excluded.severity,
          deadline = excluded.deadline,
          tags = excluded.tags,
          further_info = excluded.further_info,
          source_type = excluded.source_type,
          source_url = excluded.source_url,
          logo_url = excluded.logo_url
      `, [
        a.id,
        a.token,
        a.title,
        a.description,
        a.severity,
        a.deadline,
        a.tags,
        a.further_info,
        a.source_type,
        a.source_url,
        a.logo_url
      ]);
      inserted++;
      console.log(`  [OK] ${a.id} - ${a.title.slice(0, 60)}...`);
    } catch (err) {
      errors++;
      console.error(`  [ERR] ${a.id}: ${err.message}`);
    }
  }

  console.log(`\nDone. ${inserted} alerts inserted/updated, ${errors} errors.`);

  // Show summary
  const { rows } = await pool.query('SELECT count(*) as total FROM alerts');
  console.log(`Total alerts now in database: ${rows[0].total}`);

  await pool.end();
}

seedAlerts().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
