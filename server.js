// server.js
// Only load .env in development (when not in Railway/production)
if (!process.env.RAILWAY_ENVIRONMENT) {
  require('dotenv').config();
}
const fs = require('fs');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const Database = require('better-sqlite3');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, 'data');
// Prefer an explicit DATABASE_PATH when provided (keeps migrate/backup scripts consistent)
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'clg.sqlite');
// Backup dir (can be overridden by BACKUP_DIR env var)
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');
const RESTORE_FROM_FILE = String(process.env.RESTORE_FROM_FILE || '').toLowerCase() === 'true';

// Ensure data directory exists (fallback for volume mount issues)
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
const POLYGON_KEY = process.env.POLYGON_API_KEY || '';
// CoinMarketCap configuration (preferred over Polygon when present)
const CMC_API_KEY = process.env.CMC_API_KEY || '';
// AI API keys for summary generation
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MARKET_CURRENCY = (process.env.MARKET_CURRENCY || 'GBP').toUpperCase();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const BASE_URL = process.env.BASE_URL || '';
const COOKIE_SECURE = (process.env.COOKIE_SECURE || '').toLowerCase() === 'true' || (BASE_URL && BASE_URL.startsWith('https://'));

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

/* ---------------- DB setup (SQLite) ---------------- */
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

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

// Ensure required tables exist
db.exec(`
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL UNIQUE,
  applied_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

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
);`);
// Simple audit log for profile-related events
db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  user_id TEXT,
  email TEXT,
  event TEXT,
  detail TEXT
)`);
const qUpsertUser   = db.prepare('INSERT OR IGNORE INTO users (id) VALUES (?)');
const qGetUser      = db.prepare('SELECT id, google_id, email, name, avatar, username FROM users WHERE id = ?');
const qGetUserByUsername = db.prepare('SELECT id FROM users WHERE lower(username) = lower(?)');
const qSetUsername  = db.prepare('UPDATE users SET username = ? WHERE id = ?');
const qSetAvatar    = db.prepare('UPDATE users SET avatar = ? WHERE id = ?');
const qGetPrefs     = db.prepare('SELECT * FROM user_prefs WHERE user_id = ?');
const qUpsertPrefs  = db.prepare(`
INSERT INTO user_prefs (user_id, watchlist_json, severity_json, show_all, dismissed_json, updated_at)
VALUES (@user_id, @watchlist_json, @severity_json, @show_all, @dismissed_json, strftime('%s','now'))
ON CONFLICT(user_id) DO UPDATE SET
  watchlist_json = excluded.watchlist_json,
  severity_json  = excluded.severity_json,
  show_all       = excluded.show_all,
  dismissed_json = excluded.dismissed_json,
  updated_at     = excluded.updated_at
