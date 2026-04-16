// server.js - Thin orchestrator
// Route logic lives in routes/*, shared utilities in lib/*
if (!process.env.RAILWAY_ENVIRONMENT) {
  require('dotenv').config();
}

const fs = require('fs');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');

// --- Shared modules ---
const log = require('./lib/logger');
const { pool, initDB, trackAPICall } = require('./lib/db');
const {
  corsOptions,
  requireAdmin,
  createAnonUserMiddleware,
  sessions, setSession, getSession,
  ADMIN_TOKEN, ADMIN_EMAILS,
  chatRateLimit
} = require('./lib/middleware');

// --- Route modules ---
const alertsRouter = require('./routes/alerts');
const chatRouter = require('./routes/chat');
const marketRouter = require('./routes/market');
const newsRouter = require('./routes/news');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const userRouter = require('./routes/user');

// --- Express app ---
const app = express();
const PORT = process.env.PORT || 3000;

// Body parsing & cookies
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// CORS on API/auth routes only
app.use('/api', cors(corsOptions));
app.use('/auth', cors(corsOptions));
app.use('/admin', cors(corsOptions));
app.use('/debug', cors(corsOptions));
app.options('*', cors(corsOptions));

// Anonymous user middleware (assigns req.uid)
app.use(createAnonUserMiddleware());

// --- Mount route modules ---
// Routers with full paths (mounted at /)
app.use(alertsRouter);   // /api/alerts/*, /admin/alerts
app.use(chatRouter);     // /api/chat, /api/me/sentinel-summary
app.use(marketRouter);   // /api/market/*, /api/tokens, /api/logo/*
app.use(newsRouter);     // /api/news, /admin/news/*
app.use(adminRouter);    // /admin/*, /debug/*, /healthz, /ready, /api/debug*

// All routers use full paths
app.use(userRouter);     // /api/me/*, /api/token-requests/*, /api/summary/*
app.use(authRouter);     // /auth/google, /auth/exchange-token, /auth/logout

// --- Database + alerts initialization ---
// initDB creates tables if missing; initializeAlerts populates the in-memory
// alerts cache from DB (falling back to data/alerts.json). Without this the
// GET /api/alerts endpoint returns [] even when alerts exist.
// adminRouter.setDependencies wires admin.js to the live alerts state so
// /admin/export/alerts.csv and /admin/alerts-ai-create see current data.
initDB()
  .then(() => alertsRouter.initializeAlerts(marketRouter.getLogoUrl, marketRouter.getCoinGeckoId))
  .then(() => {
    adminRouter.setDependencies({
      getAlerts: alertsRouter.getAlerts,
      getUsingDatabaseAlerts: alertsRouter.getUsingDatabaseAlerts,
      persistAlerts: alertsRouter.persistAlerts,
      upsertAlert: require('./lib/db').upsertAlert,
      reloadAlertsFromDatabase: alertsRouter.reloadAlertsFromDatabase
    });
    console.log(`Alerts initialized: ${alertsRouter.getAlerts().length} loaded`);
  })
  .catch((err) => console.error('Startup initialization failed:', err));

// --- Static file serving ---
const mainAppDistDir = path.resolve(__dirname, 'main-app-dist');
const adminDistDir = path.resolve(__dirname, 'dist');
const mainAppHasFiles = fs.existsSync(mainAppDistDir);
const adminHasFiles = fs.existsSync(adminDistDir);

if (mainAppHasFiles) console.log('[Static Files] main-app-dist found:', mainAppDistDir);
if (adminHasFiles) console.log('[Static Files] admin dist found:', adminDistDir);

function isMainAppHost(hostname) {
  return hostname.includes('app.crypto-lifeguard.com') ||
         hostname.includes('localhost') ||
         hostname.includes('127.0.0.1');
}

// Config.js override for same-origin
app.get('/config.js', (req, res, next) => {
  const hostname = req.hostname || req.get('host') || '';
  if (isMainAppHost(hostname)) {
    res.type('application/javascript');
    return res.send('window.BACKEND_URL = "";');
  }
  next();
});

// Static file serving based on hostname
app.use((req, res, next) => {
  const hostname = req.hostname || req.get('host') || '';
  if (isMainAppHost(hostname) && mainAppHasFiles) {
    return express.static(mainAppDistDir)(req, res, next);
  }
  if (adminHasFiles) {
    return express.static(adminDistDir)(req, res, next);
  }
  next();
});

