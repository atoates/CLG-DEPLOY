// server.js
// Only load .env in development (when not in Railway/production)
if (!process.env.RAILWAY_ENVIRONMENT) {
  require('dotenv').config();
}
const fs = require('fs');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, 'data');
// PostgreSQL connection
const DATABASE_URL = process.env.DATABASE_URL;
// Backup dir (can be overridden by BACKUP_DIR env var)
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');
const RESTORE_FROM_FILE = String(process.env.RESTORE_FROM_FILE || '').toLowerCase() === 'true';

// Ensure data directory exists for file storage (alerts.json, backups, etc)
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('Data directory created/verified:', DATA_DIR);
} catch (e) {
  console.error('Failed to create data directory:', e.message);
  // If we can't create the data dir, fall back to a local one
  const fallbackDataDir = path.resolve(__dirname, 'data');
  console.log('Falling back to local data directory:', fallbackDataDir);
  fs.mkdirSync(fallbackDataDir, { recursive: true });
}

// server reference declared up-front so shutdown handlers can close it later
let server;
// CoinMarketCap configuration
const CMC_API_KEY = process.env.CMC_API_KEY || '';
// CoinGecko API key for better token logo coverage
const COINGECKO_API_KEY = process.env.GEKO || process.env.COINGECKO_API_KEY || '';
// LogoKit API for crypto token icons (fallback)
const LOGOKIT_API_KEY = process.env.LOGOKIT_API_KEY || 'pk_fr3b615a522b603695a025';
// AI API keys for summary generation - trim to remove whitespace/newlines
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();
const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || '').trim();
const XAI_API_KEY = (process.env.XAI_API_KEY || process.env.XAI_APIKEY || process.env.XAI_TOKEN || '').trim();
const MARKET_CURRENCY = (process.env.MARKET_CURRENCY || 'GBP').toUpperCase();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const BASE_URL = process.env.BASE_URL || '';
const COOKIE_SECURE = (process.env.COOKIE_SECURE || '').toLowerCase() === 'true' || (BASE_URL && BASE_URL.startsWith('https://'));

// CORS configuration for admin dashboard
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4173',
  process.env.ADMIN_DASHBOARD_URL,
  process.env.STAGING_ADMIN_URL,
  'https://app.crypto-lifeguard.com',  // Production main app
  'https://clg-staging.up.railway.app', // Staging main app
].filter(Boolean); // Remove undefined values

// Log CORS configuration on startup
console.log('[CORS] Allowed origins:', allowedOrigins.length, 'configured');

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman, same-origin)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('[CORS] Blocked request from origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies to be sent
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
};

// Apply CORS middleware ONLY to API/auth routes - NOT to static files
app.use('/api', cors(corsOptions));
app.use('/auth', cors(corsOptions));
app.use('/admin', cors(corsOptions));
app.use('/debug', cors(corsOptions));
app.options('*', cors(corsOptions)); // Handle preflight requests

// Function to get default tags based on severity
function getDefaultTags(severity) {
  switch (severity) {
    case 'critical': return '["hack","exploit"]';
    case 'warning': return '["community","migration"]';
    case 'info': return '["community","news"]';
    default: return '[]';
  }
}

// Data directory and database initialized

/* ---------------- DB setup (PostgreSQL) ---------------- */
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL && DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

// Function to ensure tags are properly formatted
function ensureValidTags(tags) {
  if (!tags) return '[]';
  try {
    const parsed = typeof tags === 'string' ? JSON.parse(tags) : tags;
    return Array.isArray(parsed) ? JSON.stringify(parsed) : '[]';
  } catch (e) {
    return '[]';
  }
}

function safeParseJson(value, fallback) {
  if (value === null || value === undefined) return Array.isArray(fallback) ? [...fallback] : fallback;
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return Array.isArray(fallback) ? [...fallback] : fallback;
  }
}

function normalizeTickers(input) {
  if (!Array.isArray(input)) return [];
  const deduped = new Set();
  input.forEach(t => {
    if (typeof t !== 'string') return;
    const cleaned = t.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleaned) deduped.add(cleaned);
  });
  return Array.from(deduped);
}

/* ---------------- Token Logo Proxy (with caching) ---------------- */
const logoCache = new Map(); // key -> { t, contentType, body }
const coinGeckoIdCache = new Map(); // symbol -> coin_id mapping cache
const LOGO_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const LOGO_CACHE_DIR = path.join(DATA_DIR, 'logo-cache');
try { fs.mkdirSync(LOGO_CACHE_DIR, { recursive: true }); } catch {}

// CoinGecko symbol to ID mapping (cached for 7 days)
const COINGECKO_ID_TTL_MS = 7 * 24 * 60 * 60 * 1000;
let coinGeckoList = null;
let coinGeckoListFetchedAt = 0;

async function getCoinGeckoId(symbol) {
  const sym = symbol.toUpperCase();
  
  // Check memory cache first
  const cached = coinGeckoIdCache.get(sym);
  if (cached && (Date.now() - cached.t < COINGECKO_ID_TTL_MS)) {
    return cached.id;
  }

  // Fetch full coin list if needed (cache for 7 days)
  if (!coinGeckoList || (Date.now() - coinGeckoListFetchedAt > COINGECKO_ID_TTL_MS)) {
    try {
      // Try Demo API first (most likely tier), then Pro, then free
      let url = '';
      if (COINGECKO_API_KEY) {
        url = `https://api.coingecko.com/api/v3/coins/list?x_cg_demo_api_key=${COINGECKO_API_KEY}`;
      } else {
        url = 'https://api.coingecko.com/api/v3/coins/list';
      }

      const resp = await fetch(url);
      if (resp.ok) {
        coinGeckoList = await resp.json();
        coinGeckoListFetchedAt = Date.now();
        console.log(`✅ CoinGecko coin list fetched: ${coinGeckoList.length} coins`);
      } else {
        console.warn(`⚠️ CoinGecko list fetch failed (${resp.status}), trying without API key...`);
        // Fallback to free API without key
        const freeResp = await fetch('https://api.coingecko.com/api/v3/coins/list');
        if (freeResp.ok) {
          coinGeckoList = await freeResp.json();
          coinGeckoListFetchedAt = Date.now();
          console.log(`✅ CoinGecko coin list fetched (free API): ${coinGeckoList.length} coins`);
        }
      }
    } catch (err) {
      console.error('❌ Failed to fetch CoinGecko coin list:', err.message);
    }
  }

  // Find matching coin by symbol
  if (coinGeckoList) {
    // First try: exact symbol match with highest market cap rank (lowest number = higher rank)
    // Filter all matches, then sort by market_cap_rank if available, or prioritize well-known IDs
    const exactMatches = coinGeckoList.filter(c => c.symbol.toUpperCase() === sym);
    
    if (exactMatches.length > 0) {
      // Prioritize well-known coin IDs for common symbols
      const wellKnownCoins = {
        'BTC': 'bitcoin',
        'ETH': 'ethereum',
        'USDT': 'tether',
        'BNB': 'binancecoin',
        'SOL': 'solana',
        'XRP': 'ripple',
        'USDC': 'usd-coin',
        'ADA': 'cardano',
        'DOGE': 'dogecoin',
        'TRX': 'tron',
        'AVAX': 'avalanche-2',
        'SHIB': 'shiba-inu',
        'DOT': 'polkadot',
        'MATIC': 'matic-network',
        'POL': 'polygon-ecosystem-token',
        'LTC': 'litecoin',
        'UNI': 'uniswap',
        'LINK': 'chainlink',
        'ATOM': 'cosmos',
        'XLM': 'stellar',
        'BCH': 'bitcoin-cash',
        'PEPE': 'pepe',
        'WIF': 'dogwifcoin',
        'BONK': 'bonk',
        'FLOKI': 'floki',
        'TAO': 'bittensor'
      };
      
      if (wellKnownCoins[sym]) {
        const wellKnown = exactMatches.find(c => c.id === wellKnownCoins[sym]);
        if (wellKnown) {
          coinGeckoIdCache.set(sym, { id: wellKnown.id, t: Date.now() });
          return wellKnown.id;
        }
      }
      
      // Otherwise return first match (CoinGecko list is roughly sorted by importance)
      const match = exactMatches[0];
      coinGeckoIdCache.set(sym, { id: match.id, t: Date.now() });
      return match.id;
    }
  }

  return null;
}

function diskPathFor(sym, ext){
  return path.join(LOGO_CACHE_DIR, `${sym}.${ext}`);
}
function extForContentType(ct){
  return (ct && ct.includes('svg')) ? 'svg' : 'png';
}
function readFromDiskCache(sym){
  try {
    const candidates = ['svg','png'];
    for (const ext of candidates){
      const p = diskPathFor(sym, ext);
      if (fs.existsSync(p)){
        const st = fs.statSync(p);
        if (Date.now() - st.mtimeMs < LOGO_TTL_MS){
          const buf = fs.readFileSync(p);
          const ct = ext === 'svg' ? 'image/svg+xml' : 'image/png';
          return { buf, ct };
        }
      }
    }
  } catch {}
  return null;
}
function writeToDiskCache(sym, buf, ct){
  try {
    const ext = extForContentType(ct);
    fs.writeFileSync(diskPathFor(sym, ext), buf);
  } catch {}
}

app.get('/api/logo/:symbol', async (req, res) => {
  try {
    const sym = String(req.params.symbol || '').toUpperCase().replace(/[^A-Z0-9]/g,'');
    if (!sym) return res.status(400).send('bad symbol');

    const cacheKey = `logo:${sym}`;
    const hit = logoCache.get(cacheKey);
    if (hit && Date.now() - hit.t < LOGO_TTL_MS) {
      res.setHeader('Content-Type', hit.contentType || 'image/svg+xml');
      return res.send(hit.body);
    }

    // Disk cache
    const disk = readFromDiskCache(sym);
    if (disk){
      logoCache.set(cacheKey, { t: Date.now(), contentType: disk.ct, body: disk.buf });
      res.setHeader('Content-Type', disk.ct);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(disk.buf);
    }

    // Helper to try a URL
    async function tryUrl(url){
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const buf = Buffer.from(await resp.arrayBuffer());
      const ct = resp.headers.get('content-type') || (url.endsWith('.svg') ? 'image/svg+xml' : 'image/png');
      return { buf, ct };
    }

    const urls = [];

    // 1) CoinGecko API (primary source - best coverage)
    try {
      const coinId = await getCoinGeckoId(sym);
      if (coinId) {
        let coinUrl = '';
        if (COINGECKO_API_KEY) {
          coinUrl = `https://api.coingecko.com/api/v3/coins/${coinId}?x_cg_demo_api_key=${COINGECKO_API_KEY}&localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`;
        } else {
          coinUrl = `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`;
        }

        const coinResp = await fetch(coinUrl);
        
        if (coinResp.ok) {
          const coinData = await coinResp.json();
          if (coinData.image) {
            // Prefer large, then small, then thumb
            if (coinData.image.large) urls.push(coinData.image.large);
            if (coinData.image.small) urls.push(coinData.image.small);
            if (coinData.image.thumb) urls.push(coinData.image.thumb);
          }
        } else if (!COINGECKO_API_KEY) {
          // Already using free API, don't retry
        } else {
          // Retry without API key
          const freeUrl = `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`;
          const freeResp = await fetch(freeUrl);
          if (freeResp.ok) {
            const coinData = await freeResp.json();
            if (coinData.image) {
              if (coinData.image.large) urls.push(coinData.image.large);
              if (coinData.image.small) urls.push(coinData.image.small);
              if (coinData.image.thumb) urls.push(coinData.image.thumb);
            }
          }
        }
      }
    } catch (err) {
      console.warn(`⚠️ CoinGecko lookup failed for ${sym}:`, err.message);
    }

    // 2) LogoKit API (fallback)
    urls.push(
      `https://api.logokit.dev/crypto/${sym}.svg?token=${LOGOKIT_API_KEY}`,
      `https://img.logokit.com/crypto/${sym}?token=${LOGOKIT_API_KEY}&size=128`
    );

    // 3) Open-source cryptoicons fallback (SVG, color) — symbol is lowercase
    const lower = sym.toLowerCase();
    urls.push(`https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/${lower}.svg`);

    let found = null;
    for (const u of urls){
      try {
        found = await tryUrl(u);
        if (found) break;
      } catch(_) {}
    }
    if (!found) throw new Error('no_logo');

  logoCache.set(cacheKey, { t: Date.now(), contentType: found.ct, body: found.buf });
  writeToDiskCache(sym, found.buf, found.ct);
    res.setHeader('Content-Type', found.ct);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(found.buf);
  } catch (e) {
    try {
      // Fallback to monogram SVG
      const sym = String(req.params.symbol || '').toUpperCase().slice(0,4);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#e2e8f0"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="22" font-weight="700" fill="#1f2937">${sym}</text></svg>`;
      res.setHeader('Content-Type','image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(svg);
    } catch(_e) {
      return res.status(204).end();
    }
  }
});

// Initialize database tables (migrations will handle schema properly, but ensure basics)
async function initDB() {
  try {
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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS token_requests (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        reason TEXT NOT NULL,
        website TEXT,
        market_cap TEXT,
        status TEXT DEFAULT 'pending',
        submitted_at TEXT NOT NULL,
        reviewed_at TEXT,
        reviewed_by TEXT,
        notes TEXT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        user_id TEXT,
        email TEXT,
        event TEXT,
        detail TEXT
      );
    `);

    console.log('Database tables initialized');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
}

// Call init on startup
initDB().catch(console.error);

// Clean up old news articles every 6 hours
setInterval(async () => {
  try {
    const result = await pool.query(
      'DELETE FROM news_cache WHERE expires_at < NOW()'
    );
    if (result.rowCount > 0) {
      console.log(`[News Cache] Cleaned up ${result.rowCount} expired articles`);
    }
  } catch (err) {
    console.error('[News Cache] Cleanup error:', err);
  }
}, 6 * 60 * 60 * 1000); // Every 6 hours

/* ---------------- Database Helper Functions ---------------- */
// Upsert user (INSERT ON CONFLICT DO NOTHING)
async function upsertUser(userId) {
  await pool.query('INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [userId]);
}

// Get user
async function getUser(userId) {
  const { rows } = await pool.query(
    'SELECT id, google_id, email, name, avatar, username FROM users WHERE id = $1',
    [userId]
  );
  return rows[0] || null;
}

// Get user by username
async function getUserByUsername(username) {
  const { rows } = await pool.query(
    'SELECT id FROM users WHERE lower(username) = lower($1)',
    [username]
  );
  return rows[0] || null;
}

// Set username
async function setUsername(username, userId) {
  await pool.query('UPDATE users SET username = $1 WHERE id = $2', [username, userId]);
}

// Set avatar
async function setAvatar(avatar, userId) {
  await pool.query('UPDATE users SET avatar = $1 WHERE id = $2', [avatar, userId]);
}

// Get user preferences
async function getPrefs(userId) {
  const { rows } = await pool.query('SELECT * FROM user_prefs WHERE user_id = $1', [userId]);
  return rows[0] || null;
}

// Upsert preferences
async function upsertPrefs(userId, watchlist, severity, showAll, dismissed, currency = 'USD') {
  await pool.query(`
    INSERT INTO user_prefs (user_id, watchlist_json, severity_json, show_all, dismissed_json, currency, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, EXTRACT(EPOCH FROM NOW()))
    ON CONFLICT(user_id) DO UPDATE SET
      watchlist_json = excluded.watchlist_json,
      severity_json = excluded.severity_json,
      show_all = excluded.show_all,
      dismissed_json = excluded.dismissed_json,
      currency = excluded.currency,
      updated_at = excluded.updated_at
  `, [userId, watchlist, severity, showAll, dismissed, currency]);
}

// Insert a saved AI summary for a logged-in user
async function insertUserSummary(userId, { model, tokens, sevFilter, tagFilter, alertIds, content, usage }) {
  const id = `sum_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  await pool.query(
    `INSERT INTO user_summaries (id, user_id, model, tokens_json, sev_filter_json, tag_filter_json, alert_ids_json, content, usage_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      userId,
      String(model || ''),
      JSON.stringify(Array.isArray(tokens) ? tokens : []),
      JSON.stringify(Array.isArray(sevFilter) ? sevFilter : []),
      JSON.stringify(Array.isArray(tagFilter) ? tagFilter : []),
      JSON.stringify(Array.isArray(alertIds) ? alertIds : []),
      String(content || ''),
      usage ? JSON.stringify(usage) : null
    ]
  );
  return id;
}

// Fetch recent summaries for a user
async function getRecentUserSummaries(userId, limit = 10) {
  const lim = Math.max(1, Math.min(50, parseInt(limit) || 10));
  const { rows } = await pool.query(
    `SELECT id, user_id, created_at, model, tokens_json, sev_filter_json, tag_filter_json, alert_ids_json, content, usage_json
     FROM user_summaries WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, lim]
  );
  return rows.map(r => ({
    id: r.id,
    user_id: r.user_id,
    created_at: r.created_at ? new Date(Number(r.created_at) * 1000).toISOString() : null,
    model: r.model || '',
    tokens: (()=>{ try{return JSON.parse(r.tokens_json||'[]')}catch{return[]} })(),
    sevFilter: (()=>{ try{return JSON.parse(r.sev_filter_json||'[]')}catch{return[]} })(),
    tagFilter: (()=>{ try{return JSON.parse(r.tag_filter_json||'[]')}catch{return[]} })(),
    alertIds: (()=>{ try{return JSON.parse(r.alert_ids_json||'[]')}catch{return[]} })(),
    content: r.content || '',
    usage: (()=>{ try{return r.usage_json ? JSON.parse(r.usage_json) : null }catch{return null} })()
  }));
}

// Insert audit log
async function insertAudit(userId, email, event, detail) {
  await pool.query(
    'INSERT INTO audit_log (user_id, email, event, detail) VALUES ($1, $2, $3, $4)',
    [userId, email, event, detail]
  );
}

// Insert/update alert
async function upsertAlert(alertData) {
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
    alertData.id,
    alertData.token,
    alertData.title,
    alertData.description,
    alertData.severity,
    alertData.deadline,
    alertData.tags,
    alertData.further_info,
    alertData.source_type,
    alertData.source_url
  ]);
}

