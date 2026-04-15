/**
 * Market API Routes
 * Handles token prices, market data, and logo proxy endpoints
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');
const { log } = require('../lib/logger');

const router = express.Router();

// Constants from environment
const CMC_API_KEY = process.env.CMC_API_KEY || '';
const COINGECKO_API_KEY = process.env.GEKO || process.env.COINGECKO_API_KEY || '';
const LOGOKIT_API_KEY = process.env.LOGOKIT_API_KEY || 'pk_fr3b615a522b603695a025';
const MARKET_CURRENCY = (process.env.MARKET_CURRENCY || 'GBP').toUpperCase();
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../data');

// Logo cache configuration
const logoCache = new Map(); // key -> { t, contentType, body }
const coinGeckoIdCache = new Map(); // symbol -> coin_id mapping cache
const LOGO_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year
const LOGO_CACHE_DIR = path.join(DATA_DIR, 'logo-cache');
try { fs.mkdirSync(LOGO_CACHE_DIR, { recursive: true }); } catch {}

// CoinGecko symbol to ID mapping cache (7 days)
const COINGECKO_ID_TTL_MS = 7 * 24 * 60 * 60 * 1000;
let coinGeckoList = null;
let coinGeckoListFetchedAt = 0;

// Market data cache
const cmcStatsCache = new Map(); // key -> { t, data }
const cmcOhlcvCache = new Map(); // key -> { t, data }
const CMC_STATS_TTL_MS = 60 * 1000;
const CMC_OHLCV_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Price history cache
const priceHistoryCache = new Map(); // key: SYMBOL:days:currency -> { t, data }
const PRICE_HISTORY_TTL_MS = 10 * 60 * 1000;

// Token list cache
let cachedTokenList = null;
let tokenListTimestamp = 0;
const TOKEN_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// CMC symbol mapping file
const CMC_MAP_FILE = path.join(DATA_DIR, 'cmc_symbol_map.json');

// Helper to read JSON safely
function readJsonSafe(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

let cmcSymbolMap = readJsonSafe(CMC_MAP_FILE, {});

// Static CMC IDs for common symbols
const CMC_STATIC_IDS = {
  BTC: 1, ETH: 1027, USDT: 825, USDC: 3408, BNB: 1839, SOL: 5426, XRP: 52, ADA: 2010,
  DOGE: 74, TRX: 1958, TON: 11419, DOT: 6636, MATIC: 3890, POL: 28321, LINK: 1975,
  UNI: 7083, AVAX: 5805, LTC: 2, BCH: 1831, BSV: 3602, ETC: 1321, XLM: 512, HBAR: 4642,
  APT: 21794, ARB: 11841, OP: 11840, SUI: 20947, NEAR: 6535, ICP: 8916, MKR: 1518,
  AAVE: 7278, COMP: 5692, SNX: 2586, CRV: 6538, BAL: 5728, YFI: 5864, ZEC: 1437,
  DASH: 131, EOS: 1765, FIL: 2280, VET: 3077, XTZ: 2011, KSM: 5034, GLMR: 6836,
  TAO: 22974
};

/* ============================================================
   CoinGecko Logo & Symbol Resolution
   ============================================================ */

/**
 * Get CoinGecko ID for a token symbol
 * Checks well-known coins first, then fetches from API
 */
async function getCoinGeckoId(symbol) {
  const sym = symbol.toUpperCase();

  // Check memory cache first
  const cached = coinGeckoIdCache.get(sym);
  if (cached && (Date.now() - cached.t < COINGECKO_ID_TTL_MS)) {
    return cached.id;
  }

  // Well-known coin IDs
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
    'SUI': 'sui',
    'PEPE': 'pepe',
    'WIF': 'dogwifcoin',
    'BONK': 'bonk',
    'FLOKI': 'floki',
    'TAO': 'bittensor'
  };

  // Return well-known coin immediately
  if (wellKnownCoins[sym]) {
    const coinId = wellKnownCoins[sym];
    coinGeckoIdCache.set(sym, { id: coinId, t: Date.now() });
    return coinId;
  }

  // Fetch full coin list if needed
  if (!coinGeckoList || (Date.now() - coinGeckoListFetchedAt > COINGECKO_ID_TTL_MS)) {
    try {
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
        log.debug(`✅ CoinGecko coin list fetched: ${coinGeckoList.length} coins`);
      } else {
        log.warn(`⚠️ CoinGecko list fetch failed (${resp.status})`);
        const freeResp = await fetch('https://api.coingecko.com/api/v3/coins/list');
        if (freeResp.ok) {
          coinGeckoList = await freeResp.json();
          coinGeckoListFetchedAt = Date.now();
          log.debug(`✅ CoinGecko coin list fetched (free API): ${coinGeckoList.length} coins`);
        }
      }
    } catch (err) {
      log.error('❌ Failed to fetch CoinGecko coin list:', err.message);
    }
  }

  // Find matching coin by symbol
  if (coinGeckoList) {
    const exactMatches = coinGeckoList.filter(c => c.symbol.toUpperCase() === sym);

    if (exactMatches.length > 0) {
      const match = exactMatches[0];
      coinGeckoIdCache.set(sym, { id: match.id, t: Date.now() });
      return match.id;
    }
  }

  return null;
}

