// server.js
const fs = require('fs');
const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, 'data');
const ALERTS_PATH = path.join(DATA_DIR, 'alerts.json');
const POLYGON_KEY = process.env.POLYGON_API_KEY || '';
const ADMIN_SEED_KEY = process.env.ADMIN_SEED_KEY || ''; // optional
const RESEED_ON_BOOT = process.env.RESEED_ON_BOOT === '1';

fs.mkdirSync(DATA_DIR, { recursive: true });
app.use(express.json());

// ---------- Helpers ----------
function readJsonSafe(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function writeJsonSafe(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function h(hours)  { return hours * 3600 * 1000; }
function d(days)   { return days * 24 * 3600 * 1000; }
function deadline(ms) { return new Date(Date.now() + ms).toISOString(); }

function mapSymbolToPolygon(sym) {
  const m = {
    BTC: 'X:BTCUSD', ETH: 'X:ETHUSD', USDC: 'X:USDCUSD', MATIC: 'X:MATICUSD',
    DOGE: 'X:DOGEUSD', ADA: 'X:ADAUSD', SOL: 'X:SOLUSD', POL: 'X:POLUSD',
    UNI: 'X:UNIUSD', LINK: 'X:LINKUSD'
  };
  return m[sym] || null;
}

// ---------- Seed data ----------
function buildSeedAlerts() {
  return [
    { token:'BTC',  title:'Wallet update recommended',    description:'Upgrade to the latest client to ensure network compatibility.', severity:'info',     deadline:deadline(h(36)) },
    { token:'BTC',  title:'Exchange exploit watch',       description:'Monitor positions; review counterparty risk.',                 severity:'critical', deadline:deadline(h(6))  },
    { token:'ETH',  title:'Validator maintenance window', description:'Possible brief latency. No action required for holders.',     severity:'warning',  deadline:deadline(h(12)) },
    { token:'ETH',  title:'Contract vuln disclosed',      description:'Dev team preparing patch; avoid interacting with risky dApps.',severity:'critical', deadline:deadline(h(8))  },
    { token:'USDC', title:'Issuer compliance update',     description:'Routine disclosure posted; peg stable.',                       severity:'info',     deadline:deadline(d(3))  },
    { token:'MATIC',title:'Migrate to POL (tooling live)',description:'Bridge & swap now for best support.',                          severity:'warning',  deadline:deadline(d(4))  },
    { token:'POL',  title:'Bridge maintenance',           description:'Expect brief delays on withdrawals.',                          severity:'info',     deadline:deadline(d(2))  },
    { token:'SOL',  title:'Validator upgrade window',     description:'Operators: schedule upgrades; holders: no action.',            severity:'warning',  deadline:deadline(d(2))  },
    { token:'DOGE', title:'Client update available',      description:'Security & reliability improvements.',                         severity:'info',     deadline:deadline(d(5))  },
    { token:'ADA',  title:'Governance vote closing',      description:'Review proposal & cast vote if delegated.',                    severity:'warning',  deadline:deadline(d(1)+h(8)) },
    { token:'UNI',  title:'Treasury proposal snapshot',   description:'Discussion trending; vote opens soon.',                        severity:'info',     deadline:deadline(d(3))  },
    { token:'LINK', title:'Oracle upgrade rollout',       description:'Some feeds migrating to new version.',                         severity:'info',     deadline:deadline(d(4))  }
  ].map((a, i) => ({ id: `seed-${i+1}`, ...a }));
}

let alerts = readJsonSafe(ALERTS_PATH, null);
if (RESEED_ON_BOOT || !Array.isArray(alerts) || alerts.length === 0) {
  alerts = buildSeedAlerts();
  writeJsonSafe(ALERTS_PATH, alerts);
}

// ---------- Alerts API ----------
app.get('/api/alerts', (_req, res) => res.json(alerts));

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
  writeJsonSafe(ALERTS_PATH, alerts);
  res.status(201).json(item);
});

// --- Admin reseed (replace or append) ---
app.post('/api/admin/reseed', (req, res) => {
  // Optional key check
  const key = req.query.key || req.body?.key;
  if (ADMIN_SEED_KEY && key !== ADMIN_SEED_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const mode = (req.query.mode || 'replace').toLowerCase(); // replace | append
  const seeds = buildSeedAlerts();
  alerts = (mode === 'append') ? alerts.concat(seeds) : seeds;
  writeJsonSafe(ALERTS_PATH, alerts);
  res.json({ ok: true, mode, count: alerts.length });
});

// ---------- Market (free-tier friendly) ----------
app.get('/api/market/snapshot', async (req, res) => {
  const symbols = String(req.query.symbols || '')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

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
    } catch {
      items.push({ token: sym, lastPrice: null, dayChangePct: null, change30mPct: null, error: 'fetch-failed' });
    }
  }

  res.json({ items, note });
});

app.get('/api/market/auto-alerts', async (req, res) => {
  const symbols = String(req.query.symbols || '')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

  // Reuse snapshot data to derive alerts
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const snapRes = await fetch(`${baseUrl}/api/market/snapshot?symbols=${encodeURIComponent(symbols.join(','))}`);
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
        deadline: new Date(now + h(6)).toISOString()
      });
    }
  });
  res.json(mk);
});

// ---------- Health & static ----------
app.get('/healthz', (_req, res) => res.json({ ok: true }));

const distDir = path.resolve(__dirname, 'dist');
app.use(express.static(distDir));
app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