// Delete alert
async function deleteAlert(alertId) {
  await pool.query('DELETE FROM alerts WHERE id = $1', [alertId]);
}

// Allowed source types for alerts metadata
const SOURCE_TYPES = [
  'anonymous',
  'mainstream-media',
  'trusted-source',
  'social-media',
  'dev-team'
];

/* ---------------- Middleware ---------------- */
app.use(express.json());
app.use(cookieParser());

// Request logging only when DEBUG_HTTP=true
if (String(process.env.DEBUG_HTTP).toLowerCase() === 'true') {
  app.use((req, res, next) => {
    console.log(`📨 Incoming request: ${req.method} ${req.url} from ${req.ip}`);
    next();
  });
}

// Admin token + email helpers (reuse for admin-only APIs)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'ali@crypto-lifeguard.com,jordan@crypto-lifeguard.com,george@crypto-lifeguard.com')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);
function getAdminTokenFromReq(req){
  const auth = String(req.get('authorization') || req.get('x-admin-token') || '').trim();
  if (!auth) return '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return auth;
}
async function requireAdmin(req, res, next){
  // Option 1: Header token
  const token = getAdminTokenFromReq(req);
  if (ADMIN_TOKEN && token && token === ADMIN_TOKEN) return next();
  // Option 2: Logged-in user from session and email whitelist
  const sess = getSession(req);
  if (sess && sess.uid) {
    try{
      const u = await getUser(sess.uid);
      const email = (u && u.email ? String(u.email).toLowerCase() : '');
      if (email && ADMIN_EMAILS.includes(email)) return next();
    }catch(e){ /* ignore */ }
  }
  return res.status(401).json({ error: 'unauthorized' });
}
// Very small ephemeral in-memory session store
const sessions = new Map(); // sid -> { uid }
const oauthStates = new Map(); // state -> { timestamp, used }

// Load OAuth states from file on startup (for persistence across restarts)
const OAUTH_STATES_FILE = path.join(DATA_DIR, 'oauth_states.json');
try {
  if (fs.existsSync(OAUTH_STATES_FILE)) {
    const statesData = JSON.parse(fs.readFileSync(OAUTH_STATES_FILE, 'utf8'));
    const now = Date.now();
    const tenMinutesAgo = now - 10 * 60 * 1000;
    
    for (const [state, data] of Object.entries(statesData)) {
      if (data.timestamp > tenMinutesAgo && !data.used) {
        oauthStates.set(state, data);
      }
    }
    // OAuth states loaded from disk
  }
} catch (e) {
  console.warn('Failed to load OAuth states from disk:', e.message);
}

function saveOAuthStates() {
  try {
    const statesObj = Object.fromEntries(oauthStates.entries());
    fs.writeFileSync(OAUTH_STATES_FILE, JSON.stringify(statesObj, null, 2));
  } catch (e) {
    console.warn('Failed to save OAuth states to disk:', e.message);
  }
}

function setSession(res, data){
  const sid = crypto.randomBytes(16).toString('hex');
  sessions.set(sid, { ...data, t: Date.now() });
  res.cookie('sid', sid, { httpOnly:true, sameSite:'lax', maxAge: 365*24*3600*1000, ...(COOKIE_SECURE ? { secure: true } : {}) });
}
function getSession(req){
  const sid = req.cookies.sid; if (!sid) return null;
  const s = sessions.get(sid); return s || null;
}

// create anon user if missing cookie
app.use(async (req, res, next) => {
  let uid = req.cookies.uid;
  if (!uid) {
    uid = `usr_${Math.random().toString(36).slice(2,10)}`;
    res.cookie('uid', uid, { httpOnly: true, sameSite: 'lax', maxAge: 365*24*3600*1000, ...(COOKIE_SECURE ? { secure: true } : {}) });
  }
  req.uid = uid;
  try {
    await upsertUser(uid);
  } catch (err) {
    console.error('Error upserting user:', err);
  }
  next();
});

/* ---------------- Alerts store (file-backed) ---------------- */
function readJsonSafe(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function writeJsonSafe(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const ALERTS_PATH = path.join(DATA_DIR, 'alerts.json');
let alerts = readJsonSafe(ALERTS_PATH, [
  { 
    id:'seed-1', 
    token:'BTC', 
    title:'Wallet update recommended',
    description:'Upgrade to the latest client to ensure network compatibility.',
    severity:'info', 
    deadline:new Date(Date.now()+36*3600*1000).toISOString(),
    tags: ['community', 'news']
  },
  { 
    id:'seed-2', 
    token:'ETH', 
    title:'Validator maintenance window',
    description:'Possible brief latency. No action required for holders.',
    severity:'warning', 
    deadline:new Date(Date.now()+12*3600*1000).toISOString(),
    tags: ['community', 'fork']
  }
]);
function persistAlerts(){ writeJsonSafe(ALERTS_PATH, alerts); }
let usingDatabaseAlerts = false; // Track if we're using DB instead of JSON file

// Function to reload alerts from database into memory
async function reloadAlertsFromDatabase() {
  if (!usingDatabaseAlerts) return false;
  
  try {
    const { rows } = await pool.query('SELECT id, token, title, description, severity, deadline, tags, further_info, source_type, source_url FROM alerts');
    alerts = rows.map(r => ({
      id: r.id || `db_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      token: String(r.token || '').toUpperCase(),
      title: String(r.title || ''),
      description: String(r.description || ''),
      severity: ['critical','warning','info'].includes(r.severity) ? r.severity : 'info',
      deadline: new Date(r.deadline).toISOString(),
      tags: (() => { try{ const t = typeof r.tags === 'string' ? JSON.parse(r.tags) : r.tags; return Array.isArray(t) ? t : []; } catch { return []; } })(),
      further_info: String(r.further_info || ''),
      source_type: SOURCE_TYPES.includes(String(r.source_type||'')) ? String(r.source_type) : '',
      source_url: String(r.source_url || '')
    }));
    return true;
  } catch (e) {
    console.warn('Failed to reload alerts from database:', e.message);
    return false;
  }
}

// Prefer DB alerts if available (keeps start sequence consistent with restore-alerts.js)
(async () => {
  try {
    const { rows } = await pool.query('SELECT id, token, title, description, severity, deadline, tags, further_info, source_type, source_url FROM alerts');
    if (Array.isArray(rows) && rows.length > 0) {
      alerts = rows.map(r => ({
        id: r.id || `db_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
        token: String(r.token || '').toUpperCase(),
        title: String(r.title || ''),
        description: String(r.description || ''),
        severity: ['critical','warning','info'].includes(r.severity) ? r.severity : 'info',
        deadline: new Date(r.deadline).toISOString(),
        tags: (() => { try{ const t = typeof r.tags === 'string' ? JSON.parse(r.tags) : r.tags; return Array.isArray(t) ? t : []; } catch { return []; } })(),
        further_info: String(r.further_info || ''),
        source_type: SOURCE_TYPES.includes(String(r.source_type||'')) ? String(r.source_type) : '',
        source_url: String(r.source_url || '')
      }));
      usingDatabaseAlerts = true;
      // Alerts loaded from database - do NOT persist to JSON since DB is the master
    } else {
      // Using file-backed alerts
    }
  } catch (e) {
    console.warn('Failed to load alerts from DB; using file-backed alerts.json', e && e.message);
  }
})();

/* ---------------- Admin Info Endpoint ---------------- */
app.get('/admin/info', requireAdmin, async (req, res) => {
  try{
    const alertCountResult = await pool.query('SELECT COUNT(*) AS c FROM alerts');
    const userCountResult = await pool.query('SELECT COUNT(*) AS c FROM users');
    const prefsCountResult = await pool.query('SELECT COUNT(*) AS c FROM user_prefs');
    
    const alertCount = parseInt(alertCountResult.rows[0].c);
    const userCount = parseInt(userCountResult.rows[0].c);
    const prefsCount = parseInt(prefsCountResult.rows[0].c);
    
    res.json({
      dataDir: DATA_DIR,
      databaseUrl: DATABASE_URL ? 'configured' : 'not set',
      backupDir: BACKUP_DIR,
      restoreFromFile: RESTORE_FROM_FILE,
      counts: { alerts: alertCount, users: userCount, user_prefs: prefsCount },
      market: {
        provider: CMC_API_KEY ? 'cmc' : 'none',
        currency: MARKET_CURRENCY
      }
    });
  }catch(e){
    res.status(500).json({ error: 'failed', message: e && e.message });
  }
});

/* ---------------- User prefs API ---------------- */
app.get('/api/me', async (req, res) => {
  // If Google session exists, prefer that user id
  const sess = getSession(req);
  const effectiveUid = sess?.uid || req.uid;
  const urow = await getUser(effectiveUid);
  const emailLower = (urow && urow.email ? String(urow.email).toLowerCase() : '');
  const isAdmin = !!(emailLower && ADMIN_EMAILS.includes(emailLower));
  const row = await getPrefs(effectiveUid);
  if (!row) {
    // first-time defaults
    const payload = {
      userId: effectiveUid,
      watchlist: [],
      severity: ['critical','warning','info'],
      showAll: false,
      dismissed: [],
      currency: 'USD',
      loggedIn: !!sess,
      isAdmin,
      profile: urow ? { name: urow.name || '', email: urow.email || '', avatar: urow.avatar || '', username: urow.username || '' } : { name:'', email:'', avatar:'', username:'' }
    };
    await upsertPrefs(
      effectiveUid,
      JSON.stringify(payload.watchlist),
      JSON.stringify(payload.severity),
      payload.showAll ? 1 : 0,
      JSON.stringify(payload.dismissed),
      payload.currency
    );
    try { 
      await insertAudit(effectiveUid, (urow&&urow.email)||'', 'profile_init', JSON.stringify({ watchlist: payload.watchlist })); 
    } catch {}
    return res.json({ ...payload, userId: effectiveUid });
  }
  res.json({
    userId: effectiveUid,
    watchlist: JSON.parse(row.watchlist_json),
    severity: JSON.parse(row.severity_json),
    showAll: !!row.show_all,
    dismissed: JSON.parse(row.dismissed_json),
    currency: row.currency || 'USD',
    loggedIn: !!sess,
    isAdmin,
    profile: urow ? { name: urow.name || '', email: urow.email || '', avatar: urow.avatar || '', username: urow.username || '' } : { name:'', email:'', avatar:'', username:'' }
  });
});

// Set/update username
app.post('/api/me/username', async (req, res) => {
  const sess = getSession(req);
  const effectiveUid = sess?.uid || req.uid;
  const { username } = req.body || {};
  const val = String(username || '').trim();
  // validate: 3-20 chars, letters, numbers, underscore only; must start with a letter
  if (!/^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(val)) {
    return res.status(400).json({ ok:false, error:'invalid_username', rules:'3-20 chars, letters/numbers/underscore, start with a letter' });
  }
  // uniqueness (case-insensitive)
  const taken = await getUserByUsername(val);
  if (taken && taken.id !== effectiveUid) {
    return res.status(409).json({ ok:false, error:'taken' });
  }
  await setUsername(val, effectiveUid);
  try { 
    const urow = await getUser(effectiveUid); 
    await insertAudit(effectiveUid, (urow&&urow.email)||'', 'username_set', JSON.stringify({ username: val })); 
  } catch {}
  res.json({ ok:true, username: val });
});