/**
 * Get logo URL from CoinGecko API
 */
async function getLogoUrl(symbol) {
  const sym = String(symbol).toUpperCase();

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
        if (coinData.image && coinData.image.large) {
          return coinData.image.large;
        }
      } else if (COINGECKO_API_KEY) {
        const freeUrl = `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`;
        const freeResp = await fetch(freeUrl);
        if (freeResp.ok) {
          const coinData = await freeResp.json();
          if (coinData.image && coinData.image.large) {
            return coinData.image.large;
          }
        }
      }
    }
  } catch (err) {
    console.warn(`⚠️ Failed to get logo URL for ${sym}:`, err.message);
  }

  return null;
}

/* ============================================================
   Database Cache Functions for Logos
   ============================================================ */

async function readFromDbCache(sym) {
  try {
    const result = await pool.query(
      'SELECT image_data, content_type, updated_at FROM logo_cache WHERE symbol = $1',
      [sym]
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      const age = Date.now() - new Date(row.updated_at).getTime();
      return {
        buf: row.image_data,
        ct: row.content_type,
        age: age
      };
    }
  } catch (err) {
    console.error(`Failed to read logo from DB for ${sym}:`, err.message);
  }
  return null;
}

async function writeToDbCache(sym, buf, ct) {
  try {
    await pool.query(
      `INSERT INTO logo_cache (symbol, image_data, content_type, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (symbol)
       DO UPDATE SET image_data = $2, content_type = $3, updated_at = CURRENT_TIMESTAMP`,
      [sym, buf, ct]
    );
  } catch (err) {
    console.error(`Failed to write logo to DB for ${sym}:`, err.message);
  }
}

/* ============================================================
   Disk Cache Functions (Legacy)
   ============================================================ */

function diskPathFor(sym, ext) {
  return path.join(LOGO_CACHE_DIR, `${sym}.${ext}`);
}

function extForContentType(ct) {
  return (ct && ct.includes('svg')) ? 'svg' : 'png';
}

function readFromDiskCache(sym) {
  try {
    const candidates = ['svg','png'];
    for (const ext of candidates) {
      const p = diskPathFor(sym, ext);
      if (fs.existsSync(p)) {
        const buf = fs.readFileSync(p);
        const ct = ext === 'svg' ? 'image/svg+xml' : 'image/png';
        const st = fs.statSync(p);
        const age = Date.now() - st.mtimeMs;
        return { buf, ct, age };
      }
    }
  } catch {}
  return null;
}

function writeToDiskCache(sym, buf, ct) {
  try {
    const ext = extForContentType(ct);
    fs.writeFileSync(diskPathFor(sym, ext), buf);
  } catch {}
}

/* ============================================================
   Background Logo Refresh
   ============================================================ */

async function refreshLogoInBackground(sym) {
  try {
    const coinId = await getCoinGeckoId(sym);
    if (!coinId) return;

    let coinUrl = COINGECKO_API_KEY
      ? `https://api.coingecko.com/api/v3/coins/${coinId}?x_cg_demo_api_key=${COINGECKO_API_KEY}&localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`
      : `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`;

    const coinResp = await fetch(coinUrl);
    if (!coinResp.ok) return;

    const coinData = await coinResp.json();
    const logoUrl = coinData.image?.large || coinData.image?.small;
    if (!logoUrl) return;

    const resp = await fetch(logoUrl);
    if (!resp.ok) return;

    const buf = Buffer.from(await resp.arrayBuffer());
    const ct = resp.headers.get('content-type') || 'image/png';

    await writeToDbCache(sym, buf, ct);
    console.log(`✅ Refreshed logo for ${sym} in background`);
  } catch (err) {
    // Silently fail
  }
}

/* ============================================================
   CMC Market Data Functions
   ============================================================ */

/**
 * Get OHLCV data from CoinMarketCap
 */
