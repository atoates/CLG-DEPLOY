// server.js
const fs = require('fs');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, 'data');
// Prefer an explicit DATABASE_PATH when provided (keeps migrate/backup scripts consistent)
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'clg.sqlite');
// Backup dir (can be overridden by BACKUP_DIR env var)
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');

// server reference declared up-front so shutdown handlers can close it later
let server;
const POLYGON_KEY = process.env.POLYGON_API_KEY || '';

fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------------- DB setup (SQLite) ---------------- */
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

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
  tags TEXT DEFAULT '[]'
);`);
const qUpsertUser   = db.prepare('INSERT OR IGNORE INTO users (id) VALUES (?)');
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

/* ---------------- Middleware ---------------- */
app.use(express.json());
app.use(cookieParser());

// create anon user if missing cookie
app.use((req, res, next) => {
  let uid = req.cookies.uid;
  if (!uid) {
    uid = `usr_${Math.random().toString(36).slice(2,10)}`;
    res.cookie('uid', uid, {
      httpOnly: true, sameSite: 'lax', maxAge: 365*24*3600*1000
    });
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

/* ---------------- User prefs API ---------------- */
app.get('/api/me', (req, res) => {
  const row = qGetPrefs.get(req.uid);
  if (!row) {
    // first-time defaults
    const payload = {
      userId: req.uid,
      watchlist: [],
      severity: ['critical','warning','info'],
      showAll: false,
      dismissed: []
    };
    qUpsertPrefs.run({
      user_id: req.uid,
      watchlist_json: JSON.stringify(payload.watchlist),
      severity_json: JSON.stringify(payload.severity),
      show_all: payload.showAll ? 1 : 0,
      dismissed_json: JSON.stringify(payload.dismissed)
    });
    return res.json(payload);
  }
  res.json({
    userId: req.uid,
    watchlist: JSON.parse(row.watchlist_json),
    severity: JSON.parse(row.severity_json),
    showAll: !!row.show_all,
    dismissed: JSON.parse(row.dismissed_json)
  });
});

app.post('/api/me/prefs', (req, res) => {
  const { watchlist = [], severity = ['critical','warning','info'], showAll = false, dismissed = [] } = req.body || {};
  qUpsertPrefs.run({
    user_id: req.uid,
    watchlist_json: JSON.stringify([...new Set(watchlist.map(s => String(s).toUpperCase()))]),
    severity_json: JSON.stringify(severity),
    show_all: showAll ? 1 : 0,
    dismissed_json: JSON.stringify(dismissed)
  });
  res.json({ ok: true });
});

/* ---------------- Alerts API ---------------- */
app.get('/api/alerts', (_req, res) => res.json(alerts));
app.post('/api/alerts', (req, res) => {
  const { token, title, description, severity, deadline, tags } = req.body || {};
  if (!token || !title || !deadline) return res.status(400).json({ error:'token, title, deadline are required' });
  
  // Validate tags against known tag types
  const validTags = [
    'price-change', 'migration', 'hack', 'fork', 'scam',
    'airdrop', 'whale', 'news', 'community', 'exploit'
  ];
  const sanitizedTags = Array.isArray(tags) 
    ? tags.filter(t => typeof t === 'string' && validTags.includes(t))
    : [];

  const item = {
    id:`a_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    token:String(token).toUpperCase(),
    title:String(title),
    description:String(description||''),
    severity:['critical','warning','info'].includes(severity)?severity:'info',
    deadline:new Date(deadline).toISOString(),
    tags: sanitizedTags
  };
  alerts.push(item); persistAlerts();
  res.status(201).json(item);
});