// Set/update avatar (simple URL validation)
app.post('/api/me/avatar', async (req, res) => {
  const sess = getSession(req);
  const effectiveUid = sess?.uid || req.uid;
  const { url } = req.body || {};
  const val = String(url || '').trim();
  try{
    const u = new URL(val);
    if (u.protocol !== 'https:') throw new Error('https_required');
    if (val.length > 300) throw new Error('too_long');
  }catch(e){
    return res.status(400).json({ ok:false, error:'invalid_url' });
  }
  await setAvatar(val, effectiveUid);
  try { 
    const urow = await getUser(effectiveUid); 
    await insertAudit(effectiveUid, (urow&&urow.email)||'', 'avatar_set', JSON.stringify({ avatar: val.slice(0,120) })); 
  } catch {}
  res.json({ ok:true, avatar: val });
});

app.post('/api/me/prefs', async (req, res) => {
  const { watchlist = [], severity = ['critical','warning','info'], showAll = false, dismissed = [], currency = 'USD' } = req.body || {};
  const sess = getSession(req);
  const effectiveUid = sess?.uid || req.uid;
  
  // Validate currency code
  const validCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'INR', 'BRL'];
  const currencyCode = validCurrencies.includes(currency) ? currency : 'USD';
  
  await upsertPrefs(
    effectiveUid,
    JSON.stringify([...new Set(watchlist.map(s => String(s).toUpperCase()))]),
    JSON.stringify(severity),
    showAll ? 1 : 0,
    JSON.stringify(dismissed),
    currencyCode
  );
  try { 
    const urow = await getUser(effectiveUid); 
    await insertAudit(effectiveUid, (urow&&urow.email)||'', 'prefs_saved', JSON.stringify({ watchlistLen: (watchlist||[]).length })); 
  } catch {}
  res.json({ ok: true });
});

/* ---------------- Alerts API ---------------- */
app.get('/api/alerts', (_req, res) => res.json(alerts));
app.post('/api/alerts', requireAdmin, async (req, res) => {
  const { token, title, description, severity, deadline, tags, further_info, source_type, source_url } = req.body || {};
  if (!token || !title || !deadline) return res.status(400).json({ error:'token, title, deadline are required' });
  
  // Validate tags against known tag types
  const validTags = [
    'price-change', 'migration', 'hack', 'fork', 'scam',
    'airdrop', 'whale', 'news', 'community', 'exploit', 'privacy',
    'community-vote', 'token-unlocks'
  ];
  const sanitizedTags = Array.isArray(tags) 
    ? tags.filter(t => typeof t === 'string' && validTags.includes(t))
    : [];

  const finalSeverity = ['critical','warning','info'].includes(severity) ? severity : 'info';
  const finalTags = sanitizedTags.length > 0 ? sanitizedTags : JSON.parse(getDefaultTags(finalSeverity));
  
  // Validate source metadata
  const srcType = source_type && SOURCE_TYPES.includes(String(source_type)) ? String(source_type) : '';
  const srcUrl = source_url && /^https?:\/\//i.test(String(source_url)) ? String(source_url) : '';

  const item = {
    id:`a_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    token:String(token).toUpperCase(),
    title:String(title),
    description:String(description||''),
    severity: finalSeverity,
    deadline:new Date(deadline).toISOString(),
    tags: finalTags,
    further_info: String(further_info || ''),
    source_type: srcType,
    source_url: srcUrl
  };
  alerts.push(item);
  
  // Also insert into database if using DB-backed alerts
  if (usingDatabaseAlerts) {
    try {
      await upsertAlert({
        id: item.id,
        token: item.token,
        title: item.title,
        description: item.description,
        severity: item.severity,
        deadline: item.deadline,
        tags: JSON.stringify(item.tags),
        further_info: item.further_info,
        source_type: item.source_type,
        source_url: item.source_url
      });
      await reloadAlertsFromDatabase();
    } catch (dbError) {
      console.warn('Failed to insert individual alert into database:', dbError.message);
    }
  } else {
    persistAlerts();
  }
  
  res.status(201).json(item);
});

// Get a single alert (admin only for now)
app.get('/api/alerts/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const item = alerts.find(a => a.id === id);
  if (!item) return res.status(404).json({ error: 'not_found' });
  res.json(item);
});

// Update an alert (admin only)
app.put('/api/alerts/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const idx = alerts.findIndex(a => a.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not_found' });

  const payload = req.body || {};
  // Validate/normalize fields if present
  if (payload.token != null) {
    payload.token = String(payload.token).toUpperCase();
  }
  if (payload.severity != null) {
    const allowed = ['critical','warning','info'];
    if (!allowed.includes(payload.severity)) return res.status(400).json({ error:'invalid_severity' });
  }
  if (payload.deadline != null) {
    const iso = new Date(payload.deadline).toISOString();
    if (!iso || iso === 'Invalid Date') return res.status(400).json({ error:'invalid_deadline' });
    payload.deadline = iso;
  }
  if (payload.tags != null) {
    const validTags = [
      'price-change', 'migration', 'hack', 'fork', 'scam',
      'airdrop', 'whale', 'news', 'community', 'exploit', 'privacy',
      'community-vote', 'token-unlocks'
    ];
    const cleaned = Array.isArray(payload.tags)
      ? payload.tags.filter(t => typeof t === 'string' && validTags.includes(t))
      : [];
    payload.tags = cleaned;
  }
  if (payload.source_type != null) {
    const st = String(payload.source_type);
    if (st && !SOURCE_TYPES.includes(st)) return res.status(400).json({ error:'invalid_source_type' });
  }
  if (payload.source_url != null) {
    const su = String(payload.source_url);
    if (su && !/^https?:\/\//i.test(su)) return res.status(400).json({ error:'invalid_source_url' });
  }
  if (payload.further_info != null) {
    payload.further_info = String(payload.further_info);
  }
  // Apply changes
  const old = alerts[idx];
  const updated = { ...old, ...payload };
  alerts[idx] = updated;
  
  // Also update in database if using DB-backed alerts
  if (usingDatabaseAlerts) {
    try {
      await upsertAlert({
        id: updated.id,
        token: updated.token,
        title: updated.title,
        description: updated.description,
        severity: updated.severity,
        deadline: updated.deadline,
        tags: JSON.stringify(updated.tags),
        further_info: updated.further_info,
        source_type: updated.source_type,
        source_url: updated.source_url
      });
      await reloadAlertsFromDatabase();
    } catch (dbError) {
      console.warn('Failed to update alert in database:', dbError.message);
    }
  } else {
    persistAlerts();
  }
  
  res.json(updated);
});

// Delete an alert (admin only)
app.delete('/api/alerts/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const idx = alerts.findIndex(a => a.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not_found' });
  const removed = alerts.splice(idx, 1)[0];
  
  // Also delete from database if using DB-backed alerts
  if (usingDatabaseAlerts) {
    try {
      await deleteAlert(removed.id);
      await reloadAlertsFromDatabase();
    } catch (dbError) {
      console.warn('Failed to delete alert from database:', dbError.message);
    }
  } else {
    persistAlerts();
  }
  res.json({ ok:true, removedId: removed.id });
});

// Bulk create alerts (admin only)
app.post('/api/alerts/bulk', requireAdmin, async (req, res) => {
  const { alerts: alertsToCreate } = req.body || {};
  
  if (!Array.isArray(alertsToCreate) || alertsToCreate.length === 0) {
    return res.status(400).json({ error: 'alerts array is required and must not be empty' });
  }

  const validTags = [
    'price-change', 'migration', 'hack', 'fork', 'scam',
    'airdrop', 'whale', 'news', 'community', 'exploit', 'privacy',
    'community-vote', 'token-unlocks'
  ];

  const createdAlerts = [];
  const errors = [];

  for (let index = 0; index < alertsToCreate.length; index++) {
    const alertData = alertsToCreate[index];
    try {
      const { token, title, description, severity, deadline, tags, further_info, source_type, source_url } = alertData;
      
      // Validate required fields
      if (!token || !title || !deadline) {
        errors.push(`Alert ${index + 1}: token, title, deadline are required`);
        continue;
      }

      // Validate and normalize fields
      const finalSeverity = ['critical','warning','info'].includes(severity) ? severity : 'info';
      
      // Handle tags
      let finalTags;
      if (Array.isArray(tags)) {
        const sanitizedTags = tags.filter(t => typeof t === 'string' && validTags.includes(t));
        finalTags = sanitizedTags.length > 0 ? sanitizedTags : JSON.parse(getDefaultTags(finalSeverity));
      } else {
        finalTags = JSON.parse(getDefaultTags(finalSeverity));
      }

      // Validate source metadata
      const srcType = source_type && SOURCE_TYPES.includes(String(source_type)) ? String(source_type) : '';
      const srcUrl = source_url && /^https?:\/\//i.test(String(source_url)) ? String(source_url) : '';

      // Validate deadline
      const deadlineDate = new Date(deadline);
      if (isNaN(deadlineDate.getTime())) {
        errors.push(`Alert ${index + 1}: Invalid deadline format`);
        continue;
      }

      const item = {
        id: `a_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
        token: String(token).toUpperCase(),
        title: String(title),
        description: String(description || ''),
        severity: finalSeverity,
        deadline: deadlineDate.toISOString(),
        tags: finalTags,
        further_info: String(further_info || ''),
        source_type: srcType,
        source_url: srcUrl
      };

      alerts.push(item);
      
      // Also insert into database if we're using DB-backed alerts
      try {
        await upsertAlert({
          id: item.id,
          token: item.token,
          title: item.title,
          description: item.description,
          severity: item.severity,
          deadline: item.deadline,
          tags: JSON.stringify(item.tags),
          further_info: item.further_info,
          source_type: item.source_type,
          source_url: item.source_url
        });
      } catch (dbError) {
        console.warn('Failed to insert alert into database:', dbError.message);
      }
      
      createdAlerts.push(item);

    } catch (error) {
      errors.push(`Alert ${index + 1}: ${error.message}`);
    }
  }

  // Persist if any alerts were created (only to JSON if not using DB)
  if (createdAlerts.length > 0 && !usingDatabaseAlerts) {
    persistAlerts();
  }

  // Reload alerts from database to sync in-memory array
  if (createdAlerts.length > 0 && usingDatabaseAlerts) {
    await reloadAlertsFromDatabase();
  }

  const response = {
    imported: createdAlerts.length,
    errors: errors.length,
    total: alertsToCreate.length
  };

  if (errors.length > 0) {
    response.errorDetails = errors;
  }

  if (createdAlerts.length === 0) {
    return res.status(400).json({ ...response, error: 'No alerts could be created' });
  }

  res.status(201).json(response);
});

/* ---------------- Token Requests API ---------------- */
app.post('/api/token-requests', async (req, res) => {
  const sess = getSession(req);
  const effectiveUid = sess?.uid || req.uid;
  
  const { symbol, name, reason, website, marketCap } = req.body || {};
  
  // Validate required fields
  if (!symbol || !name || !reason) {
    return res.status(400).json({ 
      error: 'missing_fields', 
      message: 'Symbol, name, and reason are required' 
    });
  }
  
  // Validate symbol format
  const cleanSymbol = String(symbol).trim().toUpperCase();
  if (!/^[A-Z0-9]{1,10}$/.test(cleanSymbol)) {
    return res.status(400).json({ 
      error: 'invalid_symbol', 
      message: 'Symbol must be 1-10 characters, letters and numbers only' 
    });
  }
  
  // Validate lengths
  const cleanName = String(name).trim();
  const cleanReason = String(reason).trim();
  if (cleanName.length > 50) {
    return res.status(400).json({ 
      error: 'name_too_long', 
      message: 'Token name must be 50 characters or less' 
    });
  }
  if (cleanReason.length > 500) {
    return res.status(400).json({ 
      error: 'reason_too_long', 
      message: 'Reason must be 500 characters or less' 
    });
  }
  
  // Validate website URL if provided
  let cleanWebsite = '';
  if (website) {
    try {
      const url = new URL(String(website).trim());
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        cleanWebsite = url.href;
      }
    } catch (e) {
      return res.status(400).json({ 
        error: 'invalid_website', 
        message: 'Website must be a valid URL' 
      });
    }
  }
  
  // Check for duplicate recent submissions from this user
  const recentSubmissionsResult = await pool.query(`
    SELECT COUNT(*) as count FROM token_requests 
    WHERE user_id = $1 AND symbol = $2 AND submitted_at > NOW() - INTERVAL '24 hours'
  `, [effectiveUid, cleanSymbol]);
  
  const recentSubmissions = parseInt(recentSubmissionsResult.rows[0].count);
  
  if (recentSubmissions > 0) {
    return res.status(429).json({ 
      error: 'duplicate_request', 
      message: 'You have already submitted a request for this token in the last 24 hours' 
    });
  }
  
  try {
    // Insert token request
    const result = await pool.query(`
      INSERT INTO token_requests (user_id, symbol, name, reason, website, market_cap, submitted_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      effectiveUid,
      cleanSymbol,
      cleanName,
      cleanReason,
      cleanWebsite,
      String(marketCap || '').trim(),
      new Date().toISOString()
    ]);
    
    // Log audit event
    try { 
      const urow = await getUser(effectiveUid); 
      await insertAudit(
        effectiveUid, 
        (urow && urow.email) || '', 
        'token_request_submitted', 
        JSON.stringify({ symbol: cleanSymbol, name: cleanName })
      ); 
    } catch (auditError) {
      console.warn('Failed to log token request audit:', auditError.message);
    }
    
    res.status(201).json({ 
      success: true, 
      id: result.rows[0].id,
      message: 'Token request submitted successfully' 
    });
    
  } catch (error) {
    console.error('Error submitting token request:', error);
    res.status(500).json({ 
      error: 'submission_failed', 
      message: 'Failed to submit token request' 
    });
  }
});

// Get user's token requests (for potential future use)
app.get('/api/token-requests/mine', async (req, res) => {
  const sess = getSession(req);
  const effectiveUid = sess?.uid || req.uid;
  
  try {
    const result = await pool.query(`
      SELECT id, symbol, name, reason, website, market_cap, status, submitted_at, reviewed_at, notes
      FROM token_requests 
      WHERE user_id = $1 
      ORDER BY submitted_at DESC
    `, [effectiveUid]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching user token requests:', error);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// Admin endpoint to view all token requests
app.get('/api/admin/token-requests', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT tr.*, u.email, u.name as user_name
      FROM token_requests tr
      LEFT JOIN users u ON tr.user_id = u.id
      ORDER BY tr.submitted_at DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching admin token requests:', error);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

/* ---------------- Market (CoinMarketCap) ---------------- */
// Simple persistent cache for symbol->CMC id mappings
const CMC_MAP_FILE = path.join(DATA_DIR, 'cmc_symbol_map.json');
let cmcSymbolMap = readJsonSafe(CMC_MAP_FILE, {});
// Add a static seed for common symbols to reduce map calls
const CMC_STATIC_IDS = {
  BTC: 1, ETH: 1027, USDT: 825, USDC: 3408, BNB: 1839, SOL: 5426, XRP: 52, ADA: 2010,
  DOGE: 74, TRX: 1958, TON: 11419, DOT: 6636, MATIC: 3890, POL: 28321, LINK: 1975,
  UNI: 7083, AVAX: 5805, LTC: 2, BCH: 1831, BSV: 3602, ETC: 1321, XLM: 512, HBAR: 4642,
  APT: 21794, ARB: 11841, OP: 11840, SUI: 20947, NEAR: 6535, ICP: 8916, MKR: 1518,
  AAVE: 7278, COMP: 5692, SNX: 2586, CRV: 6538, BAL: 5728, YFI: 5864, ZEC: 1437,
  DASH: 131, EOS: 1765, FIL: 2280, VET: 3077, XTZ: 2011, KSM: 5034, GLMR: 6836
};

// In-memory cache for stats calls (60s cadence)
const cmcStatsCache = new Map(); // key -> { t, data }
const cmcOhlcvCache = new Map(); // key -> { t, data }
const CMC_STATS_TTL_MS = 60 * 1000;
const CMC_OHLCV_TTL_MS = 5 * 60 * 1000; // 5 minutes for OHLCV

// Fetch today's OHLCV data to get high/low
async function getCmcOhlcvData(ids, currency) {
  const cacheKey = `ohlcv:${ids.join(',')}:${currency}`;
  const hit = cmcOhlcvCache.get(cacheKey);
  if (hit && Date.now() - hit.t < CMC_OHLCV_TTL_MS) {
    return hit.data;
  }
  
  try {
    // Try OHLCV in USD since GBP conversion may be restricted on Hobbyist plan
    const params = new URLSearchParams({
      id: ids.join(','),
      convert: 'USD'  // Use USD for OHLCV to avoid 403 errors
    });
    const url = `https://pro-api.coinmarketcap.com/v2/cryptocurrency/ohlcv/latest?${params.toString()}`;
    const r = await fetch(url, { headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY } });
    
    if (!r.ok) {
      const errorText = await r.text();
      throw new Error(`OHLCV HTTP ${r.status}: ${errorText}`);
    }
    
    const j = await r.json();
    const data = j?.data || {};
    
    cmcOhlcvCache.set(cacheKey, { t: Date.now(), data });
    return data;
  } catch (e) {
    console.warn('CMC OHLCV API error:', e.message);
    return {};
  }
}