`);
const qInsertAudit = db.prepare('INSERT INTO audit_log (user_id, email, event, detail) VALUES (@user_id, @email, @event, @detail)');

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
function requireAdmin(req, res, next){
  // Option 1: Header token
  const token = getAdminTokenFromReq(req);
  if (ADMIN_TOKEN && token && token === ADMIN_TOKEN) return next();
  // Option 2: Logged-in user from session and email whitelist
  const sess = getSession(req);
  if (sess && sess.uid) {
    try{
      const u = qGetUser.get(sess.uid);
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
app.use((req, res, next) => {
  let uid = req.cookies.uid;
  if (!uid) {
    uid = `usr_${Math.random().toString(36).slice(2,10)}`;
    res.cookie('uid', uid, { httpOnly: true, sameSite: 'lax', maxAge: 365*24*3600*1000, ...(COOKIE_SECURE ? { secure: true } : {}) });
  }
  req.uid = uid;
  qUpsertUser.run(uid);
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

// Prefer DB alerts if available (keeps start sequence consistent with restore-alerts.js)
try {
  const rows = db.prepare('SELECT id, token, title, description, severity, deadline, tags, further_info, source_type, source_url FROM alerts').all();
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
    persistAlerts();
    // Alerts loaded from database
  } else {
    // Using file-backed alerts
  }
} catch (e) {
  console.warn('Failed to load alerts from DB; using file-backed alerts.json', e && e.message);
}

/* ---------------- Admin Info Endpoint ---------------- */
app.get('/admin/info', requireAdmin, (req, res) => {
  try{
    const alertCount = db.prepare('SELECT COUNT(*) AS c FROM alerts').get().c;
    const userCount = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
    const prefsCount = db.prepare("SELECT COUNT(*) AS c FROM user_prefs").get().c;
    res.json({
      dataDir: DATA_DIR,
      databasePath: DB_PATH,
      backupDir: BACKUP_DIR,
      restoreFromFile: RESTORE_FROM_FILE,
      counts: { alerts: alertCount, users: userCount, user_prefs: prefsCount },
      market: {
        provider: CMC_API_KEY ? 'cmc' : (POLYGON_KEY ? 'polygon' : 'none'),
        currency: MARKET_CURRENCY
      }
    });
  }catch(e){
    res.status(500).json({ error: 'failed', message: e && e.message });
  }
});

/* ---------------- User prefs API ---------------- */
app.get('/api/me', (req, res) => {
  // If Google session exists, prefer that user id
  const sess = getSession(req);
  const effectiveUid = sess?.uid || req.uid;
  const urow = qGetUser.get(effectiveUid);
  const emailLower = (urow && urow.email ? String(urow.email).toLowerCase() : '');
  const isAdmin = !!(emailLower && ADMIN_EMAILS.includes(emailLower));
  const row = qGetPrefs.get(effectiveUid);
  if (!row) {
    // first-time defaults
    const payload = {
      userId: effectiveUid,
      watchlist: [],
      severity: ['critical','warning','info'],
      showAll: false,
      dismissed: [],
      loggedIn: !!sess,
      isAdmin,
      profile: urow ? { name: urow.name || '', email: urow.email || '', avatar: urow.avatar || '', username: urow.username || '' } : { name:'', email:'', avatar:'', username:'' }
    };
    qUpsertPrefs.run({
      user_id: effectiveUid,
      watchlist_json: JSON.stringify(payload.watchlist),
      severity_json: JSON.stringify(payload.severity),
      show_all: payload.showAll ? 1 : 0,
      dismissed_json: JSON.stringify(payload.dismissed)
    });
    try { qInsertAudit.run({ user_id: effectiveUid, email: (urow&&urow.email)||'', event: 'profile_init', detail: JSON.stringify({ watchlist: payload.watchlist }) }); } catch {}
    return res.json({ ...payload, userId: effectiveUid });
  }
  res.json({
    userId: effectiveUid,
    watchlist: JSON.parse(row.watchlist_json),
    severity: JSON.parse(row.severity_json),
    showAll: !!row.show_all,
    dismissed: JSON.parse(row.dismissed_json),
    loggedIn: !!sess,
    isAdmin,
    profile: urow ? { name: urow.name || '', email: urow.email || '', avatar: urow.avatar || '', username: urow.username || '' } : { name:'', email:'', avatar:'', username:'' }
  });
});

// Set/update username
app.post('/api/me/username', (req, res) => {
  const sess = getSession(req);
  const effectiveUid = sess?.uid || req.uid;
  const { username } = req.body || {};
  const val = String(username || '').trim();
  // validate: 3-20 chars, letters, numbers, underscore only; must start with a letter
  if (!/^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(val)) {
    return res.status(400).json({ ok:false, error:'invalid_username', rules:'3-20 chars, letters/numbers/underscore, start with a letter' });
  }
  // uniqueness (case-insensitive)
  const taken = qGetUserByUsername.get(val);
  if (taken && taken.id !== effectiveUid) {
    return res.status(409).json({ ok:false, error:'taken' });
  }
  qSetUsername.run(val, effectiveUid);
  try { const urow = qGetUser.get(effectiveUid); qInsertAudit.run({ user_id: effectiveUid, email: (urow&&urow.email)||'', event: 'username_set', detail: JSON.stringify({ username: val }) }); } catch {}
  res.json({ ok:true, username: val });
});

// Set/update avatar (simple URL validation)
app.post('/api/me/avatar', (req, res) => {
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
  qSetAvatar.run(val, effectiveUid);
  try { const urow = qGetUser.get(effectiveUid); qInsertAudit.run({ user_id: effectiveUid, email: (urow&&urow.email)||'', event: 'avatar_set', detail: JSON.stringify({ avatar: val.slice(0,120) }) }); } catch {}
  res.json({ ok:true, avatar: val });
});

app.post('/api/me/prefs', (req, res) => {
  const { watchlist = [], severity = ['critical','warning','info'], showAll = false, dismissed = [] } = req.body || {};
  const sess = getSession(req);
  const effectiveUid = sess?.uid || req.uid;
  qUpsertPrefs.run({
    user_id: effectiveUid,
    watchlist_json: JSON.stringify([...new Set(watchlist.map(s => String(s).toUpperCase()))]),
    severity_json: JSON.stringify(severity),
    show_all: showAll ? 1 : 0,
    dismissed_json: JSON.stringify(dismissed)
  });
  try { const urow = qGetUser.get(effectiveUid); qInsertAudit.run({ user_id: effectiveUid, email: (urow&&urow.email)||'', event: 'prefs_saved', detail: JSON.stringify({ watchlistLen: (watchlist||[]).length }) }); } catch {}
  res.json({ ok: true });
});

/* ---------------- Alerts API ---------------- */
app.get('/api/alerts', (_req, res) => res.json(alerts));
app.post('/api/alerts', requireAdmin, (req, res) => {
  const { token, title, description, severity, deadline, tags, further_info, source_type, source_url } = req.body || {};
  if (!token || !title || !deadline) return res.status(400).json({ error:'token, title, deadline are required' });
  
  // Validate tags against known tag types
  const validTags = [
    'price-change', 'migration', 'hack', 'fork', 'scam',
    'airdrop', 'whale', 'news', 'community', 'exploit', 'privacy'
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
  alerts.push(item); persistAlerts();
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
app.put('/api/alerts/:id', requireAdmin, (req, res) => {
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
      'airdrop', 'whale', 'news', 'community', 'exploit', 'privacy'
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
  alerts[idx] = updated; persistAlerts();
  res.json(updated);
});

// Delete an alert (admin only)
app.delete('/api/alerts/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const idx = alerts.findIndex(a => a.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not_found' });
  const removed = alerts.splice(idx, 1)[0]; persistAlerts();
  res.json({ ok:true, removedId: removed.id });
});

// Bulk create alerts (admin only)
app.post('/api/alerts/bulk', requireAdmin, (req, res) => {
  const { alerts: alertsToCreate } = req.body || {};
  
  if (!Array.isArray(alertsToCreate) || alertsToCreate.length === 0) {
    return res.status(400).json({ error: 'alerts array is required and must not be empty' });
  }

  const validTags = [
    'price-change', 'migration', 'hack', 'fork', 'scam',
    'airdrop', 'whale', 'news', 'community', 'exploit', 'privacy'
  ];

  const createdAlerts = [];
  const errors = [];

  alertsToCreate.forEach((alertData, index) => {
    try {
      const { token, title, description, severity, deadline, tags, further_info, source_type, source_url } = alertData;
      
      // Validate required fields
      if (!token || !title || !deadline) {
        errors.push(`Alert ${index + 1}: token, title, deadline are required`);
        return;
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
        return;
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
      createdAlerts.push(item);

    } catch (error) {
      errors.push(`Alert ${index + 1}: ${error.message}`);
    }
  });

  // Persist if any alerts were created
  if (createdAlerts.length > 0) {
    persistAlerts();
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

/* ---------------- Market (CoinMarketCap preferred, Polygon fallback) ---------------- */
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
  DASH: 131, EOS: 1765, FIL: 2280, VET: 3077, XTZ: 2011, KSM: 5034, GLMR: 6836,
  POLYGON: 3890
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

function mapSymbolToPolygon(sym){
  const m={ BTC:'X:BTCUSD', ETH:'X:ETHUSD', USDC:'X:USDCUSD', MATIC:'X:MATICUSD',
            DOGE:'X:DOGEUSD', ADA:'X:ADAUSD', SOL:'X:SOLUSD', POL:'X:POLUSD',
            UNI:'X:UNIUSD', LINK:'X:LINKUSD' };
  return m[sym] || null;
}

app.get('/api/market/snapshot', async (req, res) => {
  const symbols = String(req.query.symbols||'').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
  if (!symbols.length) return res.json({ items:[], note:'No symbols selected.', provider: CMC_API_KEY ? 'cmc' : (POLYGON_KEY ? 'polygon' : 'none') });

  // Prefer CMC if configured
  if (CMC_API_KEY) {
    try{
      // Resolve CMC IDs for symbols
      const idsMap = await getCmcIdsForSymbols(symbols);
      const ids = symbols.map(s => idsMap[s]).filter(Boolean);
      if (!ids.length) return res.json({ items: symbols.map(s=>({ token:s, lastPrice:null, dayChangePct:null, change30mPct:null, error:'no-id' })), note: 'CoinMarketCap quotes (~60s). No IDs found for requested symbols.', provider: 'cmc' });

      const cacheKey = `stats:${ids.join(',')}:${MARKET_CURRENCY}`;
      const hit = cmcStatsCache.get(cacheKey);
      if (hit && Date.now() - hit.t < CMC_STATS_TTL_MS) {
        return res.json({ items: hit.data, note: `CoinMarketCap quotes (~60s) — ${MARKET_CURRENCY}` , provider: 'cmc' });
      }

      // Fetch quotes data (current price, volume, % changes)
      // Back to basic version without aux parameter that was working
      const params = new URLSearchParams({
        id: ids.join(','),
        convert: MARKET_CURRENCY
      });
      const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?${params.toString()}`;
      const r = await fetch(url, { headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const quotesData = j?.data || {};
      
      // OHLCV disabled due to CMC Hobbyist plan GBP conversion restrictions
      const ohlcvData = {};
      
      // Build items array keyed by symbol using quotes endpoint
      const cur = MARKET_CURRENCY;
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
      cmcStatsCache.set(cacheKey, { t: Date.now(), data: items });
      return res.json({ items, note: `CoinMarketCap quotes (~60s) — ${MARKET_CURRENCY}`, provider: 'cmc' });
    }catch(e){
      console.warn('CMC API error:', e.message);
      // Fall through to Polygon if configured, else return error items
      if (!POLYGON_KEY) {
        const items = symbols.map(s=>({ token:s, lastPrice:null, dayChangePct:null, change30mPct:null, error:'cmc-failed' }));
        return res.json({ items, note: 'CoinMarketCap fetch failed; no fallback API configured.', provider: 'cmc' });
      }
    }
  }

  // Fallback to Polygon EOD
  const note = POLYGON_KEY ? 'End-of-day aggregates via Polygon (free tier).' : 'No market API configured.';
  const items = [];
  for (const sym of symbols){
    const ticker = mapSymbolToPolygon(sym);
    if (!ticker || !POLYGON_KEY){
      items.push({ token:sym, lastPrice:null, dayChangePct:null, change30mPct:null, error:'no-data' });
      continue;
    }
    try{
      const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev?adjusted=true&apiKey=${POLYGON_KEY}`;
      const r = await fetch(url);
      if (!r.ok){ items.push({ token:sym, lastPrice:null, dayChangePct:null, change30mPct:null, error:`http-${r.status}` }); continue; }
      const json = await r.json();
      const rec = (json.results && json.results[0]) || null;
      if (!rec){ items.push({ token:sym, lastPrice:null, dayChangePct:null, change30mPct:null, error:'no-results' }); continue; }
      const lastPrice = rec.c ?? null;
      const open = rec.o ?? null;
      const dayChangePct = (lastPrice!=null && open!=null && open!==0) ? ((lastPrice-open)/open)*100 : null;
      items.push({ token:sym, lastPrice, dayChangePct, change30mPct:null });
    }catch{
      items.push({ token:sym, lastPrice:null, dayChangePct:null, change30mPct:null, error:'fetch-failed' });
    }
  }
  res.json({ items, note, provider: POLYGON_KEY ? 'polygon' : 'none' });
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
  res.json({ currency: MARKET_CURRENCY, symbol: currencySymbol(MARKET_CURRENCY) });
});

// --- AI Summary API ----------------------------------------------------------
app.post('/api/summary/generate', async (req, res) => {
  try {
    const { alerts, tokens, sevFilter, tagFilter } = req.body;
    
    if (!alerts || !Array.isArray(alerts)) {
      return res.status(400).json({ error: 'Invalid alerts data' });
    }

    // Generate AI summary using available API
    const summary = await generateAISummary(alerts, tokens || [], sevFilter || [], tagFilter || []);
    const news = await fetchNewsForTokens(tokens || []);
    
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

// AI Summary generation function
async function generateAISummary(alerts, tokens, sevFilter, tagFilter) {
  // Prepare alerts data for AI analysis
  const alertsData = alerts.map(alert => ({
    token: alert.token,
    title: alert.title,
    description: alert.description,
    severity: alert.severity,
    deadline: alert.deadline,
    tags: Array.isArray(alert.tags) ? alert.tags : (alert.tags ? JSON.parse(alert.tags) : [])
  }));

  const prompt = `You are a crypto portfolio assistant. Analyze these alerts and provide a concise summary for a user monitoring these tokens: ${tokens.join(', ')}.

Current alerts (${alerts.length} total):
${alertsData.map(a => `- ${a.token}: ${a.title} (${a.severity}) - ${a.description} [Deadline: ${a.deadline}]`).join('\n')}

Please provide:
1. **Executive Summary** (2-3 sentences): Key takeaways and urgent actions needed
2. **Critical Actions** (if any): Time-sensitive items requiring immediate attention  
3. **Token-Specific Insights**: Brief analysis for each token in the watchlist
4. **Timeline Overview**: Key dates and deadlines to watch

Keep it concise, actionable, and focused on portfolio management decisions.`;

  // Try OpenAI first, then Anthropic, then fallback
  if (OPENAI_API_KEY) {
    try {
      console.log('Attempting OpenAI o1-pro for AI summary...');
      const response = await callOpenAI(prompt);
      console.log('OpenAI o1-pro successful');
      return {
        content: response.content,
        model: response.model,
        usage: response.usage,
        alertCount: alerts.length,
        tokenCount: tokens.length
      };
    } catch (error) {
      console.error('OpenAI API error, falling back to Anthropic:', error.message);
    }
  } else {
    console.log('OPENAI_API_KEY not available, skipping to Anthropic');
  }

  if (ANTHROPIC_API_KEY) {
    try {
      console.log('Using Anthropic Claude 3.5 Sonnet as fallback...');
      const response = await callAnthropic(prompt);
      console.log('Anthropic Claude successful');
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
  } else {
    console.log('ANTHROPIC_API_KEY not available');
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
  const model = 'o1-pro';
  
  // o1 models have different parameter requirements
  const requestBody = {
    model: model,
    messages: [{ role: 'user', content: prompt }],
    max_completion_tokens: 2000  // o1 models use max_completion_tokens instead of max_tokens
  };
  
  // o1 models don't support temperature parameter
  // Remove temperature for o1 models
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
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

// News fetching function using CryptoNews API
async function fetchNewsForTokens(tokens) {
  try {
    const cryptoNewsApiKey = process.env.NEWSAPI_KEY;
    
    if (!cryptoNewsApiKey || cryptoNewsApiKey === 'undefined') {
      return [{
        title: "CryptoNews API Key Missing",
        description: "NEWSAPI_KEY environment variable is not configured",
        url: "#",
        publishedAt: new Date().toISOString(),
        source: { name: "Configuration Error" },
        sentiment: "neutral"
      }];
    }
    
    if (tokens.length === 0) {
      return [{
        title: "No Tokens Selected",
        description: "Select tokens in your watchlist to see relevant crypto news",
        url: "#",
        publishedAt: new Date().toISOString(),
        source: { name: "System" },
        sentiment: "neutral"
      }];
    }
    
    // Simple test: try to fetch news for BTC,ETH (most common tokens)
    const testTokens = tokens.filter(t => ['BTC', 'ETH', 'SOL', 'ADA', 'DOT'].includes(t)).slice(0, 3);
    const tickersParam = testTokens.length > 0 ? testTokens.join(',') : 'BTC,ETH';
    
    const url = `https://cryptonews-api.com/api/v1?tickers=${tickersParam}&items=6&page=1&token=${cryptoNewsApiKey}`;
    
    const response = await fetch(url, {
      timeout: 10000 // 10 second timeout
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`API responded with ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      return data.data.slice(0, 6).map(article => ({
        title: article.title || 'No title available',
        description: article.text || article.description || 'No description available',
        url: article.news_url || article.url || '#',
        publishedAt: article.date || new Date().toISOString(),
        source: { name: article.source_name || article.source || 'Unknown' },
        sentiment: article.sentiment || 'neutral',
        tickers: article.tickers || [],
        image_url: article.image_url
      }));
    } else {
      return [{
        title: "No News Available",
        description: "No recent cryptocurrency news found for your selected tokens",
        url: "#",
        publishedAt: new Date().toISOString(),
        source: { name: "CryptoNews API" },
        sentiment: "neutral"
      }];
    }
    
  } catch (error) {
    console.error('CryptoNews API Error:', error.message);
    
    return [{
      title: "News Service Temporarily Unavailable",
      description: `Unable to fetch crypto news: ${error.message}`,
      url: "#",
      publishedAt: new Date().toISOString(),
      source: { name: "Error Handler" },
      sentiment: "neutral"
    }];
  }
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
app.get('/debug/env', (req, res) => {
  res.json({
    NODE_ENV: process.env.NODE_ENV || 'not_set',
    CMC_API_KEY_SET: !!CMC_API_KEY,
    CMC_API_KEY_LENGTH: CMC_API_KEY ? CMC_API_KEY.length : 0,
    CMC_API_KEY_FIRST_8: CMC_API_KEY ? CMC_API_KEY.substring(0, 8) : 'not_set',
    POLYGON_KEY_SET: !!POLYGON_KEY,
    MARKET_CURRENCY_RESOLVED: MARKET_CURRENCY,
    MARKET_CURRENCY_RAW: process.env.MARKET_CURRENCY || 'not_set_defaulting_to_GBP',
    RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT || 'not_set',
    SERVER_LOGIC_PROVIDER: CMC_API_KEY ? 'cmc' : (POLYGON_KEY ? 'polygon' : 'none')
  });
});

/* ---------------- Health + static SPA ---------------- */
app.get('/healthz', (_req,res)=>res.json({ ok:true }));

// Readiness endpoint: verify DB is accessible with a trivial query
app.get('/ready', (_req, res) => {
  try {
    // simple query to ensure DB file and engine are responsive
    db.prepare('SELECT 1').get();
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
      db.close();
      console.log('Database closed');
    } catch (e) {
      console.error('Error closing database', e);
    }
    process.exit(code);
  });

  // Force exit if shutdown takes too long
  setTimeout(() => {
    console.error('Forcing shutdown after timeout');
    try { db.close(); } catch (e) {}
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
    if (sql.toLowerCase().startsWith('select') || sql.toLowerCase().startsWith('pragma')) {
      const result = db.prepare(sql).all();
      return res.json({ ok: true, result });
    } else {
      db.exec(sql);
      return res.json({ ok: true, message: 'SQL executed successfully' });
    }
  } catch (e) {
    console.error('SQL execution failed:', e);
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/admin/schema', requireAdmin, async (req, res) => {
  
  try {
    const userColumns = db.prepare('PRAGMA table_info(users)').all();
    const userPrefsColumns = db.prepare('PRAGMA table_info(user_prefs)').all();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    
    return res.json({ 
      tables: tables.map(t => t.name),
      users_columns: userColumns,
      user_prefs_columns: userPrefsColumns
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/admin/migrate', requireAdmin, async (req, res) => {
  
  try {
    // Check if users table has the required columns
    const userColumns = db.prepare('PRAGMA table_info(users)').all();
    const columnNames = userColumns.map(col => col.name);
    
    // Users table columns verified
    
    const missingColumns = [];
    if (!columnNames.includes('google_id')) missingColumns.push('google_id TEXT');
    if (!columnNames.includes('email')) missingColumns.push('email TEXT');
    if (!columnNames.includes('name')) missingColumns.push('name TEXT');
    if (!columnNames.includes('avatar')) missingColumns.push('avatar TEXT');
    if (!columnNames.includes('created_at')) missingColumns.push('created_at INTEGER DEFAULT (strftime(\'%s\',\'now\'))');
    
    if (missingColumns.length > 0) {
      // Adding missing database columns
      for (const column of missingColumns) {
        const sql = `ALTER TABLE users ADD COLUMN ${column}`;
        // Executing column addition
        db.exec(sql);
      }
      
      // Also create user_prefs table if it doesn't exist
      db.exec(`CREATE TABLE IF NOT EXISTS user_prefs (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        watchlist_json TEXT NOT NULL DEFAULT '[]',
        severity_json  TEXT NOT NULL DEFAULT '["critical","warning","info"]',
        show_all       INTEGER NOT NULL DEFAULT 0,
        dismissed_json TEXT NOT NULL DEFAULT '[]',
        updated_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      )`);
      
      // Database schema updated
      return res.json({ ok: true, added: missingColumns, message: 'Schema updated' });
    } else {
      return res.json({ ok: true, message: 'Schema already up to date' });
    }
  } catch (e) {
    console.error('Migration failed:', e);
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/admin/backup', requireAdmin, async (req, res) => {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const iso = new Date().toISOString().replace(/[:.]/g, '-');
    const out = path.join(BACKUP_DIR, `app-${iso}.db`);

    // Try VACUUM INTO (safe); fall back to file copy
    try {
      db.pragma('journal_mode = WAL');
      db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
      // Admin backup created (VACUUM)
      return res.json({ ok: true, method: 'vacuum', path: out });
    } catch (e) {
      console.warn('VACUUM INTO failed, falling back to copy:', e && e.message);
      fs.copyFileSync(DB_PATH, out);
      // Admin backup created (copy)
      return res.json({ ok: true, method: 'copy', path: out });
    }
  } catch (e) {
    console.error('Admin backup failed', e && e.stack ? e.stack : e);
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

// Export users as CSV
app.get('/admin/export/users.csv', requireAdmin, (req, res) => {
  try{
    // Try to include created_at if present
    let rows;
    try{
      rows = db.prepare('SELECT id, email, name, username, avatar, created_at FROM users').all();
    }catch{
      rows = db.prepare('SELECT id, email, name, username, avatar FROM users').all();
      rows.forEach(r => r.created_at = null);
    }
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
app.get('/admin/export/audit.csv', requireAdmin, (req, res) => {
  try{
    const days = Math.max(1, Math.min(365, parseInt(String(req.query.days||'30')) || 30));
    const since = db.prepare("SELECT strftime('%s','now') - ? AS cutoff").get(days*86400).cutoff;
    const rows = db.prepare('SELECT ts, user_id, email, event, detail FROM audit_log WHERE ts >= ? ORDER BY ts DESC').all(since);
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
// In local dev without a Vite build, also serve static files from the project root
app.use(express.static(__dirname));
// Also serve standalone pages explicitly
app.get('/signup', (_req,res) => res.sendFile(path.join(__dirname, 'signup.html')));
app.get('/profile', (_req,res) => res.sendFile(path.join(__dirname, 'profile.html')));
app.get('/admin', (_req,res) => res.sendFile(path.join(__dirname, 'admin.html')));

// Mask paths for logging (basic)
function maskPath(p){
  if (!p) return p;
  try { return p.replace(process.cwd(), '[app]'); } catch { return p; }
}

// Start server and keep a reference so we can gracefully shut down
/* ---------------- Google OAuth (minimal) ---------------- */
function assertAuthConfig(){
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !BASE_URL) {
    throw new Error('Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/BASE_URL');
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
  
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${BASE_URL}/auth/google/callback`,
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
    const tokenParams = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code: String(code),
      grant_type: 'authorization_code',
      redirect_uri: `${BASE_URL}/auth/google/callback`
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
    
    qUpsertUser.run(uid);
    db.prepare('UPDATE users SET google_id=?, email=?, name=?, avatar=? WHERE id=?').run(googleId, email, name, avatar, uid);
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

// Start server and keep a reference so we can gracefully shut down
server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT} - DB: ${maskPath(DB_PATH)} Backup: ${maskPath(BACKUP_DIR)}`);
});

// Wildcard fallback should be last: point to dist or root index
app.get('*', (_req,res) => {
  if (fs.existsSync(distIndex)) return res.sendFile(distIndex);
  if (fs.existsSync(rootIndex)) return res.sendFile(rootIndex);
  res.status(404).send('Not found');
});