/* ---------------- Market (Polygon free EOD) ---------------- */
function mapSymbolToPolygon(sym){
  const m={ BTC:'X:BTCUSD', ETH:'X:ETHUSD', USDC:'X:USDCUSD', MATIC:'X:MATICUSD',
            DOGE:'X:DOGEUSD', ADA:'X:ADAUSD', SOL:'X:SOLUSD', POL:'X:POLUSD',
            UNI:'X:UNIUSD', LINK:'X:LINKUSD' };
  return m[sym] || null;
}
app.get('/api/market/snapshot', async (req, res) => {
  const symbols = String(req.query.symbols||'').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
  if (!symbols.length) return res.json({ items:[], note:'No symbols selected.' });

  const note = POLYGON_KEY ? 'End-of-day aggregates via Polygon (free tier).' : 'No API key set — showing empty EOD snapshot.';
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
  res.json({ items, note });
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
app.get('/api/news/cryptopanic', async (req, res) => {
  if (!CP_TOKEN) return res.status(501).json({ error: 'CRYPTOPANIC_TOKEN not set' });
  const symbols = String(req.query.symbols || '').toUpperCase();
  const params = new URLSearchParams({
    auth_token: CP_TOKEN,
    ...(CP_PUBLIC ? { public: 'true' } : {}),
    ...(symbols ? { currencies: symbols } : {}),
    ...(req.query.filter ? { filter: String(req.query.filter) } : {}),
    ...(req.query.kind   ? { kind: String(req.query.kind) } : {}),
    ...(req.query.size   ? { size: String(req.query.size) } : {})
  });
  const url = `https://cryptopanic.com/api/${CP_PLAN}/v2/posts/?` + params.toString();

  const key = 'raw:' + url;
  const cached = cacheGet(key);
  if (cached) return res.json(cached);

  try {
    const json = await fetchJson(url);
    cacheSet(key, json);
    res.json(json);
  } catch (e) {
    res.status(502).json({ error: 'cryptopanic_fetch_failed', detail: String(e) });
  }
});

// GET /api/news/cryptopanic-alerts?symbols=BTC,ETH&size=30
app.get('/api/news/cryptopanic-alerts', async (req, res) => {
  if (!CP_TOKEN) return res.json([]); // silently no-op if not configured
  const symbols = String(req.query.symbols || '').toUpperCase();

  const params = new URLSearchParams({
    auth_token: CP_TOKEN,
    ...(CP_PUBLIC ? { public: 'true' } : {}),
    ...(symbols ? { currencies: symbols } : {}),
    kind: 'news',           // prefer written news; change to 'all' if you want twitter/reddit too
    size: String(req.query.size || 50)  // you can tune
  });
  const url = `https://cryptopanic.com/api/${CP_PLAN}/v2/posts/?` + params.toString();

  const key = 'alerts:' + url;
  const cached = cacheGet(key);
  if (cached) return res.json(cached);

  try {
    const json = await fetchJson(url);
    const posts = Array.isArray(json?.results) ? json.results : [];
    // Only posts that mention a coin (instrument)
    const withInstruments = posts.filter(p => Array.isArray(p.instruments) && p.instruments.length);
    // Map to our alert model; also keep only those with a token in the requested symbols if provided
    let alerts = withInstruments.map(mapPostToAlert);
    if (symbols) {
      const set = new Set(symbols.split(',').map(s => s.trim().toUpperCase()));
      alerts = alerts.filter(a => set.has(a.token));
    }
    cacheSet(key, alerts);
    res.json(alerts);
  } catch (e) {
    res.status(502).json({ error: 'cryptopanic_map_failed', detail: String(e) });
  }
});


// --- Admin: backup endpoint -------------------------------------------------
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

app.post('/admin/backup', async (req, res) => {
  // Accept either Authorization: Bearer <token> or X-Admin-Token
  const auth = String(req.get('authorization') || req.get('x-admin-token') || '').trim();
  let token = auth;
  if (auth.toLowerCase().startsWith('bearer ')) token = auth.slice(7).trim();
  if (!ADMIN_TOKEN || !token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const iso = new Date().toISOString().replace(/[:.]/g, '-');
    const out = path.join(BACKUP_DIR, `app-${iso}.db`);

    // Try VACUUM INTO (safe); fall back to file copy
    try {
      db.pragma('journal_mode = WAL');
      db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
      console.log('Admin backup created (VACUUM INTO):', out);
      return res.json({ ok: true, method: 'vacuum', path: out });
    } catch (e) {
      console.warn('VACUUM INTO failed, falling back to copy:', e && e.message);
      fs.copyFileSync(DB_PATH, out);
      console.log('Admin backup created (copy):', out);
      return res.json({ ok: true, method: 'copy', path: out });
    }
  } catch (e) {
    console.error('Admin backup failed', e && e.stack ? e.stack : e);
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// Serve static SPA (after API routes)
const distDir = path.resolve(__dirname, 'dist');
app.use(express.static(distDir));
app.get('*', (_req,res) => res.sendFile(path.join(distDir,'index.html')));

// Mask paths for logging (basic)
function maskPath(p){
  if (!p) return p;
  try { return p.replace(process.cwd(), '[app]'); } catch { return p; }
}

// Start server and keep a reference so we can gracefully shut down
server = app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT} - DB: ${maskPath(DB_PATH)} Backup: ${maskPath(BACKUP_DIR)}`));