async function getCmcIdsForSymbols(symbols) {
  const ids = {};
  const missing = [];
  for (const sym of symbols) {
    const fromStatic = CMC_STATIC_IDS[sym];
    const fromCache = cmcSymbolMap[sym];
    if (fromStatic) { ids[sym] = fromStatic; continue; }
    if (fromCache) { ids[sym] = fromCache; continue; }
    missing.push(sym);
  }
  if (!missing.length || !CMC_API_KEY) return ids;
  try {
    // Fetch mapping for missing symbols and persist
    const url = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/map?symbol=' + encodeURIComponent(missing.join(','));
    const r = await fetch(url, { headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY } });
    if (r.ok) {
      const j = await r.json();
      const rows = Array.isArray(j?.data) ? j.data : [];
      rows.forEach(row => {
        const s = String(row.symbol || '').toUpperCase();
        if (s && row.id) { cmcSymbolMap[s] = row.id; ids[s] = row.id; }
      });
      // Persist to disk
      try { fs.writeFileSync(CMC_MAP_FILE, JSON.stringify(cmcSymbolMap, null, 2)); } catch {}
    }
  } catch {}
  return ids;
}

// Cache for token metadata (symbol + name)
let cachedTokenList = null;
let tokenListTimestamp = 0;
const TOKEN_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

app.get('/api/tokens', async (req, res) => {
  // Return cached list if valid
  if (cachedTokenList && (Date.now() - tokenListTimestamp < TOKEN_CACHE_TTL)) {
    return res.json({ tokens: cachedTokenList, cached: true });
  }

  const tokens = [];

  // If CMC API is configured, fetch comprehensive token list
  if (CMC_API_KEY) {
    try {
      // Fetch top 5000 tokens by market cap
      const url = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/map?limit=5000&sort=cmc_rank';
      const r = await fetch(url, { headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY } });
      if (r.ok) {
        const j = await r.json();
        const rows = Array.isArray(j?.data) ? j.data : [];
        rows.forEach(row => {
          const symbol = String(row.symbol || '').toUpperCase();
          const name = String(row.name || '').trim();
          if (symbol && name) {
            tokens.push({ symbol, name });
          }
        });
        
        // Cache the results
        cachedTokenList = tokens;
        tokenListTimestamp = Date.now();
        
        return res.json({ tokens, cached: false, provider: 'cmc' });
      }
    } catch (err) {
      console.error('Failed to fetch CMC token list:', err.message);
    }
  }

  // Fallback: Get unique tokens from database alerts
  try {
    const result = await pool.query(`
      SELECT DISTINCT token 
      FROM alerts 
      WHERE token IS NOT NULL 
      ORDER BY token
    `);
    
    result.rows.forEach(row => {
      const symbol = String(row.token || '').toUpperCase();
      if (symbol) {
        // Use symbol as name if we don't have CMC data
        tokens.push({ symbol, name: symbol });
      }
    });
    
    // Cache fallback results too
    cachedTokenList = tokens;
    tokenListTimestamp = Date.now();
    
    return res.json({ tokens, cached: false, provider: 'fallback' });
  } catch (err) {
    console.error('Failed to fetch tokens from database:', err.message);
    return res.status(500).json({ error: 'Failed to fetch token list' });
  }
});

app.get('/api/market/snapshot', async (req, res) => {
  const symbols = String(req.query.symbols||'').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
  const requestedCurrency = String(req.query.currency || MARKET_CURRENCY).toUpperCase();
  
  if (!symbols.length) return res.json({ items:[], note:'No symbols selected.', provider: CMC_API_KEY ? 'cmc' : 'none' });

  // Prefer CMC if configured
  if (CMC_API_KEY) {
    try{
      // Resolve CMC IDs for symbols
      const idsMap = await getCmcIdsForSymbols(symbols);
      const ids = symbols.map(s => idsMap[s]).filter(Boolean);
      if (!ids.length) return res.json({ items: symbols.map(s=>({ token:s, lastPrice:null, dayChangePct:null, change30mPct:null, error:'no-id' })), note: `CoinMarketCap quotes (~60s). No IDs found for requested symbols.`, provider: 'cmc' });

      const cacheKey = `stats:${ids.join(',')}:${requestedCurrency}`;
      const hit = cmcStatsCache.get(cacheKey);
      if (hit && Date.now() - hit.t < CMC_STATS_TTL_MS) {
        return res.json({ items: hit.data, note: `CoinMarketCap quotes (~60s) — ${requestedCurrency}` , provider: 'cmc' });
      }

      // Fetch quotes data (current price, volume, % changes)
      const params = new URLSearchParams({
        id: ids.join(','),
        convert: requestedCurrency
      });
      const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?${params.toString()}`;
      const r = await fetch(url, { headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const quotesData = j?.data || {};
      
      // OHLCV disabled due to CMC Hobbyist plan GBP conversion restrictions
      const ohlcvData = {};
      
      // Build items array keyed by symbol using quotes endpoint
      const cur = requestedCurrency;
      const items = symbols.map(sym => {
        const id = idsMap[sym];
        const row = quotesData[id] || null;
        if (!row) return { token: sym, lastPrice: null, dayChangePct: null, change30mPct: null, high24h: null, low24h: null, ath: null, atl: null, error: 'no-data' };
        
        const quote = row.quote?.[cur] || {};
        // OHLCV data not available on Hobbyist plan with GBP
        
        // Extract available fields 
        return {
          token: sym,
          lastPrice: quote.price ?? null,
          dayChangePct: typeof quote.percent_change_24h === 'number' ? quote.percent_change_24h : null,
          change1hPct: typeof quote.percent_change_1h === 'number' ? quote.percent_change_1h : null,
          change7dPct: typeof quote.percent_change_7d === 'number' ? quote.percent_change_7d : null,
          change30dPct: typeof quote.percent_change_30d === 'number' ? quote.percent_change_30d : null,
          change30mPct: null, // Not available in CMC API
          volume24h: typeof quote.volume_24h === 'number' ? quote.volume_24h : null,
          volumeChange24h: typeof quote.volume_change_24h === 'number' ? quote.volume_change_24h : null,
          marketCap: typeof quote.market_cap === 'number' ? quote.market_cap : null,
          high24h: null, // Not available 
          low24h: null,  // Not available
          ath: null,     // Would need price-performance-stats endpoint (premium)
          atl: null      // Would need price-performance-stats endpoint (premium)
        };
      });
      
      // Check if CMC returned any valid price data
      const hasValidData = items.some(item => item.lastPrice !== null && item.lastPrice !== undefined);
      
      if (hasValidData) {
        // Check if any tokens have null prices that we should backfill with CoinGecko
        const nullPriceSymbols = items.filter(item => item.lastPrice === null).map(item => item.token);
        
        if (nullPriceSymbols.length > 0 && COINGECKO_API_KEY) {
          // Try to backfill missing prices from CoinGecko
          try {
            const coinIds = [];
            const symbolToIdMap = {};
            
            for (const sym of nullPriceSymbols) {
              const coinId = await getCoinGeckoId(sym);
              if (coinId) {
                coinIds.push(coinId);
                symbolToIdMap[coinId] = sym;
              }
            }
            
            if (coinIds.length > 0) {
              const currencyLower = requestedCurrency.toLowerCase();
              const priceUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds.join(',')}&vs_currencies=${currencyLower}&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true&x_cg_demo_api_key=${COINGECKO_API_KEY}`;
              
              const priceResp = await fetch(priceUrl);
              if (priceResp.ok) {
                const priceData = await priceResp.json();
                
                // Update items with CoinGecko data for null prices
                items.forEach(item => {
                  if (item.lastPrice === null) {
                    const coinId = Object.keys(symbolToIdMap).find(id => symbolToIdMap[id] === item.token);
                    if (coinId && priceData[coinId]) {
                      const data = priceData[coinId];
                      item.lastPrice = data[currencyLower] ?? null;
                      item.dayChangePct = data[`${currencyLower}_24h_change`] ?? item.dayChangePct;
                      item.volume24h = data[`${currencyLower}_24h_vol`] ?? item.volume24h;
                      item.marketCap = data[`${currencyLower}_market_cap`] ?? item.marketCap;
                    }
                  }
                });
              }
            }
          } catch (e) {
            console.warn('CoinGecko backfill error:', e.message);
            // Continue with CMC data only
          }
        }
        
        cmcStatsCache.set(cacheKey, { t: Date.now(), data: items });
        return res.json({ items, note: `CoinMarketCap quotes (~60s) — ${requestedCurrency}`, provider: 'cmc+coingecko', currency: requestedCurrency });
      } else {
        // CMC returned no valid data, falling through to CoinGecko (this is expected for some tokens)
        // Fall through to CoinGecko fallback
      }
    }catch(e){
      console.warn('CMC API error:', e.message);
      // Fall through to CoinGecko fallback
    }
  }

  // Fallback to CoinGecko if CMC fails or not configured
  try {
    // Map symbols to CoinGecko IDs
    const coinIds = [];
    const symbolToIdMap = {};
    
    for (const sym of symbols) {
      const coinId = await getCoinGeckoId(sym);
      if (coinId) {
        coinIds.push(coinId);
        symbolToIdMap[coinId] = sym;
      }
    }
    
    if (!coinIds.length) {
      const items = symbols.map(s=>({ token:s, lastPrice:null, dayChangePct:null, change30mPct:null, error:'no-coingecko-id' }));
      return res.json({ items, note: 'No CoinGecko IDs found for requested symbols.', provider: 'coingecko', currency: requestedCurrency });
    }

    // Fetch price data from CoinGecko
    const currencyLower = requestedCurrency.toLowerCase();
    const priceUrl = COINGECKO_API_KEY
      ? `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds.join(',')}&vs_currencies=${currencyLower}&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true&x_cg_demo_api_key=${COINGECKO_API_KEY}`
      : `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds.join(',')}&vs_currencies=${currencyLower}&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`;
    
    const priceResp = await fetch(priceUrl);
    
    if (!priceResp.ok) {
      throw new Error(`CoinGecko HTTP ${priceResp.status}`);
    }
    
    const priceData = await priceResp.json();
    
    // Build items array
    const items = symbols.map(sym => {
      // Find the coin ID for this symbol
      const coinId = Object.keys(symbolToIdMap).find(id => symbolToIdMap[id] === sym);
      if (!coinId || !priceData[coinId]) {
        return { token: sym, lastPrice: null, dayChangePct: null, change30mPct: null, error: 'no-data' };
      }
      
      const data = priceData[coinId];
      const priceKey = currencyLower;
      const changeKey = `${currencyLower}_24h_change`;
      const volKey = `${currencyLower}_24h_vol`;
      const mcapKey = `${currencyLower}_market_cap`;
      
      return {
        token: sym,
        lastPrice: data[priceKey] ?? null,
        dayChangePct: data[changeKey] ?? null,
        change1hPct: null, // Not available in simple endpoint
        change7dPct: null,  // Not available in simple endpoint
        change30dPct: null, // Not available in simple endpoint
        change30mPct: null, // Not available
        volume24h: data[volKey] ?? null,
        volumeChange24h: null, // Not available
        marketCap: data[mcapKey] ?? null,
        high24h: null,
        low24h: null,
        ath: null,
        atl: null
      };
    });
    
    return res.json({ 
      items, 
      note: `CoinGecko prices (~60s) — ${requestedCurrency}`, 
      provider: 'coingecko', 
      currency: requestedCurrency 
    });
  } catch (e) {
    console.warn('CoinGecko API error:', e.message);
    const items = symbols.map(s=>({ token:s, lastPrice:null, dayChangePct:null, change30mPct:null, error:'coingecko-failed' }));
    return res.json({ items, note: `CoinGecko API error: ${e.message}`, provider: 'coingecko', currency: requestedCurrency });
  }
});