// Public directory (icons, static assets)
const publicDir = path.resolve(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  const publicIconsDir = path.join(publicDir, 'icons');
  if (fs.existsSync(publicIconsDir)) {
    app.use('/icons', express.static(publicIconsDir, {
      setHeaders: (res) => { res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); }
    }));
    app.get('/icons/:file', (req, res, next) => {
      try {
        const fname = String(req.params.file || '');
        const p = path.join(publicIconsDir, fname);
        if (!fs.existsSync(p)) return res.status(404).end();
        if (fname.toLowerCase().endsWith('.svg')) res.type('image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.sendFile(p);
      } catch (e) { return next(); }
    });
  }
}

const mainAppPublicDir = path.join(__dirname, '../../public');
if (fs.existsSync(mainAppPublicDir)) app.use(express.static(mainAppPublicDir));
app.use(express.static(__dirname));

// SPA fallback for main frontend app
app.use((req, res, next) => {
  const hostname = req.hostname || req.get('host') || '';
  if (!isMainAppHost(hostname) || !mainAppHasFiles) return next();
  if (/^\/(api|auth|admin|debug|healthz|ready)\b/.test(req.path)) return next();
  if (/\.\w{2,5}$/.test(req.path)) return next();
  const indexPath = path.join(mainAppDistDir, 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  next();
});

// Wildcard SPA fallback for admin dashboard
app.get('*', (req, res) => {
  const hostname = req.hostname || req.get('host') || '';
  if (isMainAppHost(hostname) && mainAppHasFiles) {
    const indexPath = path.join(mainAppDistDir, 'index.html');
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  }
  if (adminHasFiles) {
    const indexPath = path.join(adminDistDir, 'index.html');
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  }
  res.status(404).send('Not found');
});

// --- Graceful shutdown ---
let server;

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  if (server) server.close(() => process.exit(1));
  else process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

// --- Start server ---
server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Process ID: ${process.pid}`);
});

server.on('error', (error) => {
  console.error('Server error:', error);
  process.exit(1);
});

process.stdin.resume();

// --- Background jobs ---
// These will be extracted to a jobs/ module in a future refactor.
// For now, they import from the route modules that export their helpers.

// Scheduled news fetch (every 5 minutes)
const { fetchNewsFromCoinDesk } = require('./routes/news');

async function scheduledNewsFetch() {
  try {
    log.debug('[Scheduled] Starting automatic news fetch...');
    const articles = await fetchNewsFromCoinDesk([]);
    if (!articles || articles.length === 0) {
      log.debug('[Scheduled] No articles fetched');
      return;
    }
    log.debug(`[Scheduled] Fetched ${articles.length} articles`);
    let addedCount = 0, updatedCount = 0;
    for (const article of articles) {
      try {
        const articleUrl = article.news_url;
        const title = article.title;
        const text = article.text || '';
        const sourceName = article.source_name || 'CoinDesk';
        const sentiment = article.sentiment || 'neutral';
        const tickers = (article.tickers || []).map(t => typeof t === 'string' ? t.toUpperCase().replace(/[^A-Z0-9]/g, '') : t).filter(Boolean);
        const imageUrl = article.image_url || null;
        const timestamp = new Date(article.date || new Date().toISOString()).getTime();
        const expiresAt = new Date(Date.now() + (120 * 24 * 60 * 60 * 1000)).toISOString();
        const existing = await pool.query('SELECT article_url FROM news_cache WHERE article_url = $1', [articleUrl]);
        if (existing.rows.length > 0) {
          await pool.query(
            `UPDATE news_cache SET title=$1, text=$2, sentiment=$3, tickers=$4, source_name=$5, image_url=$6, expires_at=$7 WHERE article_url=$8`,
            [title, text, sentiment, JSON.stringify(tickers), sourceName, imageUrl, expiresAt, articleUrl]
          );
          updatedCount++;
        } else {
          await pool.query(
            `INSERT INTO news_cache (article_url,title,text,date,sentiment,tickers,source_name,image_url,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [articleUrl, title, text, timestamp, sentiment, JSON.stringify(tickers), sourceName, imageUrl, expiresAt]
          );
          addedCount++;
        }
      } catch (e) { log.error(`[Scheduled] Article error:`, e.message); }
    }
    log.debug(`[Scheduled] News: ${addedCount} added, ${updatedCount} updated`);
  } catch (e) { log.error('[Scheduled] News fetch error:', e.message); }
}

setTimeout(() => scheduledNewsFetch(), 10000);
setInterval(scheduledNewsFetch, 5 * 60 * 1000);
console.log('Scheduled news fetching: every 5 minutes');

if (String(process.env.DEBUG_HTTP).toLowerCase() === 'true') {
  setInterval(() => console.log(`heartbeat ${new Date().toISOString()}`), 15000);
}