async function getCmcOhlcvData(ids, currency) {
  const cacheKey = `ohlcv:${ids.join(',')}:${currency}`;
  const hit = cmcOhlcvCache.get(cacheKey);
  if (hit && Date.now() - hit.t < CMC_OHLCV_TTL_MS) {
    return hit.data;
  }

  try {
    const params = new URLSearchParams({
      id: ids.join(','),
      convert: 'USD'
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

/**
 * Get CMC IDs for token symbols
 */
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

/**
 * Track API calls for statistics
 */
async function trackAPICall(serviceName, endpoint) {
  try {
    await pool.query(
      `INSERT INTO api_call_tracking (service_name, endpoint, call_count, last_called_at)
       VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
       ON CONFLICT (service_name, endpoint)
       DO UPDATE SET
         call_count = api_call_tracking.call_count + 1,
         last_called_at = CURRENT_TIMESTAMP`,
      [serviceName, endpoint]
    );
  } catch (error) {
    // Don't fail the main request if tracking fails
  }
}

/* ============================================================
   Currency Helper
   ============================================================ */

function currencySymbol(code) {
  const m = {
    USD: '$', GBP: '£', EUR: '€', JPY: '¥', AUD: 'A$', CAD: 'C$',
    CHF: 'CHF', CNY: '¥', HKD: 'HK$', SGD: 'S$', NZD: 'NZ$'
  };
  return m[String(code||'').toUpperCase()] || code || '$';
}

/* ============================================================
   ROUTES
   ============================================================ */

/**
 * GET /api/logo/:symbol
 * Logo proxy with multi-source fallback and caching
 */
router.get('/api/logo/:symbol', async (req, res) => {
  try {
    const sym = String(req.params.symbol || '').toUpperCase().replace(/[^A-Z0-9]/g,'');
    if (!sym) return res.status(400).send('bad symbol');

    const cacheKey = `logo:${sym}`;
    const hit = logoCache.get(cacheKey);
    if (hit && Date.now() - hit.t < LOGO_TTL_MS) {
      res.setHeader('Content-Type', hit.contentType || 'image/svg+xml');
      return res.send(hit.body);
    }

    // Try PostgreSQL cache first
    const db = await readFromDbCache(sym);
    if (db) {
      logoCache.set(cacheKey, { t: Date.now(), contentType: db.ct, body: db.buf });
      res.setHeader('Content-Type', db.ct);
      res.setHeader('Cache-Control', 'public, max-age=86400');

      // Background refresh if old
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      if (db.age > thirtyDays) {
        refreshLogoInBackground(sym).catch(() => {});
      }

      return res.send(db.buf);
    }

    // Helper to try a URL
    async function tryUrl(url) {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const buf = Buffer.from(await resp.arrayBuffer());
      const ct = resp.headers.get('content-type') || (url.endsWith('.svg') ? 'image/svg+xml' : 'image/png');
      return { buf, ct };
    }

    const urls = [];

    // 1) CoinGecko API (primary)
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
            if (coinData.image.large) urls.push(coinData.image.large);
            if (coinData.image.small) urls.push(coinData.image.small);
            if (coinData.image.thumb) urls.push(coinData.image.thumb);
          }
        } else if (COINGECKO_API_KEY) {
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

    // 3) Cryptoicons (SVG)
    const lower = sym.toLowerCase();
    urls.push(`https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/${lower}.svg`);

    let found = null;
    for (const u of urls) {
      try {
        found = await tryUrl(u);
        if (found) break;
      } catch(_) {}
    }
    if (!found) throw new Error('no_logo');

    logoCache.set(cacheKey, { t: Date.now(), contentType: found.ct, body: found.buf });
    await writeToDbCache(sym, found.buf, found.ct);
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

/**
 * GET /api/tokens
 * Return list of available tokens
 */
router.get('/api/tokens', async (req, res) => {
  if (cachedTokenList && (Date.now() - tokenListTimestamp < TOKEN_CACHE_TTL)) {
    return res.json({ tokens: cachedTokenList, cached: true });
  }

  const tokens = [];

  if (CMC_API_KEY) {
    try {
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

        cachedTokenList = tokens;
        tokenListTimestamp = Date.now();

        return res.json({ tokens, cached: false, provider: 'cmc' });
      }
    } catch (err) {
      console.error('Failed to fetch CMC token list:', err.message);
    }
  }

  // Fallback: Get unique tokens from database
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
        tokens.push({ symbol, name: symbol });
      }
    });

    cachedTokenList = tokens;
    tokenListTimestamp = Date.now();

    return res.json({ tokens, cached: false, provider: 'fallback' });
  } catch (err) {
    console.error('Failed to fetch tokens from database:', err.message);
    return res.status(500).json({ error: 'Failed to fetch token list' });
  }
});

/**
 * GET /api/market/snapshot
 * Get live prices and market data for symbols
 */
router.get('/api/market/snapshot', async (req, res) => {
  const symbols = String(req.query.symbols||'').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
  const requestedCurrency = String(req.query.currency || MARKET_CURRENCY).toUpperCase();

  if (!symbols.length) return res.json({ items:[], note:'No symbols selected.', provider: CMC_API_KEY ? 'cmc' : 'none' });

  // Try CMC first if configured
  if (CMC_API_KEY) {
    try {
      const idsMap = await getCmcIdsForSymbols(symbols);
      const ids = symbols.map(s => idsMap[s]).filter(Boolean);
      if (!ids.length) return res.json({ items: symbols.map(s=>({ token:s, lastPrice:null, dayChangePct:null, change30mPct:null, error:'no-id' })), note: `CoinMarketCap quotes (~60s). No IDs found.`, provider: 'cmc' });

      const cacheKey = `stats:${ids.join(',')}:${requestedCurrency}`;
      const hit = cmcStatsCache.get(cacheKey);
      if (hit && Date.now() - hit.t < CMC_STATS_TTL_MS) {
        return res.json({ items: hit.data, note: `CoinMarketCap quotes (~60s) — ${requestedCurrency}` , provider: 'cmc' });
      }

      const params = new URLSearchParams({
        id: ids.join(','),
        convert: requestedCurrency
      });
      const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?${params.toString()}`;
      const r = await fetch(url, { headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY } });

      await trackAPICall('CoinMarketCap', '/v1/cryptocurrency/quotes/latest');

      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const quotesData = j?.data || {};

      const cur = requestedCurrency;
      const items = symbols.map(sym => {
        const id = idsMap[sym];
        const row = quotesData[id] || null;
        if (!row) return { token: sym, lastPrice: null, dayChangePct: null, change30mPct: null, high24h: null, low24h: null, ath: null, atl: null, error: 'no-data' };

        const quote = row.quote?.[cur] || {};

        return {
          token: sym,
          lastPrice: quote.price ?? null,
          dayChangePct: typeof quote.percent_change_24h === 'number' ? quote.percent_change_24h : null,
          change1hPct: typeof quote.percent_change_1h === 'number' ? quote.percent_change_1h : null,
          change7dPct: typeof quote.percent_change_7d === 'number' ? quote.percent_change_7d : null,
          change30dPct: typeof quote.percent_change_30d === 'number' ? quote.percent_change_30d : null,
          change30mPct: null,
          volume24h: typeof quote.volume_24h === 'number' ? quote.volume_24h : null,
          volumeChange24h: typeof quote.volume_change_24h === 'number' ? quote.volume_change_24h : null,
          marketCap: typeof quote.market_cap === 'number' ? quote.market_cap : null,
          high24h: null,
          low24h: null,
          ath: null,
          atl: null
        };
      });

      const hasValidData = items.some(item => item.lastPrice !== null && item.lastPrice !== undefined);

      if (hasValidData) {
        const nullPriceSymbols = items.filter(item => item.lastPrice === null).map(item => item.token);

        if (nullPriceSymbols.length > 0 && COINGECKO_API_KEY) {
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
          }
        }

        cmcStatsCache.set(cacheKey, { t: Date.now(), data: items });
        return res.json({ items, note: `CoinMarketCap quotes (~60s) — ${requestedCurrency}`, provider: 'cmc+coingecko', currency: requestedCurrency });
      }
    } catch(e) {
      console.warn('CMC API error:', e.message);
    }
  }

  // Fallback to CoinGecko
  try {
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

    const currencyLower = requestedCurrency.toLowerCase();
    const priceUrl = COINGECKO_API_KEY
      ? `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds.join(',')}&vs_currencies=${currencyLower}&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true&x_cg_demo_api_key=${COINGECKO_API_KEY}`
      : `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds.join(',')}&vs_currencies=${currencyLower}&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`;

    const priceResp = await fetch(priceUrl);

    if (!priceResp.ok) {
      if (priceResp.status === 429) {
        log.warn('CoinGecko rate limit hit (429)');
        throw new Error('Rate limit exceeded - try again in a moment');
      }
      throw new Error(`CoinGecko HTTP ${priceResp.status}`);
    }

    const priceData = await priceResp.json();

    const items = symbols.map(sym => {
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
        change1hPct: null,
        change7dPct: null,
        change30dPct: null,
        change30mPct: null,
        volume24h: data[volKey] ?? null,
        volumeChange24h: null,
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
    log.warn('CoinGecko API error:', e.message);
    const items = symbols.map(s=>({ token:s, lastPrice:null, dayChangePct:null, change30mPct:null, error:'coingecko-failed' }));

    const errorNote = e.message.includes('Rate limit')
      ? 'CoinGecko rate limit reached. Data will refresh automatically in a moment.'
      : `CoinGecko API error: ${e.message}`;

    return res.json({ items, note: errorNote, provider: 'coingecko', currency: requestedCurrency });
  }
});

/**
 * GET /api/price-history/:symbol
 * Price history for sparkline charts
 */
router.get('/api/price-history/:symbol', async (req, res) => {
  try {
    const symbol = String(req.params.symbol || '').trim().toUpperCase();
    if (!symbol) return res.status(400).json({ error: 'symbol required' });
    const days = Math.max(1, Math.min(90, parseInt(req.query.days || '7', 10) || 7));
    const currency = String(req.query.currency || 'USD').toUpperCase();

    const cacheKey = `${symbol}:${days}:${currency}`;
    const hit = priceHistoryCache.get(cacheKey);
    if (hit && Date.now() - hit.t < PRICE_HISTORY_TTL_MS) {
      return res.json(hit.data);
    }

    const coinId = await getCoinGeckoId(symbol);
    if (!coinId) return res.status(404).json({ error: 'unknown_symbol', symbol });

    const vs = currency.toLowerCase();
    const baseUrl = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=${vs}&days=${days}`;
    const url = COINGECKO_API_KEY
      ? `${baseUrl}&x_cg_demo_api_key=${COINGECKO_API_KEY}`
      : baseUrl;

    const r = await fetch(url);
    await trackAPICall('CoinGecko', '/coins/{id}/market_chart');
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return res.status(502).json({ error: 'coingecko_failed', status: r.status, detail: text.slice(0, 200) });
    }
    const j = await r.json();
    const raw = Array.isArray(j.prices) ? j.prices : [];

    // Down-sample to ~60 points
    const target = 60;
    const step = raw.length > target ? Math.floor(raw.length / target) : 1;
    const points = [];
    for (let i = 0; i < raw.length; i += step) {
      const p = raw[i];
      if (Array.isArray(p) && p.length >= 2) points.push({ t: p[0], price: p[1] });
    }
    if (raw.length && points[points.length - 1]?.t !== raw[raw.length - 1][0]) {
      const last = raw[raw.length - 1];
      points.push({ t: last[0], price: last[1] });
    }

    const data = { symbol, currency, days, points };
    priceHistoryCache.set(cacheKey, { t: Date.now(), data });
    return res.json(data);
  } catch (err) {
    log.warn('[price-history] error:', err.message);
    return res.status(500).json({ error: 'price_history_failed', detail: err.message });
  }
});