// Lightweight prices endpoint for ticker
app.get('/api/market/prices', async (req, res) => {
  const symbols = String(req.query.symbols||'').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
  const currency = String(req.query.currency || 'USD').toUpperCase();
  
  if (!symbols.length) return res.json({ prices: [] });

  try {
    // Reuse the snapshot logic but return simplified format
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const snapRes = await fetch(`${baseUrl}/api/market/snapshot?symbols=${encodeURIComponent(symbols.join(','))}&currency=${currency}`);
    const { items=[] } = (await snapRes.json()) || {};
    
    // Transform to ticker format
    const prices = items
      .filter(it => it.lastPrice !== null && it.lastPrice !== undefined)
      .map(it => ({
        symbol: it.token,
        price: it.lastPrice,
        change24h: it.dayChangePct || 0
      }));
    
    res.json({ prices, currency });
  } catch (error) {
    console.error('Error fetching ticker prices:', error);
    res.json({ prices: [], currency });
  }
});

app.get('/api/market/auto-alerts', async (req, res) => {
  const symbols = String(req.query.symbols||'').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const snapRes = await fetch(`${baseUrl}/api/market/snapshot?symbols=${encodeURIComponent(symbols.join(','))}`);
  const { items=[] } = (await snapRes.json()) || {};
  const now = Date.now(), mk = [];
  items.forEach(it=>{
    const pct = typeof it.dayChangePct==='number' ? it.dayChangePct : null;
    if (pct==null) return;
    let sev='info', title='Daily move';
    if (pct<=-10){ sev='critical'; title='Sharp drawdown'; }
    else if (pct<=-5){ sev='warning'; title='Drawdown'; }
    else if (pct>=8){ sev='warning'; title='Spike up'; }
    if (sev!=='info'){
      mk.push({ token:it.token, title, description:`EOD change ${pct.toFixed(2)}%. Review exposure if needed.`, severity:sev, deadline:new Date(now+6*3600*1000).toISOString() });
    }
  });
  res.json(mk);
});

// Expose market config (currency + symbol) for frontend formatting
function currencySymbol(code){
  const m = { USD: '$', GBP: '£', EUR: '€', JPY: '¥', AUD: 'A$', CAD: 'C$', CHF: 'CHF', CNY: '¥', HKD: 'HK$', SGD: 'S$', NZD: 'NZ$' };
  return m[String(code||'').toUpperCase()] || code || '$';
}
app.get('/api/market/config', (_req, res) => {
  const currencySymbols = {
    'USD': '$',
    'EUR': '€',
    'GBP': '£',
    'JPY': '¥',
    'AUD': 'A$',
    'CAD': 'C$',
    'CHF': 'CHF',
    'CNY': '¥',
    'INR': '₹',
    'BRL': 'R$'
  };
  
  res.json({ 
    currency: MARKET_CURRENCY, 
    symbol: currencySymbol(MARKET_CURRENCY),
    logokitApiKey: LOGOKIT_API_KEY,
    currencySymbols // Send all available currency symbols to frontend
  });
});

// --- Environment API ---------------------------------------------------------
app.get('/api/environment', (_req, res) => {
  const env = process.env.NODE_ENV || process.env.RAILWAY_ENVIRONMENT || 'production';
  res.json({ 
    environment: env.toLowerCase(),
    isProduction: env.toLowerCase() === 'production'
  });
});

// --- News API with Database Caching ------------------------------------------
app.post('/api/news', async (req, res) => {
  try {
    const { tokens } = req.body;
    
    // Default to popular tokens if none specified
    const tokensToFetch = Array.isArray(tokens) && tokens.length > 0 
      ? tokens 
      : ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'];
    
    // ALWAYS fetch fresh articles from CoinDesk RSS to add to database
    console.log('[News API] Fetching fresh articles from CoinDesk RSS...');
    let freshArticles = [];
    try {
      freshArticles = await fetchNewsFromCoinDesk(tokensToFetch);
      console.log(`[News API] Fetched ${freshArticles.length} fresh articles from CoinDesk`);
    } catch (error) {
      console.warn('[News API] Failed to fetch from CoinDesk RSS:', error.message);
    }
    
    // Add fresh CoinDesk articles to database cache
    let addedCount = 0;
    for (const article of freshArticles) {
      try {
        // Convert ISO date string to Unix timestamp (milliseconds)
        const dateValue = article.date || article.publishedAt;
        const timestamp = dateValue ? new Date(dateValue).getTime() : Date.now();
        
        await pool.query(`
          INSERT INTO news_cache 
          (article_url, title, text, source_name, date, sentiment, tickers, topics, image_url)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (article_url) DO UPDATE SET
            title = EXCLUDED.title,
            text = EXCLUDED.text,
            sentiment = EXCLUDED.sentiment,
            expires_at = NOW() + INTERVAL '120 days'
        `, [
          article.news_url || article.url,
          article.title,
          article.text || article.description || '',
          article.source_name,
          timestamp,
          article.sentiment || 'neutral',
          JSON.stringify(article.tickers || []),
          JSON.stringify(article.topics || []),
          article.image_url || null
        ]);
        addedCount++;
      } catch (dbError) {
        // Continue even if one article fails
        console.error('[News API] Failed to cache article:', article.title?.substring(0, 50), 'Error:', dbError.message);
      }
    }
    console.log(`[News API] Added/updated ${addedCount} articles in cache`);
    
    // Now get all cached articles (including the fresh ones we just added)
    let allNews = [];
    try {
      // Clean up any system messages that might have been cached
      await pool.query(`
        DELETE FROM news_cache 
        WHERE source_name IN ('System', 'CryptoNews API') 
        OR title LIKE '%Service Unavailable%'
        OR title LIKE '%No News Available%'
      `).catch(() => {});
      
      const cacheResult = await pool.query(`
        SELECT * FROM news_cache 
        WHERE expires_at > NOW()
        ORDER BY date DESC 
        LIMIT 50
      `);
      
      allNews = cacheResult.rows
        .map(row => ({
          title: row.title,
          text: row.text,
          source_name: row.source_name,
          date: row.date ? new Date(row.date).toISOString() : new Date().toISOString(), // Convert Unix timestamp to ISO string
          sentiment: row.sentiment,
          tickers: row.tickers ? JSON.parse(row.tickers) : [],
          topics: row.topics ? JSON.parse(row.topics) : [],
          news_url: row.article_url,
          image_url: row.image_url
        }))
        .filter(article => 
          article.source_name !== 'System' && 
          article.source_name !== 'CryptoNews API' &&
          !article.title.includes('Service Unavailable') &&
          !article.title.includes('No News Available')
        );
      
      console.log(`[News API] Returning ${allNews.length} total articles from cache`);
    } catch (cacheError) {
      console.warn('[News API] Cache read error, returning fresh articles only:', cacheError.message);
      allNews = freshArticles;
    }
    
    return res.json({ 
      news: allNews, 
      cached: false,
      freshArticlesAdded: addedCount,
      timestamp: new Date().toISOString() 
    });
    
  } catch (error) {
    console.error('[News API] Error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch news',
      message: error.message,
      news: []
    });
  }
});

// --- Admin News Management Endpoints -----------------------------------------

// GET /admin/news/cache - Get cached news with filters
app.get('/admin/news/cache', requireAdmin, async (req, res) => {
  try {
    const { token, days, page = 1, limit = 50 } = req.query;

    const params = [];
    let query = `
      SELECT * FROM news_cache
      WHERE expires_at > NOW()
    `;

    // Filter by token if specified (expects uppercase tickers stored in DB)
    const tokenFilter = typeof token === 'string' ? token.trim().toUpperCase() : '';
    if (tokenFilter) {
      params.push(JSON.stringify([tokenFilter]));
      query += ` AND tickers @> $${params.length}::jsonb`;
    }

    // Filter by age (days back from now)
    const parsedDays = days !== undefined ? Number.parseInt(String(days), 10) : NaN;
    if (!Number.isNaN(parsedDays) && parsedDays > 0) {
      const daysAgo = Date.now() - (parsedDays * 24 * 60 * 60 * 1000);
      params.push(daysAgo);
      query += ` AND date >= $${params.length}`;
    }

    query += ' ORDER BY date DESC';

    // Pagination
    const pageNum = Math.max(Number.parseInt(String(page), 10) || 1, 1);
    const limitNum = Math.min(Math.max(Number.parseInt(String(limit), 10) || 50, 1), 200);
    const offset = (pageNum - 1) * limitNum;

    params.push(limitNum);
    query += ` LIMIT $${params.length}`;
    params.push(offset);
    query += ` OFFSET $${params.length}`;

    const result = await pool.query(query, params);

    const articles = result.rows.map(row => ({
      article_url: row.article_url,
      title: row.title,
      text: row.text,
      source_name: row.source_name,
      date: row.date ? new Date(Number(row.date)).toISOString() : new Date().toISOString(),
      sentiment: row.sentiment,
      tickers: safeParseJson(row.tickers, []),
      topics: safeParseJson(row.topics, []),
      image_url: row.image_url,
      expires_at: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : null
    }));

    res.json(articles);
  } catch (error) {
    console.error('[Admin News] Failed to fetch cache:', error);
    res.status(500).json({ error: 'Failed to fetch news cache' });
  }
});

// GET /admin/news/stats - Get cache statistics
app.get('/admin/news/stats', requireAdmin, async (req, res) => {
  try {
    // Total cached articles
    const totalResult = await pool.query(`
      SELECT COUNT(*) as total FROM news_cache 
      WHERE expires_at > NOW()
    `);
    const totalCached = parseInt(totalResult.rows[0].total);
    
    // Articles by token
    const tokenResult = await pool.query(`
      SELECT jsonb_array_elements_text(tickers) as token, COUNT(*) as count
      FROM news_cache
      WHERE expires_at > NOW()
      GROUP BY token
      ORDER BY count DESC
      LIMIT 20
    `);
    const byToken = tokenResult.rows.map(row => ({
      token: row.token,
      count: parseInt(row.count)
    }));
    
    // Average age and date range
    const ageResult = await pool.query(`
      SELECT 
        MIN(date) as oldest,
        MAX(date) as newest,
        AVG(EXTRACT(EPOCH FROM NOW()) * 1000 - date) as avg_age_ms
      FROM news_cache
      WHERE expires_at > NOW()
    `);
    const ageData = ageResult.rows[0];
    
    // Expiring soon (within 7 days)
    const expiringResult = await pool.query(`
      SELECT COUNT(*) as count FROM news_cache 
      WHERE expires_at > NOW() 
      AND expires_at < NOW() + INTERVAL '7 days'
    `);
    const expiringSoon = parseInt(expiringResult.rows[0].count);
    
    res.json({
      totalCached,
      byToken,
      avgAgeSeconds: ageData.avg_age_ms ? Math.floor(ageData.avg_age_ms / 1000) : 0,
      expiringSoon,
      oldestArticle: ageData.oldest ? new Date(parseInt(ageData.oldest)).toISOString() : null,
      newestArticle: ageData.newest ? new Date(parseInt(ageData.newest)).toISOString() : null
    });
  } catch (error) {
    console.error('[Admin News] Failed to fetch stats:', error);
    res.status(500).json({ error: 'Failed to fetch news stats' });
  }
});

// PUT /admin/news/cache/:article_url - Update article
app.put('/admin/news/cache/:article_url', requireAdmin, async (req, res) => {
  try {
    const articleUrl = decodeURIComponent(req.params.article_url);
    const { title, text, sentiment, tickers } = req.body;
    const normalizedSentiment = typeof sentiment === 'string' ? sentiment.toLowerCase() : undefined;
    
    // Validate sentiment
    const validSentiments = ['positive', 'neutral', 'negative'];
    if (normalizedSentiment && !validSentiments.includes(normalizedSentiment)) {
      return res.status(400).json({ error: 'Invalid sentiment value' });
    }
    
    // Build update query dynamically
    const updates = [];
    const params = [];
    let paramCount = 1;
    
    if (title !== undefined) {
      params.push(title);
      updates.push(`title = $${paramCount++}`);
    }
    if (text !== undefined) {
      params.push(text);
      updates.push(`text = $${paramCount++}`);
    }
    if (normalizedSentiment !== undefined) {
      params.push(normalizedSentiment);
      updates.push(`sentiment = $${paramCount++}`);
    }
    if (tickers !== undefined) {
      params.push(JSON.stringify(normalizeTickers(tickers)));
      updates.push(`tickers = $${paramCount++}`);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    params.push(articleUrl);
    const query = `
      UPDATE news_cache 
      SET ${updates.join(', ')}
      WHERE article_url = $${paramCount}
      RETURNING *
    `;
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    const row = result.rows[0];
    res.json({
      article_url: row.article_url,
      title: row.title,
      text: row.text,
      source_name: row.source_name,
      date: row.date ? new Date(Number(row.date)).toISOString() : new Date().toISOString(),
      sentiment: row.sentiment,
      tickers: safeParseJson(row.tickers, []),
      topics: safeParseJson(row.topics, []),
      image_url: row.image_url,
      expires_at: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : null
    });
  } catch (error) {
    console.error('[Admin News] Failed to update article:', error);
    res.status(500).json({ error: 'Failed to update article' });
  }
});

// DELETE /admin/news/cache/:article_url - Delete article
app.delete('/admin/news/cache/:article_url', requireAdmin, async (req, res) => {
  try {
    const articleUrl = decodeURIComponent(req.params.article_url);
    
    const result = await pool.query(
      'DELETE FROM news_cache WHERE article_url = $1 RETURNING article_url',
      [articleUrl]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    res.json({ success: true, article_url: articleUrl });
  } catch (error) {
    console.error('[Admin News] Failed to delete article:', error);
    res.status(500).json({ error: 'Failed to delete article' });
  }
});

// POST /admin/news/refresh - Force fetch fresh articles
app.post('/admin/news/refresh', requireAdmin, async (req, res) => {
  try {
    const { tokens } = req.body;
    const tokensToFetch = Array.isArray(tokens) && tokens.length > 0 
      ? tokens 
      : ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'];
    
    console.log('[Admin News Refresh] Fetching articles for tokens:', tokensToFetch);
    
    const freshArticles = await fetchNewsFromCoinDesk(tokensToFetch);
    console.log(`[Admin News Refresh] Fetched ${freshArticles.length} articles`);
    
    let addedCount = 0;
    let updatedCount = 0;
    
    for (const article of freshArticles) {
      try {
        const dateValue = article.date || article.publishedAt;
        const timestamp = dateValue ? new Date(dateValue).getTime() : Date.now();
        
        const result = await pool.query(`
          INSERT INTO news_cache 
          (article_url, title, text, source_name, date, sentiment, tickers, topics, image_url)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (article_url) DO UPDATE SET
            title = EXCLUDED.title,
            text = EXCLUDED.text,
            sentiment = EXCLUDED.sentiment,
            expires_at = NOW() + INTERVAL '120 days'
          RETURNING (xmax = 0) AS inserted
        `, [
          article.news_url || article.url,
          article.title,
          article.text || article.description || '',
          article.source_name,
          timestamp,
          article.sentiment || 'neutral',
          JSON.stringify(article.tickers || []),
          JSON.stringify(article.topics || []),
          article.image_url || null
        ]);
        
        if (result.rows[0].inserted) {
          addedCount++;
        } else {
          updatedCount++;
        }
      } catch (dbError) {
        console.error('[Admin News Refresh] Failed to cache article:', article.title?.substring(0, 50), dbError.message);
      }
    }
    
    console.log(`[Admin News Refresh] Added ${addedCount}, updated ${updatedCount}`);
    
    res.json({ 
      added: addedCount, 
      updated: updatedCount,
      total: freshArticles.length
    });
  } catch (error) {
    console.error('[Admin News Refresh] Error:', error);
    res.status(500).json({ error: 'Failed to refresh news cache' });
  }
});

// POST /admin/news/cache/bulk-delete - Bulk delete articles
app.post('/admin/news/cache/bulk-delete', requireAdmin, async (req, res) => {
  try {
    const { urls } = req.body;
    
    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'urls must be a non-empty array' });
    }
    
    const normalizedUrls = urls
      .map(u => {
        try {
          return decodeURIComponent(u);
        } catch {
          return u;
        }
      })
      .filter(Boolean);

    if (!normalizedUrls.length) {
      return res.status(400).json({ error: 'No valid article URLs provided' });
    }

    const result = await pool.query(
      'DELETE FROM news_cache WHERE article_url = ANY($1) RETURNING article_url',
      [normalizedUrls]
    );
    
    res.json({ 
      deleted: result.rows.length,
      urls: result.rows.map(row => row.article_url)
    });
  } catch (error) {
    console.error('[Admin News] Failed to bulk delete:', error);
    res.status(500).json({ error: 'Failed to bulk delete articles' });
  }
});

