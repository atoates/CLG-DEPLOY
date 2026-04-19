// routes/admin.js - Admin-only routes
// Extracted from server.js to separate concerns
// Includes: info, debug/env, SQL/schema/backup/stats endpoints, user exports, login diags, AI endpoints

const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAdmin } = require('../lib/middleware');
const { pool, trackAPICall } = require('../lib/db');
const { OPENAI_API_KEY, ANTHROPIC_API_KEY } = require('../lib/ai');

const router = express.Router();

// Configuration from environment
const DATA_DIR = process.env.DATA_DIR || './data';
const BACKUP_DIR = process.env.BACKUP_DIR || './backups';

// Dependencies injected by server.js after routes are mounted.
// Use getter functions for fields that can be reassigned in their owning
// module (alerts array, usingDatabaseAlerts flag in routes/alerts.js) so we
// never hold a stale snapshot.
let getAlerts = () => [];
let getUsingDatabaseAlerts = () => false;
let persistAlerts = () => {};
let upsertAlert = async () => {};
let reloadAlertsFromDatabase = async () => false;

// Diagnostic logging is always on in this module — the gated blocks below
// only append to the local LOGIN_DIAG_BUFFER and console.log.
const diagLog = true;

const SOURCE_TYPES = ['mainstream-media', 'social-media', 'blockchain', 'developer'];

/* ================== Injection Helper ================== */
// Call this from server.js to inject dependencies
router.setDependencies = function(deps) {
  if (typeof deps.getAlerts === 'function') getAlerts = deps.getAlerts;
  if (typeof deps.getUsingDatabaseAlerts === 'function') getUsingDatabaseAlerts = deps.getUsingDatabaseAlerts;
  if (typeof deps.persistAlerts === 'function') persistAlerts = deps.persistAlerts;
  if (typeof deps.upsertAlert === 'function') upsertAlert = deps.upsertAlert;
  if (typeof deps.reloadAlertsFromDatabase === 'function') reloadAlertsFromDatabase = deps.reloadAlertsFromDatabase;
};

/* ================== LOGIN DIAGNOSTIC LOGGING ================== */
const LOGIN_DIAG_BUFFER = [];
const LOGIN_DIAG_MAX = 500;

function pushLoginDiag(entry) {
  LOGIN_DIAG_BUFFER.push(entry);
  if (LOGIN_DIAG_BUFFER.length > LOGIN_DIAG_MAX) {
    LOGIN_DIAG_BUFFER.splice(0, LOGIN_DIAG_BUFFER.length - LOGIN_DIAG_MAX);
  }
}

function safeJson(obj) {
  try { return JSON.stringify(obj); } catch (_) { return '[unserialisable]'; }
}

// Accept log events from the frontend (no auth needed, diagnostic aid)
router.post('/api/debug-log', express.json({ limit: '32kb' }), (req, res) => {
  try {
    const { stage, data } = req.body || {};
    if (!stage || typeof stage !== 'string') {
      return res.status(400).json({ ok: false, error: 'missing_stage' });
    }
    const enriched = {
      ...(data && typeof data === 'object' ? data : {}),
      _ua: req.get('user-agent') || '',
      _origin: req.get('origin') || '',
      _referer: req.get('referer') || '',
      _cookieNames: Object.keys(req.cookies || {}),
      _ip: (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim(),
    };
    if (diagLog) {
      const entry = {
        ts: Date.now(),
        iso: new Date().toISOString(),
        source: 'client',
        stage,
        data: enriched,
      };
      pushLoginDiag(entry);
      console.log(`[LOGIN-DIAG][client] ${stage} ${safeJson(enriched || {})}`);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e && e.message });
  }
});

// Read the diagnostic buffer
router.get('/api/debug-log/recent', (req, res) => {
  const limit = Math.max(1, Math.min(500, parseInt(req.query.limit, 10) || 200));
  const entries = LOGIN_DIAG_BUFFER.slice(-limit).reverse();
  res.json({ ok: true, count: entries.length, entries });
});

// Clear the diagnostic buffer
router.post('/api/debug-log/clear', (req, res) => {
  LOGIN_DIAG_BUFFER.length = 0;
  if (diagLog) {
    const entry = {
      ts: Date.now(),
      iso: new Date().toISOString(),
      source: 'server',
      stage: 'diag-buffer-cleared',
      data: { by: req.get('user-agent') || '' },
    };
    pushLoginDiag(entry);
    console.log(`[LOGIN-DIAG][server] diag-buffer-cleared ${safeJson({ by: req.get('user-agent') || '' })}`);
  }
  res.json({ ok: true });
});

