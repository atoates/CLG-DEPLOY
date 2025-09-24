// server.js
const fs = require('fs');
const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, 'data');
const ALERTS_PATH = path.join(DATA_DIR, 'alerts.json');
const POLYGON_KEY = process.env.POLYGON_API_KEY || ''; // set in Railway Variables

// Ensure data dir exists
fs.mkdirSync(DATA_DIR, { recursive: true });

// --- Helpers -----------------------------------------------------------------
function readJsonSafe(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function writeJsonSafe(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function mapSymbolToPolygon(sym) {
  const m = {
    BTC: 'X:BTCUSD',
    ETH: 'X:ETHUSD',
    USDC: 'X:USDCUSD',
    MATIC: 'X:MATICUSD',
    DOGE: 'X:DOGEUSD',
    ADA: 'X:ADAUSD',
    SOL: 'X:SOLUSD',
    POL: 'X:POLUSD',   // may not exist; we handle errors
    UNI: 'X:UNIUSD',
    LINK:'X:LINKUSD',
  };
  return m[sym] || null;
}

// --- In-memory + file-backed alerts -----------------------------------------
let alerts = readJsonSafe(ALERTS_PATH, [
  // seed a couple so first run isn't empty
  {
    id: 'seed-1',
    token: 'BTC',
    title: 'Wallet update recommended',
    description: 'Upgrade to the latest client to ensure network compatibility.',
    severity: 'info',
    deadline: new Date(Date.now() + 36 * 3600 * 1000).toISOString(),
  },
  {
    id: 'seed-2',
    token: 'ETH',
    title: 'Validator maintenance window',
    description: 'Possible brief latency. No action required for holders.',
    severity: 'warning',
    deadline: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
  },
]);

function persistAlerts(){ writeJsonSafe(ALERTS_PATH, alerts); }

// --- Middleware --------------------------------------------------------------
app.use(express.json());

// --- API: Alerts -------------------------------------------------------------
app.get('/api/alerts', (_req, res) => {
  res.json(alerts);
});

app.post('/api/alerts', (req, res) => {
  const { token, title, description, severity, deadline } = req.body || {};
  if (!token || !title || !deadline) {
    return res.status(400).json({ error: 'token, title, deadline are required' });
  }
  const item = {
    id: `a_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    token: String(token).toUpperCase(),
    title: String(title),
    description: String(description || ''),
    severity: ['critical','warning','info'].includes(severity) ? severity : 'info',
    deadline: new Date(deadline).toISOString(),
  };
  alerts.push(item);
  persistAlerts();
  res.status(201).json(item);
});

// --- API: Market snapshot (free-tier friendly) -------------------------------
app.get('/api/market/snapshot', async (req, res) => {
  const symbols = String(req.query.symbols || '')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);

  if (!symbols.length) return res.json({ items: [], note: 'No symbols selected.' });

  const note = POLYGON_KEY
    ? 'End-of-day aggregates via Polygon (free tier).'
    : 'No API key set — showing empty EOD snapshot.';

  const items = [];
  for (const sym of symbols) {
    const ticker = mapSymbolToPolygon(sym);
    if (!ticker || !POLYGON_KEY) {
      items.push({ token: sym, lastPrice: null, dayChangePct: null, change30mPct: null, error: 'no-data' });
      continue;
    }
    try {
      // Free plan: previous-day aggregate (EOD)
      const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev?adjusted=true&apiKey=${POLYGON_KEY}`;
      const r = await fetch(url);
      if (!r.ok) {
        items.push({ token: sym, lastPrice: null, dayChangePct: null, change30mPct: null, error: `http-${r.status}` });
        continue;
      }
      const json = await r.json();
      const rec = (json.results && json.results[0]) || null;
      if (!rec) {
        items.push({ token: sym, lastPrice: null, dayChangePct: null, change30mPct: null, error: 'no-results' });
        continue;
      }
      const lastPrice = rec.c ?? null;
      const open = rec.o ?? null;
      const dayChangePct = (lastPrice != null && open != null && open !== 0) ? ((lastPrice - open) / open) * 100 : null;
      items.push({ token: sym, lastPrice, dayChangePct, change30mPct: null });
    } catch (e) {
      items.push({ token: sym, lastPrice: null, dayChangePct: null, change30mPct: null, error: 'fetch-failed' });
    }
  }

  res.json({ items, note });
});

// --- API: Auto alerts derived from EOD move ----------------------------------
app.get('/api/market/auto-alerts', async (req, res) => {
  const symbols = String(req.query.symbols || '')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);

  // Reuse snapshot data to derive alerts
  const snapRes = await fetch(`${req.protocol}://${req.get('host')}/api/market/snapshot?symbols=${encodeURIComponent(symbols.join(','))}`);
  const { items = [] } = (await snapRes.json()) || {};

  const now = Date.now();
  const mk = [];

  items.forEach(it => {
    const pct = typeof it.dayChangePct === 'number' ? it.dayChangePct : null;
    if (pct == null) return;

    let sev = 'info';
    let title = 'Daily move';
    if (pct <= -10) { sev = 'critical'; title = 'Sharp drawdown'; }
    else if (pct <= -5) { sev = 'warning'; title = 'Drawdown'; }
    else if (pct >= 8) { sev = 'warning'; title = 'Spike up'; }

    if (sev !== 'info') {
      mk.push({
        token: it.token,
        title,
        description: `EOD change ${pct.toFixed(2)}%. Review exposure if needed.`,
        severity: sev,
        deadline: new Date(now + 6 * 3600 * 1000).toISOString() // next 6h
      });
    }
  });

  res.json(mk);
});

// --- Health ------------------------------------------------------------------
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// --- Static files ------------------------------------------------------------
const distDir = path.resolve(__dirname, 'dist');
app.use(express.static(distDir));
// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