// --- AI Summary API ----------------------------------------------------------
app.post('/api/summary/generate', async (req, res) => {
  try {
    // Require Google login to generate summaries
    const sess = getSession(req);
    if (!sess || !sess.uid) {
      return res.status(401).json({ error: 'Authentication required. Please sign in with Google to generate summaries.' });
    }

    const { alerts, tokens, sevFilter, tagFilter, model } = req.body;
    
    if (!alerts || !Array.isArray(alerts)) {
      return res.status(400).json({ error: 'Invalid alerts data' });
    }

    console.log(`[Summary] Requested model: "${model}" (type: ${typeof model})`);

    // Generate AI summary using available API
    const summary = await generateAISummary(alerts, tokens || [], sevFilter || [], tagFilter || [], model);
    const news = await fetchNewsForTokens(tokens || []);
    
    // Persist for logged-in users
    try {
      const alertIds = (alerts || []).map(a => a.id).filter(Boolean);
      await insertUserSummary(sess.uid, {
        model: summary.model,
        tokens: tokens || [],
        sevFilter: sevFilter || [],
        tagFilter: tagFilter || [],
        alertIds,
        content: summary.content,
        usage: summary.usage || null
      });
    } catch (persistErr) {
      console.warn('Failed to persist user summary (non-fatal):', persistErr && persistErr.message);
    }

    res.json({ 
      summary: summary.content,
      model: summary.model,
      usage: summary.usage,
      alertCount: summary.alertCount,
      tokenCount: summary.tokenCount,
      news: news,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('AI Summary generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate summary',
      fallback: generateFallbackSummary(req.body.alerts || [], req.body.tokens || [])
    });
  }
});

// Recent summaries for logged-in users only
app.get('/api/summary/recent', async (req, res) => {
  try {
    const sess = getSession(req);
    if (!sess || !sess.uid) return res.json({ summaries: [] }); // Not logged in → nothing
    const lim = req.query.limit ? parseInt(String(req.query.limit)) : 10;
    const items = await getRecentUserSummaries(sess.uid, lim);
    res.json({ summaries: items });
  } catch (e) {
    console.error('Failed to fetch recent summaries:', e && e.message);
    res.status(500).json({ summaries: [] });
  }
});

// Debug endpoint to test CoinDesk RSS directly (bypasses cache)
app.get('/debug/coindesk-test', async (req, res) => {
  try {
    const tokens = ['BTC', 'ETH', 'SOL'];
    console.log('[Debug] Testing CoinDesk RSS feed directly...');
    
    const articles = await fetchNewsFromCoinDesk(tokens);
    
    res.json({
      success: true,
      provider: 'CoinDesk RSS',
      articleCount: articles.length,
      tokens: tokens,
      articles: articles.slice(0, 5), // Return first 5 for preview
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Debug] CoinDesk test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// AI Summary generation function
async function generateAISummary(alerts, tokens, sevFilter, tagFilter, selectedModel) {
  // Prepare alerts data for AI analysis
  const alertsData = alerts.map(alert => ({
    token: alert.token,
    title: alert.title,
    description: alert.description,
    severity: alert.severity,
    deadline: alert.deadline,
    tags: Array.isArray(alert.tags) ? alert.tags : (alert.tags ? JSON.parse(alert.tags) : [])
  }));

  // Fetch recent news for context
  const newsData = await fetchNewsForTokens(tokens);
  const newsContext = newsData.length > 0 ? 
    `\n\nRecent news (${newsData.length} articles):\n${newsData.map(n => `- ${n.title} (${n.sentiment || 'neutral'}) [${n.source_name || n.source?.name || 'Unknown'}]`).join('\n')}` : 
    '\n\nNo recent news available for these tokens.';

  const prompt = `You are a crypto portfolio assistant. Analyze these alerts and recent news to provide a comprehensive summary for a user monitoring these tokens: ${tokens.join(', ')}.

Current alerts (${alerts.length} total):
${alertsData.map(a => `- ${a.token}: ${a.title} (${a.severity}) - ${a.description} [Deadline: ${a.deadline}]`).join('\n')}${newsContext}

Please provide:
1. **Executive Summary** (2-3 sentences): Key takeaways and urgent actions needed considering both alerts and recent news
2. **Critical Actions** (if any): Time-sensitive items requiring immediate attention  
3. **Token-Specific Insights**: Brief analysis for each token combining alert data and news sentiment
4. **News Highlights** (if available): Key developments from recent news that impact your tokens
5. **Timeline Overview**: Key dates and deadlines to watch

Keep it concise, actionable, and focused on portfolio management decisions.`;

  // Respect user-selected model if provided, default to OpenAI
  // 'auto' is treated as 'openai' for consistency
  const prefer = (selectedModel||'openai').toLowerCase();
  const normalizedPrefer = prefer === 'auto' ? 'openai' : prefer;
  
  console.log(`[generateAISummary] selectedModel="${selectedModel}", prefer="${prefer}", normalized="${normalizedPrefer}"`);

  // Helper to try providers in order
  async function tryOpenAI(){
    if (!OPENAI_API_KEY) throw new Error('no-openai');
    return await callOpenAI(prompt);
  }
  async function tryAnthropic(){
       if (!ANTHROPIC_API_KEY) throw new Error('no-anthropic');
    return await callAnthropic(prompt);
  }
  async function tryXAI(){
    if (!XAI_API_KEY) throw new Error('no-xai');
    return await callXAI(prompt);
  }

  try {
    if (normalizedPrefer === 'xai' || normalizedPrefer === 'grok') return {
      ...(await tryXAI()), alertCount: alerts.length, tokenCount: tokens.length
    };
    if (normalizedPrefer === 'openai') return {
      ...(await tryOpenAI()), alertCount: alerts.length, tokenCount: tokens.length
    };
    if (normalizedPrefer === 'anthropic') return {
      ...(await tryAnthropic()), alertCount: alerts.length, tokenCount: tokens.length
    };
  } catch (e) {
    console.warn('Preferred model failed, falling back:', e.message);
  }

  // Auto order: OpenAI -> Anthropic -> xAI
  if (OPENAI_API_KEY) {
    try {
      const response = await callOpenAI(prompt);
      return {
        content: response.content,
        model: response.model,
        usage: response.usage,
        alertCount: alerts.length,
        tokenCount: tokens.length
      };
    } catch (error) {
      console.error('OpenAI failed, using Anthropic:', error.message);
    }
  }

  if (ANTHROPIC_API_KEY) {
    try {
      const response = await callAnthropic(prompt);
      return {
        content: response.content,
        model: response.model,
        usage: response.usage,
        alertCount: alerts.length,
        tokenCount: tokens.length
      };
    } catch (error) {
      console.error('Anthropic API error:', error.message);
    }
  }

  if (XAI_API_KEY) {
    try {
      const response = await callXAI(prompt);
      return {
        content: response.content,
        model: response.model,
        usage: response.usage,
        alertCount: alerts.length,
        tokenCount: tokens.length
      };
    } catch (error) {
      console.error('xAI API error:', error.message);
    }
  }

  // Fallback to rule-based summary
  return {
    content: generateFallbackSummary(alerts, tokens),
    model: 'Fallback (Rule-based)',
    usage: null,
    alertCount: alerts.length,
    tokenCount: tokens.length
  };
}

// OpenAI API call
async function callOpenAI(prompt) {
  const model = 'gpt-4o'; // Use the latest GPT-4o instead of o1-pro
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.3
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content.trim(),
    model: `OpenAI ${model}`,
    usage: data.usage
  };
}

// Anthropic API call  
async function callAnthropic(prompt) {
  const model = 'claude-3-5-sonnet-20241022';
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: model, // High-quality model for best analysis
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.content[0].text.trim(),
    model: `Anthropic ${model}`,
    usage: data.usage
  };
}

// xAI API call (Grok)
async function callXAI(prompt){
  const model = 'grok-2-latest';
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${XAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.3
    })
  });
  if (!response.ok) throw new Error(`xAI API error: ${response.status}`);
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  return {
    content: content.trim(),
    model: `xAI ${model}`,
    usage: data.usage || null
  };
}

// Fallback summary generation (rule-based)
function generateFallbackSummary(alerts, tokens) {
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;
  const infoCount = alerts.filter(a => a.severity === 'info').length;
  
  const upcomingDeadlines = alerts
    .filter(a => new Date(a.deadline) > new Date())
    .sort((a, b) => new Date(a.deadline) - new Date(a.deadline))
    .slice(0, 3);

  const tokenSummary = tokens.map(token => {
    const tokenAlerts = alerts.filter(a => a.token === token);
    const urgent = tokenAlerts.filter(a => a.severity === 'critical').length;
    return `${token}: ${tokenAlerts.length} alert${tokenAlerts.length !== 1 ? 's' : ''}${urgent ? ` (${urgent} critical)` : ''}`;
  }).join(', ');

  return `**Executive Summary**
You have ${alerts.length} active alerts across ${tokens.length} tokens. ${criticalCount} critical items require immediate attention.

**Critical Actions**
${criticalCount > 0 ? `${criticalCount} critical alerts need immediate review.` : 'No critical actions required at this time.'}

**Token-Specific Insights**
${tokenSummary || 'No specific token insights available.'}

**Timeline Overview**
${upcomingDeadlines.length > 0 ? 
  upcomingDeadlines.map(a => `${a.token}: ${a.title} by ${new Date(a.deadline).toLocaleDateString()}`).join('\n') :
  'No upcoming deadlines in the near term.'
}

*Note: This is an automated summary. AI-powered analysis requires API configuration.*`;
}