// HTML viewer for login diagnostics
router.get('/debug/login', (_req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Login diagnostics — Crypto Lifeguard</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background:#0a1628; color:#e6edf7; }
  header { position: sticky; top: 0; background:#0a1628; padding:14px 16px; border-bottom:1px solid rgba(255,255,255,.08); display:flex; gap:10px; align-items:center; }
  header h1 { margin:0; font-size:15px; font-weight:600; }
  button { background:#14b8a6; color:#04141a; border:0; border-radius:8px; padding:8px 12px; font-weight:600; font-size:13px; }
  button.ghost { background:transparent; color:#e6edf7; border:1px solid rgba(255,255,255,.18); }
  main { padding: 12px 14px 80px; }
  .entry { border:1px solid rgba(255,255,255,.08); border-radius:10px; padding:10px 12px; margin-bottom:10px; background:rgba(255,255,255,.03); }
  .stage { font-weight:700; color:#5eead4; font-size:13px; margin-bottom:2px; word-break:break-word; }
  .meta { font-size:11px; color:rgba(230,237,247,.55); margin-bottom:6px; }
  .data { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:11px; color:#c7d2fe; white-space:pre-wrap; word-break:break-word; }
  .src-client { border-left: 3px solid #14b8a6; }
  .src-server { border-left: 3px solid #60a5fa; }
  .empty { color:rgba(230,237,247,.55); text-align:center; padding:40px 0; }
</style></head>
<body>
<header>
  <h1>Login diagnostics</h1>
  <button onclick="refresh()">Refresh</button>
  <button class="ghost" onclick="clearBuffer()">Clear</button>
</header>
<main id="main"><div class="empty">Loading…</div></main>
<script>
async function refresh() {
  try {
    const r = await fetch('/api/debug-log/recent?limit=200', { credentials: 'include' });
    const j = await r.json();
    const main = document.getElementById('main');
    if (!j.entries || !j.entries.length) { main.innerHTML = '<div class="empty">No events yet. Try logging in, then tap Refresh.</div>'; return; }
    main.innerHTML = j.entries.map(function(e){
      var cls = 'entry src-' + (e.source === 'server' ? 'server' : 'client');
      var time = new Date(e.ts).toISOString().replace('T',' ').replace(/\\..+/, '');
      return '<div class="'+cls+'">' +
        '<div class="stage">'+e.stage+'</div>' +
        '<div class="meta">'+e.source+' - '+time+'</div>' +
        '<div class="data">'+escapeHtml(JSON.stringify(e.data||{}, null, 2))+'</div>' +
      '</div>';
    }).join('');
  } catch (err) {
    document.getElementById('main').innerHTML = '<div class="empty">Failed to load: '+String(err && err.message || err)+'</div>';
  }
}
async function clearBuffer() {
  try { await fetch('/api/debug-log/clear', { method:'POST' }); refresh(); } catch(_) {}
}
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
refresh();
</script>
</body></html>`);
});

/* ================== ENVIRONMENT DEBUG ENDPOINTS ================== */

router.get('/debug/env', requireAdmin, (req, res) => {
  const CMC_API_KEY = process.env.CMC_API_KEY || '';
  const MARKET_CURRENCY = process.env.MARKET_CURRENCY || 'GBP';

  // Expose whether keys are set + their length, never a prefix. Prefixes
  // end up in observability platforms and reduce brute-force search space.
  const newsKey = process.env.NEWSAPI_KEY || process.env.NEWS_API || process.env.CRYPTONEWS_API_KEY || process.env.CRYPTO_NEWS_API_KEY || '';
  const coindeskKey = process.env.COINDESK || process.env.COINDESK_API_KEY || '';
  res.json({
    NODE_ENV: process.env.NODE_ENV || 'not_set',
    CMC_API_KEY_SET: !!CMC_API_KEY,
    CMC_API_KEY_LENGTH: CMC_API_KEY ? CMC_API_KEY.length : 0,
    NEWS_API_KEY_SET: !!newsKey,
    NEWS_API_KEY_LENGTH: newsKey.length,
    COINDESK_KEY_SET: !!coindeskKey,
    COINDESK_KEY_LENGTH: coindeskKey.length,
    MARKET_CURRENCY_RESOLVED: MARKET_CURRENCY,
    MARKET_CURRENCY_RAW: process.env.MARKET_CURRENCY || 'not_set_defaulting_to_GBP',
    RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT || 'not_set',
    SERVER_LOGIC_PROVIDER: CMC_API_KEY ? 'cmc' : 'none'
  });
});

router.get('/debug/oauth', requireAdmin, (req, res) => {
  const BASE_URL = process.env.BASE_URL || '';
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

  // Compute base URL from request if env not set
  let base = BASE_URL;
  if (!base) {
    try {
      const proto = (req.headers['x-forwarded-proto'] || req.protocol || '').toString().split(',')[0].trim() || 'http';
      const host = req.get('host');
      if (host) base = `${proto}://${host}`.replace(/\/+$/,'');
    } catch {}
  }

  const redirectUri = `${String(base||'').replace(/\/+$/,'')}/auth/google/callback`;
  res.json({
    base,
    redirectUri,
    hasBaseEnv: !!BASE_URL,
    GOOGLE_CLIENT_ID_PRESENT: !!GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_ID_PREFIX: GOOGLE_CLIENT_ID ? GOOGLE_CLIENT_ID.slice(0,16) : null
  });
});

router.get('/healthz', (_req, res) => res.json({ ok: true }));

router.get('/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: true });
  } catch (err) {
    console.error('Readiness check failed', err && err.stack ? err.stack : err);
    res.status(503).json({ ok: false, db: false });
  }
});

router.get('/api/debug/env-check', requireAdmin, (_req, res) => {
  const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').filter(Boolean);

  res.json({
    adminTokenSet: !!process.env.ADMIN_TOKEN,
    adminEmailsSet: !!process.env.ADMIN_EMAILS,
    adminEmailsCount: ADMIN_EMAILS.length,
    googleOAuthConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

router.get('/api/debug/config', requireAdmin, (_req, res) => {
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

/* ================== ADMIN INFO ENDPOINT ================== */

router.get('/admin/info', requireAdmin, async (req, res) => {
  try {
    const alertCountResult = await pool.query('SELECT COUNT(*) AS c FROM alerts');
    const userCountResult = await pool.query('SELECT COUNT(*) AS c FROM users');
    const prefsCountResult = await pool.query('SELECT COUNT(*) AS c FROM user_prefs');

    const alertCount = parseInt(alertCountResult.rows[0].c);
    const userCount = parseInt(userCountResult.rows[0].c);
    const prefsCount = parseInt(prefsCountResult.rows[0].c);

    const CMC_API_KEY = process.env.CMC_API_KEY || '';
    const MARKET_CURRENCY = process.env.MARKET_CURRENCY || 'GBP';

    res.json({
      dataDir: DATA_DIR,
      databaseUrl: process.env.DATABASE_URL ? 'configured' : 'not set',
      backupDir: BACKUP_DIR,
      restoreFromFile: process.env.RESTORE_FROM_FILE || '',
      counts: { alerts: alertCount, users: userCount, user_prefs: prefsCount },
      market: {
        provider: CMC_API_KEY ? 'cmc' : 'none',
        currency: MARKET_CURRENCY
      }
    });
  } catch (e) {
    res.status(500).json({ error: 'failed', message: e && e.message });
  }
});

/* ================== ADMIN SQL/SCHEMA/MIGRATION/BACKUP ================== */

// Arbitrary SQL execution. Disabled by default — an admin whose token
// leaks should not give the attacker RCE-equivalent DB access. To turn
// on for a debugging session set ALLOW_ADMIN_SQL=true and redeploy; turn
// off again as soon as the session is done.
router.post('/admin/sql', requireAdmin, async (req, res) => {
  if (String(process.env.ALLOW_ADMIN_SQL || '').toLowerCase() !== 'true') {
    return res.status(403).json({
      error: 'disabled',
      message: 'Arbitrary SQL is disabled. Set ALLOW_ADMIN_SQL=true to enable temporarily.'
    });
  }

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

router.post('/admin/schema', requireAdmin, async (req, res) => {
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

router.post('/admin/migrate', requireAdmin, async (req, res) => {
  try {
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

router.post('/admin/backup', requireAdmin, async (req, res) => {
  try {
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

router.get('/admin/backups', requireAdmin, (req, res) => {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.db'))
      .map(f => {
        const p = path.join(BACKUP_DIR, f);
        const st = fs.statSync(p);
        return { file: f, path: p, size: st.size, mtime: st.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    res.json({ ok: true, files });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.get('/admin/backups/:file', requireAdmin, (req, res) => {
  try {
    const name = path.basename(String(req.params.file || ''));
    if (!name.endsWith('.db')) return res.status(400).json({ ok: false, error: 'invalid_file' });
    const p = path.join(BACKUP_DIR, name);
    if (!fs.existsSync(p)) return res.status(404).json({ ok: false, error: 'not_found' });
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    fs.createReadStream(p).pipe(res);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/* ================== ADMIN STATISTICS ================== */

router.get('/admin/stats', requireAdmin, async (req, res) => {
  try {
    const alertsResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE severity = 'critical') as critical_count,
        COUNT(*) FILTER (WHERE severity = 'warning') as warning_count,
        COUNT(*) FILTER (WHERE severity = 'info') as info_count
      FROM alerts
    `);
    const alertStats = alertsResult.rows[0];

    const usersResult = await pool.query('SELECT COUNT(*) as total FROM users');
    const userStats = usersResult.rows[0];

    const newsResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE expires_at < NOW() + INTERVAL '7 days') as expiring_soon,
        AVG(EXTRACT(EPOCH FROM NOW()) * 1000 - date) as avg_age_ms
      FROM news_cache
      WHERE expires_at > NOW()
    `);
    const newsData = newsResult.rows[0];

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

/* ================== API CALL STATISTICS ================== */

router.get('/admin/api-stats', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM api_call_tracking ORDER BY call_count DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('[Admin API Stats] Failed to fetch stats:', error);
    res.status(500).json({ error: 'Failed to fetch API statistics' });
  }
});

/* ================== USER MANAGEMENT & EXPORTS ================== */

router.get('/admin/users', requireAdmin, async (req, res) => {
  try {
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
  } catch (e) {
    console.error('Failed to fetch users:', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.get('/admin/export/users.csv', requireAdmin, async (req, res) => {
  try {
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
  } catch (e) {
    res.status(500).send('error');
  }
});

router.get('/admin/export/audit.csv', requireAdmin, async (req, res) => {
  try {
    const days = Math.max(1, Math.min(365, parseInt(String(req.query.days || '30')) || 30));
    const cutoffSeconds = Math.floor(Date.now() / 1000) - (days * 86400);
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
      const iso = new Date(r.ts * 1000).toISOString();
      lines.push([iso, r.user_id, r.email, r.event, r.detail].map(esc).join(','));
    });
    const csv = lines.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-last-${days}-days.csv"`);
    res.send(csv);
  } catch (e) {
    res.status(500).send('error');
  }
});

router.get('/admin/export/alerts.csv', requireAdmin, (_req, res) => {
  try {
    const headers = [
      'id','token','title','description','severity','deadline','tags','further_info','source_type','source_url'
    ];
    const rows = getAlerts().map(a => ([
      a.id,
      a.token,
      a.title,
      (a.description || '').replaceAll('\n', ' ').slice(0, 1000),
      a.severity,
      a.deadline,
      JSON.stringify(Array.isArray(a.tags) ? a.tags : []),
      (a.further_info || '').replaceAll('\n', ' ').slice(0, 2000),
      a.source_type || '',
      a.source_url || ''
    ]));
    const esc = (v) => '"' + String(v).replaceAll('"', '""') + '"';
    const body = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="alerts.csv"');
    res.send('\uFEFF' + body);
  } catch (e) {
    res.status(500).send('export_failed');
  }
});

/* ================== HELPER FUNCTIONS FOR AI ROUTES ================== */

function getDefaultTags(severity) {
  switch (severity) {
    case 'critical': return '["hack","exploit"]';
    case 'warning': return '["community","migration"]';
    case 'info': return '["community","news"]';
    default: return '[]';
  }
}

async function getLogoUrl(symbol) {
  const sym = String(symbol).toUpperCase();
  try {
    // TODO: Implement CoinGecko logo fetching
    // For now return a placeholder or empty string
    return '';
  } catch (e) {
    console.error('[getLogoUrl] error:', e);
    return '';
  }
}

/* ================== AI ALERT DRAFTING ENDPOINT ================== */

router.post('/admin/ai/draft-alert', requireAdmin, async (req, res) => {
  try {
    const { text, source_url, hint_token, model } = req.body || {};
    if (!text || String(text).trim().length < 8) {
      return res.status(400).json({ error: 'text is required (min 8 chars)' });
    }

    const validTags = [
      'price-change','migration','hack','fork','scam','airdrop','whale',
      'news','community','exploit','privacy','community-vote','token-unlocks'
    ];
    const validSeverities = ['critical','warning','info'];
    const validSourceTypes = ['anonymous','mainstream-media','trusted-source','social-media','dev-team'];

    const systemPrompt = `You are a senior crypto-security analyst for Crypto Lifeguard.
You write concise, accurate, actionable alerts for crypto holders.

Output STRICT JSON only (no markdown fences, no commentary) with this exact shape:
{
  "token": "<primary ticker symbol, upper-case, 2-6 chars>",
  "title": "<max 80 chars, specific, no clickbait>",
  "body": "<2-4 sentence description: what happened, who it affects, what to do>",
  "severity": "critical" | "warning" | "info",
  "tags": [<one or more of: ${validTags.join(', ')}>],
  "deadline_days": <integer 1-90 if time sensitive, else null>,
  "source_type": "anonymous" | "mainstream-media" | "trusted-source" | "social-media" | "dev-team",
  "reasoning": "<1-2 sentence explanation of severity + tag choices>"
}

Severity guidelines:
- critical: active exploit, hack confirmed, exchange halt, major regulatory ban, stablecoin depeg
- warning: upcoming hard fork / migration, token unlock cliff, suspicious movement, governance vote deadline, fraud allegation
- info: general announcement, partnership, release, market commentary, price milestone`;

    const userPrompt = `Draft an alert from this source material.
${hint_token ? `The admin suggested primary token is: ${hint_token}\n` : ''}${source_url ? `Source URL: ${source_url}\n` : ''}
---
${String(text).slice(0, 4000)}
---

Return ONLY the JSON object, no prose.`;

    // Prefer OpenAI, fall back to Anthropic, then rule-based.
    async function callOpenAIJson() {
      if (!OPENAI_API_KEY) throw new Error('no-openai');
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
          max_tokens: 600,
          response_format: { type: 'json_object' }
        })
      });
      try { await trackAPICall('OpenAI', '/v1/chat/completions'); } catch(_) {}
      if (!r.ok) throw new Error(`openai ${r.status}`);
      const d = await r.json();
      return { content: d.choices[0].message.content, model: 'OpenAI gpt-4o-mini' };
    }

    async function callAnthropicJson() {
      if (!ANTHROPIC_API_KEY) throw new Error('no-anthropic');
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 600,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt + '\n\nRespond with ONLY the JSON object.' }]
        })
      });
      try { await trackAPICall('Anthropic', '/v1/messages'); } catch(_) {}
      if (!r.ok) throw new Error(`anthropic ${r.status}`);
      const d = await r.json();
      const txt = (d.content && d.content[0] && d.content[0].text) || '';
      return { content: txt, model: 'Anthropic claude-3-5-sonnet' };
    }

    const prefer = (model || 'openai').toLowerCase();
    let raw = null;
    let usedModel = null;
    const attempts = prefer === 'anthropic'
      ? [callAnthropicJson, callOpenAIJson]
      : [callOpenAIJson, callAnthropicJson];
    for (const fn of attempts) {
      try {
        const out = await fn();
        raw = out.content;
        usedModel = out.model;
        break;
      } catch (e) {
        console.warn('[draft-alert] provider failed:', e && e.message);
      }
    }

    function ruleBasedFallback() {
      const symMatch = String(text).match(/\b([A-Z]{2,6})\b/);
      const token = (hint_token || (symMatch && symMatch[1]) || 'BTC').toUpperCase();
      const lower = String(text).toLowerCase();
      let severity = 'info';
      const tags = ['news'];
      if (/\bhack|exploit|breach|drained|stolen|rug ?pull\b/.test(lower)) { severity = 'critical'; tags.push('hack','exploit'); }
      else if (/\bmigration|fork|upgrade|unlock|vote|proposal|ban\b/.test(lower)) { severity = 'warning'; }
      const title = (String(text).split(/[.\n!?]/)[0] || '').slice(0, 80).trim() || `${token} update`;
      return {
        token,
        title,
        body: String(text).slice(0, 320).trim(),
        severity,
        tags: Array.from(new Set(tags)).filter(t => validTags.includes(t)),
        deadline_days: null,
        source_type: source_url ? 'mainstream-media' : 'anonymous',
        reasoning: 'Heuristic fallback — no AI provider configured.'
      };
    }

    let draft;
    if (raw) {
      try {
        // Strip ```json fences if present
        const cleaned = String(raw).replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        draft = JSON.parse(cleaned);
      } catch (e) {
        console.warn('[draft-alert] JSON parse failed, using fallback:', e.message);
        draft = ruleBasedFallback();
        usedModel = (usedModel || '') + ' (parse-failed)';
      }
    } else {
      draft = ruleBasedFallback();
      usedModel = 'Heuristic';
    }

    // Normalise / sanitise
    const token = String(draft.token || 'BTC').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'BTC';
    const title = String(draft.title || '').slice(0, 120) || `${token} update`;
    const body  = String(draft.body || draft.description || '').slice(0, 1200);
    const severity = validSeverities.includes(String(draft.severity)) ? draft.severity : 'info';
    const tags = Array.isArray(draft.tags)
      ? Array.from(new Set(draft.tags.map(t => String(t).toLowerCase()).filter(t => validTags.includes(t))))
      : [];
    let deadline = null;
    const dd = Number(draft.deadline_days);
    if (Number.isFinite(dd) && dd > 0 && dd <= 365) {
      const d = new Date();
      d.setDate(d.getDate() + Math.floor(dd));
      deadline = d.toISOString();
    }
    const source_type = validSourceTypes.includes(String(draft.source_type)) ? draft.source_type : (source_url ? 'mainstream-media' : 'anonymous');
    const reasoning = String(draft.reasoning || '').slice(0, 400);

    res.json({
      draft: { token, title, body, severity, tags, deadline, source_type, source_url: source_url || '', reasoning },
      model: usedModel || 'Heuristic'
    });
  } catch (error) {
    console.error('[draft-alert] error:', error);
    res.status(500).json({ error: 'Failed to draft alert', details: error && error.message });
  }
});

/* ================== QUICK CREATE ALERT FROM URL/TEXT ================== */

function extractFirstUrl(s) {
  if (!s) return null;
  const m = String(s).match(/https?:\/\/[^\s<>"')]+/i);
  return m ? m[0] : null;
}

function looksLikeOnlyUrl(s) {
  const trimmed = String(s || '').trim();
  if (!trimmed) return false;
  return /^https?:\/\/\S+$/i.test(trimmed);
}

async function fetchAndExtractUrl(url) {
  // Server-side fetch with a reasonable UA and timeout.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CryptoLifeguardBot/1.0; +https://crypto-lifeguard.com)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9'
      },
      signal: controller.signal,
      redirect: 'follow'
    });
    clearTimeout(timeout);
    if (!r.ok) throw new Error(`fetch ${r.status}`);
    const ct = String(r.headers.get('content-type') || '');
    if (!/text\/html|application\/xhtml|text\/plain|application\/json/i.test(ct)) {
      throw new Error(`unsupported content-type: ${ct}`);
    }
    const html = await r.text();

    // Basic extraction without any DOM lib.
    const pick = (re) => { const m = html.match(re); return m ? m[1].trim() : ''; };
    const stripTags = (s) => String(s || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();

    const title =
      pick(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
      pick(/<meta\s+name=["']twitter:title["']\s+content=["']([^"']+)["']/i) ||
      pick(/<title[^>]*>([\s\S]*?)<\/title>/i);

    const description =
      pick(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
      pick(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
      pick(/<meta\s+name=["']twitter:description["']\s+content=["']([^"']+)["']/i);

    const siteName =
      pick(/<meta\s+property=["']og:site_name["']\s+content=["']([^"']+)["']/i);

    // Prefer <article>, then <main>, then whole body.
    let bodyHtml =
      (html.match(/<article[\s\S]*?<\/article>/i) || [])[0] ||
      (html.match(/<main[\s\S]*?<\/main>/i) || [])[0] ||
      (html.match(/<body[\s\S]*?<\/body>/i) || [])[0] ||
      html;

    const bodyText = stripTags(bodyHtml).slice(0, 6000);

    return {
      url,
      title: stripTags(title),
      description: stripTags(description),
      siteName: stripTags(siteName),
      bodyText
    };
  } finally {
    clearTimeout(timeout);
  }
}

router.post('/admin/ai/quick-create-alert', requireAdmin, async (req, res) => {
  try {
    const { input, hint_token } = req.body || {};
    if (!input || String(input).trim().length < 4) {
      return res.status(400).json({ error: 'input is required (paste a URL or some text)' });
    }

    const rawInput = String(input).trim();
    const firstUrl = extractFirstUrl(rawInput);
    const isOnlyUrl = looksLikeOnlyUrl(rawInput);

    let sourceUrl = firstUrl || '';
    let draftText = rawInput;
    let fetched = null;

    if (firstUrl) {
      try {
        fetched = await fetchAndExtractUrl(firstUrl);
        if (fetched) {
          const parts = [
            fetched.title ? `Title: ${fetched.title}` : null,
            fetched.siteName ? `Source: ${fetched.siteName}` : null,
            fetched.description ? `Summary: ${fetched.description}` : null,
            fetched.bodyText ? `Body:\n${fetched.bodyText}` : null,
          ].filter(Boolean);
          // If the user pasted more than just a URL, keep that context too.
          if (!isOnlyUrl) parts.push(`Admin note:\n${rawInput}`);
          draftText = parts.join('\n\n');
        }
      } catch (fetchErr) {
        console.warn('[quick-create-alert] URL fetch failed:', fetchErr.message);
        // Fall back to drafting from the raw input alone.
      }
    }

    // Delegate the AI drafting by re-using the same JSON-mode providers
    const validTags = [
      'price-change','migration','hack','fork','scam','airdrop','whale',
      'news','community','exploit','privacy','community-vote','token-unlocks'
    ];
    const validSeverities = ['critical','warning','info'];
    const validSourceTypes = ['anonymous','mainstream-media','trusted-source','social-media','dev-team'];

    const systemPrompt = `You are a senior crypto-security analyst for Crypto Lifeguard.
You write concise, accurate, actionable alerts for crypto holders.

Output STRICT JSON only (no markdown fences, no commentary) with this exact shape:
{
  "token": "<primary ticker symbol, upper-case, 2-6 chars>",
  "title": "<max 80 chars, specific, no clickbait>",
  "body": "<2-4 sentence description: what happened, who it affects, what to do>",
  "severity": "critical" | "warning" | "info",
  "tags": [<one or more of: ${validTags.join(', ')}>],
  "deadline_days": <integer 1-90 if time sensitive, else null>,
  "source_type": "anonymous" | "mainstream-media" | "trusted-source" | "social-media" | "dev-team",
  "reasoning": "<1-2 sentence explanation of severity + tag choices>"
}

Severity guidelines:
- critical: active exploit, hack confirmed, exchange halt, major regulatory ban, stablecoin depeg
- warning: upcoming hard fork / migration, token unlock cliff, suspicious movement, governance vote deadline, fraud allegation
- info: general announcement, partnership, release, market commentary, price milestone`;

    const userPrompt = `Draft an alert from this source material.
${hint_token ? `The admin suggested primary token is: ${hint_token}\n` : ''}${sourceUrl ? `Source URL: ${sourceUrl}\n` : ''}
---
${String(draftText).slice(0, 5000)}
---

Return ONLY the JSON object, no prose.`;

    async function callOpenAIJson() {
      if (!OPENAI_API_KEY) throw new Error('no-openai');
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
          max_tokens: 700,
          response_format: { type: 'json_object' }
        })
      });
      try { await trackAPICall('OpenAI', '/v1/chat/completions'); } catch(_) {}
      if (!r.ok) throw new Error(`openai ${r.status}`);
      const d = await r.json();
      return { content: d.choices[0].message.content, model: 'OpenAI gpt-4o-mini' };
    }

    async function callAnthropicJson() {
      if (!ANTHROPIC_API_KEY) throw new Error('no-anthropic');
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 700,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt + '\n\nRespond with ONLY the JSON object.' }]
        })
      });
      try { await trackAPICall('Anthropic', '/v1/messages'); } catch(_) {}
      if (!r.ok) throw new Error(`anthropic ${r.status}`);
      const d = await r.json();
      const txt = (d.content && d.content[0] && d.content[0].text) || '';
      return { content: txt, model: 'Anthropic claude-3-5-sonnet' };
    }

    let raw = null;
    let usedModel = null;
    for (const fn of [callOpenAIJson, callAnthropicJson]) {
      try {
        const out = await fn();
        raw = out.content;
        usedModel = out.model;
        break;
      } catch (e) {
        console.warn('[quick-create-alert] provider failed:', e && e.message);
      }
    }

    if (!raw) {
      return res.status(503).json({
        error: 'No AI provider available to draft this alert. Check OPENAI_API_KEY / ANTHROPIC_API_KEY.'
      });
    }

    let draft;
    try {
      const cleaned = String(raw).replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      draft = JSON.parse(cleaned);
    } catch (e) {
      return res.status(502).json({ error: 'AI returned malformed JSON', details: e.message });
    }

    // Normalise / sanitise (same rules as draft-alert)
    const token = String(draft.token || hint_token || 'BTC')
      .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'BTC';
    const title = (String(draft.title || '').trim() || `${token} update`).slice(0, 120);
    const description = String(draft.body || draft.description || '').slice(0, 1200);
    const severity = validSeverities.includes(String(draft.severity)) ? draft.severity : 'info';
    const tags = Array.isArray(draft.tags)
      ? Array.from(new Set(draft.tags.map(t => String(t).toLowerCase()).filter(t => validTags.includes(t))))
      : [];
    let deadline;
    const dd = Number(draft.deadline_days);
    if (Number.isFinite(dd) && dd > 0 && dd <= 365) {
      const d = new Date();
      d.setDate(d.getDate() + Math.floor(dd));
      deadline = d.toISOString();
    } else {
      // Always need a deadline to publish — default to 7 days out if the model didn't pick one.
      const d = new Date();
      d.setDate(d.getDate() + 7);
      deadline = d.toISOString();
    }
    const source_type = validSourceTypes.includes(String(draft.source_type))
      ? draft.source_type
      : (sourceUrl ? 'mainstream-media' : 'anonymous');
    const reasoning = String(draft.reasoning || '').slice(0, 400);

    // Build the alert payload and persist it using the same logic as POST /api/alerts.
    let logoUrl = '';
    try { logoUrl = await getLogoUrl(token) || ''; }
    catch (err) { console.warn(`[quick-create-alert] logo fetch failed for ${token}:`, err.message); }

    const item = {
      id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      token,
      title,
      description,
      severity,
      deadline,
      tags: tags.length ? tags : JSON.parse(getDefaultTags(severity)),
      further_info: '',
      source_type,
      source_url: sourceUrl || '',
      logo_url: logoUrl
    };

    getAlerts().push(item);
    if (getUsingDatabaseAlerts()) {
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
          source_url: item.source_url,
          logo_url: item.logo_url
        });
        await reloadAlertsFromDatabase();
      } catch (dbError) {
        console.warn('[quick-create-alert] DB insert failed:', dbError.message);
      }
    } else {
      persistAlerts();
    }

    require('../lib/push').notifyAlert(item);

    res.status(201).json({
      alert: item,
      model: usedModel,
      reasoning,
      fetched: fetched ? { url: fetched.url, title: fetched.title, siteName: fetched.siteName } : null
    });
  } catch (error) {
    console.error('[quick-create-alert] error:', error);
    res.status(500).json({ error: 'Failed to quick-create alert', details: error && error.message });
  }
});

/* ================== ADMIN TOKEN REQUESTS ================== */

router.get('/api/admin/token-requests', requireAdmin, async (req, res) => {
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

/* ================== DEBUG: COINDESK TEST ================== */

router.get('/debug/coindesk-test', async (req, res) => {
  try {
    // TODO: Implement fetchNewsFromCoinDesk function or stub
    // This endpoint is a debug helper to test CoinDesk RSS feed fetching
    const tokens = ['BTC', 'ETH', 'SOL'];
    console.log('[Debug] Testing CoinDesk RSS feed directly...');

    // For now, return a stub response
    res.json({
      success: false,
      error: 'fetchNewsFromCoinDesk not yet wired up in this module',
      provider: 'CoinDesk RSS',
      tokens: tokens,
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

module.exports = router;
