// lib/db.js - Database module
// Extracted from server.js to separate concerns

const { Pool } = require('pg');
const log = require('./logger');

// PostgreSQL connection setup
const DATABASE_URL = process.env.DATABASE_URL;
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL && DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

/* -------- Database Initialization -------- */
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

/* -------- Database Helper Functions -------- */

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
    INSERT INTO alerts (id, token, title, description, severity, deadline, tags, further_info, source_type, source_url, logo_url)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (id) DO UPDATE SET
      token = excluded.token,
      title = excluded.title,
      description = excluded.description,
      severity = excluded.severity,
      deadline = excluded.deadline,
      tags = excluded.tags,
      further_info = excluded.further_info,
      source_type = excluded.source_type,
      source_url = excluded.source_url,
      logo_url = excluded.logo_url
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
    alertData.source_url,
    alertData.logo_url || ''
  ]);
}

// Delete alert
async function deleteAlert(alertId) {
  await pool.query('DELETE FROM alerts WHERE id = $1', [alertId]);
}

// Track API calls for rate limiting and monitoring
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
    console.error('[API Tracking] Failed to track call:', error);
    // Don't fail the main request if tracking fails
  }
}

/* -------- Module Exports -------- */
module.exports = {
  pool,
  initDB,
  upsertUser,
  getUser,
  getUserByUsername,
  setUsername,
  setAvatar,
  getPrefs,
  upsertPrefs,
  insertUserSummary,
  getRecentUserSummaries,
  insertAudit,
  upsertAlert,
  deleteAlert,
  trackAPICall
};