// News fetching function using CryptoNews API (paid service)
async function fetchNewsForTokens(tokens) {
  try {
    if (tokens.length === 0) {
      tokens = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'];
    }
    
    // Try CoinDesk RSS (free, always available) first, then CryptoNews API as fallback
    const tryProvidersInOrder = ['coindesk', 'cryptonews'];
    
    let aggregated = [];
    for (const provider of tryProvidersInOrder) {
      try {
        if (provider === 'coindesk') {
          const cd = await fetchNewsFromCoinDesk(tokens);
          aggregated.push(...cd);
        } else if (provider === 'cryptonews') {
          const cn = await fetchNewsFromCryptoNews(tokens);
          aggregated.push(...cn);
        }
      } catch (e) {
        console.warn(`[News] Provider ${provider} failed:`, e && e.message);
      }
      // If we already have a decent set (>=20), stop early
      if (aggregated.length >= 20) break;
    }
    
    if (aggregated.length > 0) {
      // Deduplicate by title + url and sort by date desc
      const seen = new Set();
      const uniq = [];
      for (const a of aggregated) {
        const key = `${a.title}::${a.news_url || a.url || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        uniq.push(a);
      }
      return uniq
        .sort((a, b) => new Date(b.publishedAt || b.date) - new Date(a.publishedAt || a.date))
        .slice(0, 30);
    }
    
    // If no articles found from any provider, return informative message
    return [{
      title: "No News Available",
      description: "No recent cryptocurrency news found for your selected tokens. Try adding more tokens to your watchlist.",
      text: "No recent cryptocurrency news found for your selected tokens. Try adding more tokens to your watchlist.",
      url: "#",
      news_url: "#",
      publishedAt: new Date().toISOString(),
      date: new Date().toISOString(),
      source: { name: "System" },
      source_name: "System",
      sentiment: "neutral",
      tickers: tokens,
      image_url: null
    }];
    
  } catch (error) {
    console.error('News API error:', error.message);
    
    return [{
      title: "News Service Temporarily Unavailable",
      description: "Unable to load news at this time. Please try again later.",
      text: "Unable to load news at this time. Please try again later.",
      url: "#",
      news_url: "#",
      publishedAt: new Date().toISOString(),
      date: new Date().toISOString(),
      source: { name: "System" },
      source_name: "System",
      sentiment: "neutral",
      tickers: [],
      image_url: null
    }];
  }
}

// Fetch news from CoinDesk RSS feed (free, public)
async function fetchNewsFromCoinDesk(tokens) {
  try {
    console.log('[News] Fetching CoinDesk RSS feed...');
    // CoinDesk provides a free public RSS feed - no API key required
    const response = await fetch('https://www.coindesk.com/arc/outboundfeeds/rss/', {
      headers: {
        'User-Agent': 'CryptoLifeguard/1.0'
      },
      redirect: 'follow' // Explicitly follow redirects (CoinDesk RSS redirects)
    });

    console.log(`[News] CoinDesk RSS response status: ${response.status}`);
    
    if (!response.ok) {
      console.warn(`[News] CoinDesk RSS feed failed with status ${response.status}`);
      return [];
    }

    const xmlText = await response.text();
    console.log(`[News] CoinDesk RSS response length: ${xmlText.length} bytes`);
    
    // Parse RSS XML to extract articles
    const articles = parseRSSFeed(xmlText, tokens);
    
    console.log(`[News] CoinDesk RSS: fetched ${articles.length} articles`);
    return articles;
    
  } catch (error) {
    console.error('[News] Error fetching from CoinDesk RSS:', error.message);
    return [];
  }
}

// Simple RSS parser for CoinDesk feed
function parseRSSFeed(xmlText, tokens) {
  const articles = [];
  
  try {
    // Extract items from RSS feed
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const items = xmlText.match(itemRegex) || [];
    
    for (const item of items.slice(0, 30)) {
      // Extract fields
      const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || 
                   item.match(/<title>(.*?)<\/title>/)?.[1] || '';
      const link = item.match(/<link>(.*?)<\/link>/)?.[1] || '';
      const description = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] || 
                         item.match(/<description>(.*?)<\/description>/)?.[1] || '';
      const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
      
      // Check if article mentions any of the tracked tokens
      const articleText = `${title} ${description}`.toUpperCase();
      const relevantTokens = tokens.filter(token => 
        articleText.includes(token.toUpperCase()) ||
        articleText.includes(`BITCOIN`) && token === 'BTC' ||
        articleText.includes(`ETHEREUM`) && token === 'ETH'
      );
      
      // Only include if relevant to at least one token (or include all if no tokens specified)
      if (tokens.length === 0 || relevantTokens.length > 0) {
        articles.push({
          title: title.trim(),
          text: description.replace(/<[^>]*>/g, '').trim(), // Strip HTML tags
          source_name: 'CoinDesk',
          date: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
          sentiment: 'neutral',
          tickers: relevantTokens.length > 0 ? relevantTokens : tokens,
          news_url: link,
          image_url: null
        });
      }
    }
    
  } catch (parseError) {
    console.error('[News] RSS parsing error:', parseError.message);
  }
  
  return articles;
}

// Fetch news from CryptoNews API
async function fetchNewsFromCryptoNews(tokens) {
  // Get CryptoNews API key
  const cryptoNewsApiKey = (
    process.env.NEWSAPI_KEY
    || process.env.NEWS_API
    || process.env.CRYPTONEWS_API_KEY
    || process.env.CRYPTO_NEWS_API_KEY
  );
  // Validate API key
  const invalidKeys = ['undefined', 'null', '', 'fs', 'your-key-here', 'xxx'];
  if (!cryptoNewsApiKey || invalidKeys.includes(String(cryptoNewsApiKey).toLowerCase().trim())) {
    return [];
  }

  const allArticles = [];
  let ipBlacklisted = false;
  const itemsPerToken = Math.max(5, Math.ceil(20 / Math.max(1, tokens.length)));

  for (const token of (tokens.length ? tokens.slice(0, 8) : ['BTC','ETH'])) {
    try {
      const url = `https://cryptonews-api.com/api/v1?tickers=${token}&items=${itemsPerToken}&page=1&token=${cryptoNewsApiKey}`;
      const response = await fetch(url, { 
        timeout: 10000,
        headers: { 'User-Agent': 'CryptoLifeguard/1.0' }
      });
      console.log(`[News] CryptoNews ${token} -> ${response.status}`);
      if (response.ok) {
        const data = await response.json();
        if (data.data && Array.isArray(data.data) && data.data.length > 0) {
          const tokenArticles = data.data.map(article => ({
            title: article.title || 'No title available',
            description: article.text || article.description || 'No description available',
            text: article.text || article.description || '',
            url: article.news_url || article.url || '#',
            news_url: article.news_url || article.url || '#',
            publishedAt: article.date || new Date().toISOString(),
            date: article.date || new Date().toISOString(),
            source: { name: article.source_name || article.source || 'Unknown' },
            source_name: article.source_name || article.source || 'Unknown',
            sentiment: article.sentiment || 'neutral',
            tickers: article.tickers || [token],
            token,
            image_url: article.image_url || null
          }));
          allArticles.push(...tokenArticles);
        }
      } else {
        const errorText = await response.text();
        console.error(`[News] CryptoNews error for ${token} (${response.status}):`, errorText.substring(0, 200));
        if (response.status === 403) {
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.message && errorData.message.includes('blacklisted')) {
              ipBlacklisted = true;
              break;
            }
          } catch {}
        }
      }
      await new Promise(resolve => setTimeout(resolve, 150));
    } catch (tokenError) {
      console.error(`[News] CryptoNews exception for ${token}:`, tokenError.message);
    }
  }

  if (ipBlacklisted) {
    console.error('CryptoNews API: IP blacklisted');
    return [];
  }
  return allArticles;
}

// --- CryptoPanic config ------------------------------------------------------
const CP_PLAN   = process.env.CRYPTOPANIC_PLAN || 'developer';
const CP_TOKEN  = process.env.CRYPTOPANIC_TOKEN || '';
const CP_PUBLIC = (process.env.CRYPTOPANIC_PUBLIC || 'true') === 'true';

// 90s in-memory cache to keep under rate limits
const cpCache = new Map(); // key -> { t:number, data:any }
const CP_TTL_MS = 90 * 1000;

