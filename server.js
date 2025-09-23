// server.js (free-plan compatible)
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'alerts.json');

// Use env in prod; demo uses provided key
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'e7Zx66Rf0ltgSTp3PCs6iWvfN9P6Oig5';

// Map tokens -> Polygon crypto tickers
const SYMBOL_MAP = {
  BTC: 'X:BTCUSD',
  ETH: 'X:ETHUSD',
  USDC: 'X:USDCUSD',
  MATIC: 'X:MATICUSD',
  DOGE: 'X:DOGEUSD',
  ADA: 'X:ADAUSD',
  SOL: 'X:SOLUSD',
  POL: 'X:POLUSD', // if missing in response, we’ll mark unavailable
  UNI: 'X:UNIUSD',
  LINK: 'X:LINKUSD'
};

// simple cache
const cache = new Map();
function getCache(k){ const v = cache.get(k); if(!v) return null; if(Date.now()-v.ts>v.ttl){ cache.delete(k); return null; } return v.data; }
function setCache(k,data,ttl){ cache.set(k,{data, ts:Date.now(), ttl}); }

app.use(express.json());

// ----------------------- Alerts persistence ----------------------------------
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
const loadAlerts = () => { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')||'[]'); } catch { return []; } };
const saveAlerts = (list) => fs.writeFileSync(DATA_FILE, JSON.stringify(list,null,2), 'utf-8');

app.get('/api/alerts', (_req,res)=> res.json(loadAlerts()));
app.post('/api/alerts', (req,res)=>{
  const { token, severity, title, description, deadline } = req.body || {};
  if (!token || !severity || !title || !description || !deadline) {
    return res.status(400).json({ error:'Invalid alert payload' });
  }
  const alerts = loadAlerts();
  alerts.push({ token:String(token).toUpperCase(), severity, title, description, deadline });
  saveAlerts(alerts);
  res.status(201).json(alerts);
});

// ----------------------- Polygon helpers (free plan) -------------------------
// We use grouped daily OHLC for ALL crypto tickers for a given UTC date.
// That is EOD data and allowed on the free tier.
async function fetchJson(url){
  const r = await fetch(url);
  if (!r.ok){
    const txt = await r.text().catch(()=> '');
    throw new Error(`${r.status} ${r.statusText}: ${txt.slice(0,200)}`);
  }
  return r.json();
}

// get YYYY-MM-DD for "yesterday" in UTC (latest completed day)
function yesterUtc(){
  const d = new Date(Date.now() - 24*60*60*1000);
  return d.toISOString().slice(0,10);
}

// Load grouped daily once (cache 5 minutes)
async function getGroupedDaily(dateStr){
  const key = `grp:${dateStr}`;
  const hit = getCache(key);
  if (hit) return hit;

  const url = `https://api.polygon.io/v2/aggs/grouped/locale/global/market/crypto/${dateStr}?adjusted=true&apiKey=${POLYGON_API_KEY}`;
  const json = await fetchJson(url);
  const results = json?.results || [];

  // Map by ticker (e.g., X:BTCUSD)
  const byTicker = new Map();
  results.forEach(row => { if (row && row.T) byTicker.set(row.T, row); });

  setCache(key, byTicker, 5*60*1000);
  return byTicker;
}

// ----------------------- Market snapshot (EOD) -------------------------------
app.get('/api/market/snapshot', async (req,res)=>{
  try{
    const dateStr = yesterUtc(); // EOD of previous UTC day
    const byTicker = await getGroupedDaily(dateStr);

    // figure out which tokens to return (we’ll allow many; response uses one API call)
    const tokens = (req.query.symbols || '')
      .split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
    const list = tokens.length ? tokens : Object.keys(SYMBOL_MAP);

    const items = list.map(token=>{
      const ticker = SYMBOL_MAP[token];
      if (!ticker) return { token, error:'unsupported' };
      const row = byTicker.get(ticker);
      if (!row) return { token, ticker, lastPrice:null, dayChangePct:null, error:'unavailable (EOD only)' };

      const open = Number(row.o ?? 0);
      const close = Number(row.c ?? 0);
      const dayChangePct = open>0 ? ((close-open)/open)*100 : null;

      return {
        token,
        ticker,
        lastPrice: close,
        dayChangePct,
        change30mPct: null // not available on free plan
      };
    });

    res.json({ items, ts: Date.now(), note: `EOD data for ${dateStr} (free plan)` });
  }catch(e){
    res.status(502).json({ error:String(e) });
  }
});

// ----------------------- Auto alerts (based on DAILY move) -------------------
// Free plan can’t detect intraday 30m drops. We’ll generate alerts from EOD % change:
//  warning if <= -5%, critical if <= -10%. Deadline = today 23:59 UTC.
app.get('/api/market/auto-alerts', async (req,res)=>{
  try{
    const dateStr = yesterUtc();
    const byTicker = await getGroupedDaily(dateStr);

    const tokens = (req.query.symbols || '')
      .split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
    const list = tokens.length ? tokens : Object.keys(SYMBOL_MAP);

    const out = [];
    for (const token of list){
      const ticker = SYMBOL_MAP[token];
      if (!ticker) continue;
      const row = byTicker.get(ticker);
      if (!row) continue;

      const open = Number(row.o ?? 0);
      const close = Number(row.c ?? 0);
      if (!open) continue;

      const pct = ((close-open)/open)*100;
      let severity = null;
      if (pct <= -10) severity = 'critical';
      else if (pct <= -5) severity = 'warning';
      if (!severity) continue;

      out.push({
        token,
        severity,
        title: severity==='critical'
          ? `Down ${pct.toFixed(1)}% today (EOD)`
          : `Down ${pct.toFixed(1)}% today (EOD)`,
        description: 'Daily move exceeded your risk threshold (free-tier EOD data).',
        deadline: new Date(Date.now() + 12*60*60*1000).toISOString(),
        generated: true
      });
    }
    res.json(out);
  }catch(e){
    res.status(502).json({ error:String(e) });
  }
});

// ----------------------- Static frontend serve -------------------------------
const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_req,res)=> res.sendFile(path.join(distDir,'index.html')));
} else {
  app.use(express.static(__dirname));
  app.get('/', (_req,res)=> res.sendFile(path.join(__dirname,'index.html')));
}

app.listen(PORT, ()=> {
  console.log(`✅ Backend on http://localhost:${PORT}`);
});