/**
 * GET /api/market/prices
 * Lightweight prices endpoint for ticker
 */
router.get('/api/market/prices', async (req, res) => {
  const symbols = String(req.query.symbols||'').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
  const currency = String(req.query.currency || 'USD').toUpperCase();

  if (!symbols.length) return res.json({ prices: [] });

  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const snapRes = await fetch(`${baseUrl}/api/market/snapshot?symbols=${encodeURIComponent(symbols.join(','))}&currency=${currency}`);
    const { items=[] } = (await snapRes.json()) || {};

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

/**
 * GET /api/market/auto-alerts
 * Generate auto alert suggestions based on price movements
 */
router.get('/api/market/auto-alerts', async (req, res) => {
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

/**
 * GET /api/market/config
 * Market configuration and currency symbols
 */
router.get('/api/market/config', (_req, res) => {
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
    currencySymbols
  });
});

/**
 * GET /api/environment
 * Environment information
 */
router.get('/api/environment', (_req, res) => {
  const env = process.env.NODE_ENV || process.env.RAILWAY_ENVIRONMENT || 'production';
  res.json({
    environment: env.toLowerCase(),
    isProduction: env.toLowerCase() === 'production'
  });
});

/* ============================================================
   EXPORTS
   ============================================================ */

module.exports = router;

// Export functions for use in other modules
module.exports.getLogoUrl = getLogoUrl;
module.exports.getCoinGeckoId = getCoinGeckoId;
module.exports.MARKET_CURRENCY = MARKET_CURRENCY;
module.exports.trackAPICall = trackAPICall;