async function fetchJson(url, opts={}) {
  const r = await fetch(url, { ...opts, headers: { ...(opts.headers||{}) } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}
function cacheGet(key){
  const hit = cpCache.get(key);
  if (hit && Date.now() - hit.t < CP_TTL_MS) return hit.data;
  return null;
}
function cacheSet(key, data){ cpCache.set(key, { t: Date.now(), data }); }

// Map CryptoPanic post -> our alert
function mapPostToAlert(p){
  const token = (p.instruments?.[0]?.code || '').toUpperCase() || 'BTC';
  const title = p.title || 'News';
  const descBits = [];
  if (p.source?.title) descBits.push(p.source.title);
  if (p.source?.domain) descBits.push(p.source.domain);
  const description = [p.description || '', descBits.join(' • ')].filter(Boolean).join(' — ');

  // severity from panic_score / filter
  const ps = typeof p.panic_score === 'number' ? p.panic_score : null;
  let severity = 'info';
  if (ps !== null && ps >= 70) severity = 'critical';
  else if (ps !== null && ps >= 40) severity = 'warning';
  if (p.filter === 'important') severity = 'critical';
  if (p.filter === 'hot' && severity === 'info') severity = 'warning';

  // deadline: published_at + 24h (news relevance window)
  const base = new Date(p.published_at || p.created_at || Date.now()).getTime();
  const deadline = new Date(base + 24*3600*1000).toISOString();

  return {
    id: `cp_${p.id}`,
    token, title, description, severity, deadline
  };
}

/* ---------------- Environment Debug Endpoint ---------------- */
app.get('/debug/env', requireAdmin, (req, res) => {
  res.json({
    NODE_ENV: process.env.NODE_ENV || 'not_set',
    CMC_API_KEY_SET: !!CMC_API_KEY,
    CMC_API_KEY_LENGTH: CMC_API_KEY ? CMC_API_KEY.length : 0,
    CMC_API_KEY_FIRST_8: CMC_API_KEY ? CMC_API_KEY.substring(0, 8) : 'not_set',
    NEWS_API_KEY_SET: !!(process.env.NEWSAPI_KEY || process.env.NEWS_API || process.env.CRYPTONEWS_API_KEY || process.env.CRYPTO_NEWS_API_KEY),
    NEWS_API_KEY_PREFIX: (process.env.NEWSAPI_KEY || process.env.NEWS_API || process.env.CRYPTONEWS_API_KEY || process.env.CRYPTO_NEWS_API_KEY)
      ? (process.env.NEWSAPI_KEY || process.env.NEWS_API || process.env.CRYPTONEWS_API_KEY || process.env.CRYPTO_NEWS_API_KEY).slice(0, 8)
      : 'not_set',
    COINDESK_KEY_SET: !!(process.env.COINDESK || process.env.COINDESK_API_KEY),
    COINDESK_KEY_PREFIX: (process.env.COINDESK || process.env.COINDESK_API_KEY)
      ? (process.env.COINDESK || process.env.COINDESK_API_KEY).slice(0, 8)
      : 'not_set',
    MARKET_CURRENCY_RESOLVED: MARKET_CURRENCY,
    MARKET_CURRENCY_RAW: process.env.MARKET_CURRENCY || 'not_set_defaulting_to_GBP',
    RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT || 'not_set',
    SERVER_LOGIC_PROVIDER: CMC_API_KEY ? 'cmc' : 'none'
  });
});

// OAuth debug to verify redirect URI & client configuration
app.get('/debug/oauth', requireAdmin, (req, res) => {
  const base = getBaseUrl(req);
  const redirectUri = `${String(base||'').replace(/\/+$/,'')}/auth/google/callback`;
  res.json({
    base,
    redirectUri,
    hasBaseEnv: !!BASE_URL,
    GOOGLE_CLIENT_ID_PRESENT: !!GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_ID_PREFIX: GOOGLE_CLIENT_ID ? GOOGLE_CLIENT_ID.slice(0,16) : null
  });
});

/* ---------------- Health + static SPA ---------------- */
app.get('/healthz', (_req,res)=>res.json({ ok:true }));

// Debug endpoint to check environment configuration (no auth required)
app.get('/api/debug/env-check', (_req, res) => {
  res.json({
    adminTokenSet: !!process.env.ADMIN_TOKEN,
    adminEmailsSet: !!process.env.ADMIN_EMAILS,
    adminEmailsCount: ADMIN_EMAILS.length,
    googleOAuthConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Debug endpoint to check API configuration
app.get('/api/debug/config', (_req, res) => {
  const newsKey = process.env.NEWSAPI_KEY || process.env.NEWS_API || process.env.CRYPTONEWS_API_KEY || process.env.CRYPTO_NEWS_API_KEY;
  const cdKey = process.env.COINDESK || process.env.COINDESK_API_KEY || null;
  res.json({
    newsApiConfigured: !!newsKey,
    newsApiKeyLength: newsKey ? newsKey.length : 0,
    newsApiKeyPreview: newsKey ? `${newsKey.substring(0, 8)}...` : 'NOT SET',
    coindeskConfigured: !!cdKey,
    coindeskKeyLength: cdKey ? cdKey.length : 0,
    coindeskKeyPreview: cdKey ? `${cdKey.substring(0, 8)}...` : 'NOT SET',
    envVarsChecked: ['NEWSAPI_KEY', 'NEWS_API', 'CRYPTONEWS_API_KEY', 'CRYPTO_NEWS_API_KEY', 'COINDESK', 'COINDESK_API_KEY', 'COINDESK_API_URL'],
    nodeVersion: process.version,
    timestamp: new Date().toISOString()
  });
});

// Readiness endpoint: verify DB is accessible with a trivial query
app.get('/ready', async (_req, res) => {
  try {
    // simple query to ensure DB connection is responsive
    await pool.query('SELECT 1');
    res.json({ ok: true, db: true });
  } catch (err) {
    console.error('Readiness check failed', err && err.stack ? err.stack : err);
    res.status(503).json({ ok: false, db: false });
  }
});

// Graceful shutdown helper
let shuttingDown = false;
function gracefulShutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('Graceful shutdown initiated');

  try {
    // persist in-memory alerts to disk before closing
    persistAlerts();
  } catch (e) { console.error('Failed to persist alerts during shutdown', e); }

  // stop accepting new connections
  server.close(() => {
    console.log('HTTP server closed');
    try {
      if (pool) {
        pool.end();
        console.log('Database pool closed');
      }
    } catch (e) {
      console.error('Error closing database pool', e);
    }
    process.exit(code);
  });

  // Force exit if shutdown takes too long
  setTimeout(() => {
    console.error('Forcing shutdown after timeout');
    try { if (pool) pool.end(); } catch (e) {}
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown(0));
process.on('SIGINT', () => gracefulShutdown(0));
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception', err && err.stack ? err.stack : err);
  gracefulShutdown(1);
});

// GET /api/news/cryptopanic?symbols=BTC,ETH&size=20&filter=important
// CryptoPanic endpoints removed to avoid rate limits

// GET /api/news/cryptopanic-alerts?symbols=BTC,ETH&size=30
// CryptoPanic alerts endpoint also removed


// --- Admin: backup endpoint -------------------------------------------------
// ADMIN_TOKEN already defined above for reuse

app.post('/admin/sql', requireAdmin, async (req, res) => {
  
  const { sql } = req.body || {};
  if (!sql) {
    return res.status(400).json({ error: 'sql parameter required' });
  }
  
  try {
    const result = await pool.query(sql);
    if (result.rows) {
      return res.json({ ok: true, result: result.rows });
    } else {
      return res.json({ ok: true, message: 'SQL executed successfully', rowCount: result.rowCount });
    }
  } catch (e) {
    console.error('SQL execution failed:', e);
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/admin/schema', requireAdmin, async (req, res) => {
  
  try {
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    const userColumnsResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `);
    
    const userPrefsColumnsResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'user_prefs'
    `);
    
    return res.json({ 
      tables: tablesResult.rows.map(t => t.table_name),
      users_columns: userColumnsResult.rows,
      user_prefs_columns: userPrefsColumnsResult.rows
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/admin/migrate', requireAdmin, async (req, res) => {
  
  try {
    // For PostgreSQL, migrations should be run via migrate.js script
    // This endpoint provides schema information only
    const userColumnsResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `);
    
    const columnNames = userColumnsResult.rows.map(col => col.column_name);
    
    const expectedColumns = ['id', 'google_id', 'email', 'name', 'avatar', 'username', 'created_at'];
    const missingColumns = expectedColumns.filter(col => !columnNames.includes(col));
    
    if (missingColumns.length > 0) {
      return res.json({ 
        ok: false, 
        message: 'Migrations needed. Run: npm run migrate', 
        missing: missingColumns 
      });
    } else {
      return res.json({ ok: true, message: 'Schema up to date' });
    }
  } catch (e) {
    console.error('Migration check failed:', e);
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/admin/backup', requireAdmin, async (req, res) => {
  try {
    // For PostgreSQL, backups are managed by Railway
    // Railway provides automatic backups for PostgreSQL databases
    
    return res.json({ 
      ok: true, 
      message: 'PostgreSQL backups are managed by Railway automatically',
      command: 'For local backups, use: pg_dump $DATABASE_URL > backup.sql',
      note: 'Railway provides point-in-time recovery for PostgreSQL'
    });
  } catch (e) {
    console.error('Admin backup info failed', e && e.stack ? e.stack : e);
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get('/admin/backups', requireAdmin, (req, res) => {
  try{
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.db'))
      .map(f => {
        const p = path.join(BACKUP_DIR, f);
        const st = fs.statSync(p);
        return { file: f, path: p, size: st.size, mtime: st.mtimeMs };
      })
      .sort((a,b) => b.mtime - a.mtime);
    res.json({ ok: true, files });
  }catch(e){
    res.status(500).json({ ok:false, error: String(e) });
  }
});

// Download a specific backup file by name (admin)
app.get('/admin/backups/:file', requireAdmin, (req, res) => {
  try{
    const name = path.basename(String(req.params.file||''));
    if (!name.endsWith('.db')) return res.status(400).json({ ok:false, error:'invalid_file' });
    const p = path.join(BACKUP_DIR, name);
    if (!fs.existsSync(p)) return res.status(404).json({ ok:false, error:'not_found' });
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    fs.createReadStream(p).pipe(res);
  }catch(e){ res.status(500).json({ ok:false, error:String(e) }); }
});

// Get comprehensive admin statistics (for dashboard)
app.get('/admin/stats', requireAdmin, async (req, res) => {
  try {
    // Get alerts stats
    const alertsResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE severity = 'critical') as critical_count,
        COUNT(*) FILTER (WHERE severity = 'warning') as warning_count,
        COUNT(*) FILTER (WHERE severity = 'info') as info_count
      FROM alerts
    `);
    const alertStats = alertsResult.rows[0];
    
    // Get users stats
    const usersResult = await pool.query('SELECT COUNT(*) as total FROM users');
    const userStats = usersResult.rows[0];
    
    // Get news cache stats
    const newsResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE expires_at < NOW() + INTERVAL '7 days') as expiring_soon,
        AVG(EXTRACT(EPOCH FROM NOW()) * 1000 - date) as avg_age_ms
      FROM news_cache
      WHERE expires_at > NOW()
    `);
    const newsData = newsResult.rows[0];
    
    // Get top tokens in news
    const tokenResult = await pool.query(`
      SELECT jsonb_array_elements_text(tickers) as token, COUNT(*) as count
      FROM news_cache
      WHERE expires_at > NOW()
      GROUP BY token
      ORDER BY count DESC
      LIMIT 10
    `);
    
    res.json({
      alerts: {
        total: parseInt(alertStats.total),
        critical: parseInt(alertStats.critical_count),
        warning: parseInt(alertStats.warning_count),
        info: parseInt(alertStats.info_count)
      },
      users: {
        total: parseInt(userStats.total)
      },
      news: {
        totalCached: parseInt(newsData.total),
        expiringSoon: parseInt(newsData.expiring_soon),
        avgAgeDays: newsData.avg_age_ms ? Math.floor(newsData.avg_age_ms / (1000 * 60 * 60 * 24)) : 0,
        topTokens: tokenResult.rows.map(row => ({
          token: row.token,
          count: parseInt(row.count)
        }))
      }
    });
  } catch (error) {
    console.error('[Admin Stats] Error:', error);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

// Get users list as JSON (admin only)
app.get('/admin/users', requireAdmin, async (req, res) => {
  try{
    // Get users with their preferences
    const result = await pool.query(`
      SELECT 
        u.id, 
        u.email, 
        u.name, 
        u.username, 
        u.avatar, 
        u.google_id,
        u.created_at,
        p.watchlist_json,
        p.updated_at as prefs_updated_at
      FROM users u
      LEFT JOIN user_prefs p ON u.id = p.user_id
      ORDER BY u.created_at DESC
    `);
    
    // Parse watchlist and add metadata
    const enriched = result.rows.map(u => {
      let watchlist = [];
      try {
        watchlist = JSON.parse(u.watchlist_json || '[]');
      } catch {}
      
      return {
        id: u.id,
        email: u.email || '',
        name: u.name || '',
        username: u.username || '',
        avatar: u.avatar || '',
        isGoogleUser: !!u.google_id,
        created_at: u.created_at ? new Date(u.created_at * 1000).toISOString() : null,
        watchlistCount: watchlist.length,
        watchlist: watchlist,
        lastActivity: u.prefs_updated_at ? new Date(u.prefs_updated_at * 1000).toISOString() : null
      };
    });
    
    res.json({ users: enriched, total: enriched.length });
  }catch(e){
    console.error('Failed to fetch users:', e);
    res.status(500).json({ ok:false, error: String(e) });
  }
});

// Export users as CSV
app.get('/admin/export/users.csv', requireAdmin, async (req, res) => {
  try{
    const result = await pool.query('SELECT id, email, name, username, avatar, created_at FROM users');
    const rows = result.rows;
    
    const header = ['id','email','name','username','avatar','created_at'];
    const lines = [header.join(',')];
    const esc = v => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return '"' + s.replace(/"/g, '""') + '"';
    };
    rows.forEach(r => {
      lines.push([r.id, r.email, r.name, r.username, r.avatar, r.created_at].map(esc).join(','));
    });
    const csv = lines.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
    res.send(csv);
  }catch(e){ res.status(500).send('error'); }
});

// Export recent audit logs as CSV (default 30 days)
app.get('/admin/export/audit.csv', requireAdmin, async (req, res) => {
  try{
    const days = Math.max(1, Math.min(365, parseInt(String(req.query.days||'30')) || 30));
    const cutoffSeconds = Math.floor(Date.now()/1000) - (days * 86400);
    const result = await pool.query(
      'SELECT ts, user_id, email, event, detail FROM audit_log WHERE ts >= $1 ORDER BY ts DESC',
      [cutoffSeconds]
    );
    const rows = result.rows;
    
    const header = ['ts_iso','user_id','email','event','detail'];
    const lines = [header.join(',')];
    const esc = v => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return '"' + s.replace(/"/g, '""') + '"';
    };
    rows.forEach(r => {
      const iso = new Date(r.ts*1000).toISOString();
      lines.push([iso, r.user_id, r.email, r.event, r.detail].map(esc).join(','));
    });
    const csv = lines.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-last-${days}-days.csv"`);
    res.send(csv);
  }catch(e){ res.status(500).send('error'); }
});

// Export alerts.csv (includes new fields further_info, source_type, source_url)
app.get('/admin/export/alerts.csv', requireAdmin, (_req, res) => {
  try{
    const headers = [
      'id','token','title','description','severity','deadline','tags','further_info','source_type','source_url'
    ];
    const rows = alerts.map(a => ([
      a.id,
      a.token,
      a.title,
      (a.description||'').replaceAll('\n',' ').slice(0,1000),
      a.severity,
      a.deadline,
      JSON.stringify(Array.isArray(a.tags)?a.tags:[]),
      (a.further_info||'').replaceAll('\n',' ').slice(0,2000),
      a.source_type||'',
      a.source_url||''
    ]));
    const esc = (v) => '"' + String(v).replaceAll('"','""') + '"';
    const body = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="alerts.csv"');
    res.send('\uFEFF' + body);
  }catch(e){
    res.status(500).send('export_failed');
  }
});

// Serve static SPA (after API routes)
const distDir = path.resolve(__dirname, 'dist');
const distIndex = path.join(distDir, 'index.html');
const rootIndex = path.join(__dirname, 'index.html');
if (fs.existsSync(distDir)) {
  // When built with Vite, prefer dist assets
  app.use(express.static(distDir));
}
// Always serve the Vite public/ directory (for icons, static assets)
const publicDir = path.resolve(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  // Serve entire public directory
  app.use(express.static(publicDir));
  // Explicit mount for /icons to avoid SPA fallback and add cache headers
  const publicIconsDir = path.join(publicDir, 'icons');
  if (fs.existsSync(publicIconsDir)) {
    app.use('/icons', express.static(publicIconsDir, {
      setHeaders: (res, filePath) => {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }));
    // Belt-and-braces: explicit route for icons with proper content-type
    app.get('/icons/:file', (req, res, next) => {
      try {
        const fname = String(req.params.file || '');
        const p = path.join(publicIconsDir, fname);
        if (!fs.existsSync(p)) return res.status(404).end();
        if (fname.toLowerCase().endsWith('.svg')) res.type('image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.sendFile(p);
      } catch (e) {
        return next();
      }
    });
  }
}
// In local dev without a Vite build, also serve static files from the project root
app.use(express.static(__dirname));
// Also serve standalone pages explicitly
app.get('/signup', (_req,res) => res.sendFile(path.join(__dirname, 'signup.html')));
app.get('/profile', (_req,res) => res.sendFile(path.join(__dirname, 'profile.html')));

// Mask paths for logging (basic)
function maskPath(p){
  if (!p) return p;
  try { return p.replace(process.cwd(), '[app]'); } catch { return p; }
}

// Start server and keep a reference so we can gracefully shut down
/* ---------------- Google OAuth (minimal) ---------------- */
// Compute a base URL from the incoming request when BASE_URL env isn't set.
function getBaseUrl(req){
  if (BASE_URL) {
    try { return String(BASE_URL).replace(/\/+$/,''); } catch { return BASE_URL; }
  }
  try {
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || '').toString().split(',')[0].trim() || 'http';
    const host = req.get('host');
  if (host) return `${proto}://${host}`.replace(/\/+$/,'');
  } catch {}
  return '';
}

function assertAuthConfig(){
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET');
  }
}

app.get('/auth/google', (req, res) => {
  try{ assertAuthConfig(); } catch(e){ return res.status(500).send(String(e.message||e)); }
  const state = crypto.randomBytes(16).toString('hex');
  
  // Store state server-side instead of relying on cookies
  oauthStates.set(state, { timestamp: Date.now(), used: false });
  
  // Clean up old states (older than 10 minutes)
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [key, value] of oauthStates.entries()) {
    if (value.timestamp < tenMinutesAgo) {
      oauthStates.delete(key);
    }
  }
  
  // Save states to disk for persistence
  saveOAuthStates();
  
  // OAuth state generated
  
  const base = getBaseUrl(req);
  const redirectUri = `${String(base||'').replace(/\/+$/,'')}/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
});

app.get('/auth/google/callback', async (req, res) => {
  try{ assertAuthConfig(); } catch(e){ 
    console.error('OAuth config error:', e.message);
    return res.status(500).send(String(e.message||e)); 
  }
  
  const { code, state } = req.query || {};
  console.log('OAuth callback received:', { 
    code: code ? `${String(code).slice(0,10)}...` : 'missing', 
    state: state ? 'present' : 'missing', 
    cookieState: req.cookies.oauth_state ? 'present' : 'missing',
    allCookies: Object.keys(req.cookies || {}),
    userAgent: req.get('user-agent'),
    timestamp: new Date().toISOString()
  });
  
  if (!code || !state) {
    console.error('OAuth callback missing code or state:', { code: !!code, state: !!state });
    return res.status(400).send('Invalid request - missing code or state');
  }
  
  // Validate state against server-side store
  const stateData = oauthStates.get(state);
  if (!stateData) {
    console.error('OAuth state not found in server store:', { 
      receivedState: state,
      availableStates: Array.from(oauthStates.keys()),
      storeSize: oauthStates.size
    });
    return res.status(400).send('Invalid state - not found');
  }
  
  if (stateData.used) {
    console.error('OAuth state already used:', { state, timestamp: stateData.timestamp });
    return res.status(400).send('Invalid state - already used');
  }
  
  // Mark state as used and remove it
  oauthStates.delete(state);
  saveOAuthStates();
  // OAuth state validated
  
  try{
    // Exchange code
    const base = getBaseUrl(req);
    const redirectUri = `${String(base||'').replace(/\/+$/,'')}/auth/google/callback`;
    const tokenParams = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code: String(code),
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    });
    
    // Exchanging OAuth code for tokens
    
    const tr = await fetch('https://oauth2.googleapis.com/token', { 
      method:'POST', 
      headers:{ 'Content-Type':'application/x-www-form-urlencoded' }, 
      body: tokenParams.toString() 
    });
    
    // Token exchange completed
    
    if (!tr.ok) {
      const errorText = await tr.text();
      console.error('Token exchange failed:', { status: tr.status, error: errorText });
      return res.status(502).send('token exchange failed');
    }
    
    const tj = await tr.json();
    // Token exchange successful
    
    const idToken = tj.id_token;
    if (!idToken) {
      console.error('No ID token in response');
      return res.status(502).send('No ID token received');
    }
    
    // Decode ID token payload (without verification — for demo)
    const payload = JSON.parse(Buffer.from(String(idToken).split('.')[1]||'', 'base64').toString('utf8')) || {};
    // ID token decoded
    
    const googleId = payload.sub || '';
    const email = payload.email || '';
    const name = payload.name || '';
    const avatar = payload.picture || '';

    // Create or map user
    const uid = `usr_${googleId}`; // simple mapping for demo
    // Creating new user
    
    await upsertUser(uid);
    await pool.query(
      'UPDATE users SET google_id=$1, email=$2, name=$3, avatar=$4 WHERE id=$5',
      [googleId, email, name, avatar, uid]
    );
    setSession(res, { uid });
    console.log('OAuth success, redirecting to profile');
    res.redirect('/profile');
  }catch(e){
    console.error('OAuth callback error:', e.message, e.stack);
    res.status(500).send('oauth failed');
  }
});

app.post('/auth/logout', (req, res) => {
  const sid = req.cookies.sid;
  if (sid) { sessions.delete(sid); res.clearCookie('sid', COOKIE_SECURE ? { secure: true, sameSite: 'lax', httpOnly: true } : undefined); }
  res.json({ ok:true });
});
// Wildcard fallback should be last: point to dist or root index
app.get('*', (_req,res) => {
  if (fs.existsSync(distIndex)) return res.sendFile(distIndex);
  if (fs.existsSync(rootIndex)) return res.sendFile(rootIndex);
  res.status(404).send('Not found');
});

// Start server and keep a reference so we can gracefully shut down
// Listen on 0.0.0.0 so Railway can proxy traffic to the container
server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Process ID: ${process.pid}`);
});

server.on('error', (error) => {
  console.error('❌ Server error:', error);
  process.exit(1);
});

// Keep the process alive
process.stdin.resume();

console.log('🔄 Server.js execution continuing after app.listen...');

// Optional heartbeat only when DEBUG_HTTP=true
if (String(process.env.DEBUG_HTTP).toLowerCase() === 'true') {
  setInterval(() => {
    console.log(`💓 heartbeat ${new Date().toISOString()}`);
  }, 15000);
}


