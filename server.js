// server.js
const fs = require('fs');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'clg.sqlite');
const POLYGON_KEY = process.env.POLYGON_API_KEY || '';

fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------------- DB setup (SQLite) ---------------- */
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  provider TEXT,
  provider_user_id TEXT,
  email TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS user_prefs (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  watchlist_json TEXT NOT NULL DEFAULT '[]',
  severity_json  TEXT NOT NULL DEFAULT '["critical","warning","info"]',
  show_all INTEGER NOT NULL DEFAULT 0,
  dismissed_json TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`);
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
  { id:'seed-1', token:'BTC', title:'Wallet update recommended',
    description:'Upgrade to the latest client to ensure network compatibility.',
    severity:'info', deadline:new Date(Date.now()+36*3600*1000).toISOString() },
  { id:'seed-2', token:'ETH', title:'Validator maintenance window',
    description:'Possible brief latency. No action required for holders.',
    severity:'warning', deadline:new Date(Date.now()+12*3600*1000).toISOString() }
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
  const { token, title, description, severity, deadline } = req.body || {};
  if (!token || !title || !deadline) return res.status(400).json({ error:'token, title, deadline are required' });
  const item = {
    id:`a_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    token:String(token).toUpperCase(),
    title:String(title),
    description:String(description||''),
    severity:['critical','warning','info'].includes(severity)?severity:'info',
    deadline:new Date(deadline).toISOString()
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

/* ---------------- Health + static SPA ---------------- */
app.get('/healthz', (_req,res)=>res.json({ ok:true }));

const distDir = path.resolve(__dirname, 'dist');
app.use(express.static(distDir));
app.get('*', (_req,res)=>res.sendFile(path.join(distDir,'index.html')));

app.listen(PORT, ()=>console.log(`Server running on http://localhost:${PORT}`));
