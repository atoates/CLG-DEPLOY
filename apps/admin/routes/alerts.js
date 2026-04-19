const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const { pool, upsertAlert, deleteAlert, insertAudit, trackAPICall } = require('../lib/db');
const push = require('../lib/push');

/* ----- Shared state and helpers ----- */

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../data');
const ALERTS_PATH = path.join(DATA_DIR, 'alerts.json');

// Public exports for server.js to access
let alerts = [];
let usingDatabaseAlerts = false;

// AI API keys
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();
const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || '').trim();
const XAI_API_KEY = (process.env.XAI_API_KEY || process.env.XAI_APIKEY || process.env.XAI_TOKEN || '').trim();
const COINGECKO_API_KEY = process.env.GEKO || process.env.COINGECKO_API_KEY || '';

// Alert summary state
const ALERT_SUMMARY_PROMPT_VERSION = 1;
const alertSummaryInflight = new Map();
const alertSummaryRefreshCooldown = new Map();
const SUMMARY_REFRESH_COOLDOWN_MS = 30 * 1000;

const SOURCE_TYPES = [
  'anonymous',
  'mainstream-media',
  'trusted-source',
  'social-media',
  'dev-team'
];

/* ----- File I/O helpers ----- */

function readJsonSafe(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writeJsonSafe(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function persistAlerts() {
  writeJsonSafe(ALERTS_PATH, alerts);
}

function getDefaultTags(severity) {
  switch (severity) {
    case 'critical': return '["hack","exploit"]';
    case 'warning': return '["community","migration"]';
    case 'info': return '["community","news"]';
    default: return '[]';
  }
}

/* ----- External dependencies (from server.js) ----- */

let getCoinGeckoId; // Will be injected
let getLogoUrl;    // Will be injected

/* ----- Database reload ----- */

async function reloadAlertsFromDatabase() {
  if (!usingDatabaseAlerts) return false;

  try {
    const { rows } = await pool.query('SELECT id, token, title, description, severity, deadline, tags, further_info, source_type, source_url, logo_url FROM alerts');
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
      source_url: String(r.source_url || ''),
      logo_url: String(r.logo_url || '')
    }));
    return true;
  } catch (e) {
    console.warn('Failed to reload alerts from database:', e.message);
    return false;
  }
}

/* ----- Alert summary generation ----- */

function buildAlertSourceHash(alert) {
  const payload = JSON.stringify({
    v: ALERT_SUMMARY_PROMPT_VERSION,
    token: alert.token || '',
    title: alert.title || '',
    description: alert.description || '',
    further_info: alert.further_info || '',
    severity: alert.severity || '',
    tags: Array.isArray(alert.tags) ? alert.tags.slice().sort() : [],
    deadline: alert.deadline || ''
  });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

function buildAlertSummaryPrompt(alert) {
  const token = alert.token || 'the token';
  const lines = [
    `I'm reading an alert on Crypto Lifeguard about ${token}. Here are the details:`,
    '',
    `Title: ${alert.title || ''}`,
    `Severity: ${alert.severity || 'info'}`,
    alert.description ? `Summary: ${alert.description}` : '',
    alert.further_info ? `Background: ${alert.further_info}` : '',
    alert.deadline ? `Deadline: ${new Date(alert.deadline).toISOString()}` : '',
    Array.isArray(alert.tags) && alert.tags.length ? `Tags: ${alert.tags.join(', ')}` : '',
    '',
    `Give me a tight analysis of this alert in 3 short paragraphs:`,
    `1. What is happening, in plain English, and why it matters right now.`,
    `2. Who is affected and what concrete actions (if any) a holder should consider.`,
    `3. Any wider context from recent news or market moves.`,
    '',
    `Keep it calm, concrete, and avoid financial advice. Use UK English spelling.`
  ].filter(Boolean);
  return lines.join('\n');
}

async function callOpenAISummary(prompt) {
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
        { role: 'system', content: 'You are Sentinel AI, a calm crypto-security analyst. Write clear, concrete analysis in plain English. Never give financial advice. Use UK English spelling.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.4,
      max_tokens: 700
    })
  });
  try { await trackAPICall('OpenAI', '/v1/chat/completions'); } catch (_) {}
  if (!r.ok) throw new Error(`openai ${r.status}`);
  const d = await r.json();
  const content = d.choices?.[0]?.message?.content || '';
  return { content, model: 'openai:gpt-4o-mini' };
}

async function callAnthropicSummary(prompt) {
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
      system: 'You are Sentinel AI, a calm crypto-security analyst. Write clear, concrete analysis in plain English. Never give financial advice. Use UK English spelling.',
      messages: [{ role: 'user', content: prompt }]
    })
  });
  try { await trackAPICall('Anthropic', '/v1/messages'); } catch (_) {}
  if (!r.ok) throw new Error(`anthropic ${r.status}`);
  const d = await r.json();
  const content = (d.content && d.content[0] && d.content[0].text) || '';
  return { content, model: 'anthropic:claude-3-5-sonnet' };
}

async function callXAISummary(prompt) {
  if (!XAI_API_KEY) throw new Error('no-xai');
  const model = 'grok-4.20-0309-reasoning';
  const r = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${XAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are Sentinel AI, a calm crypto-security analyst. Write clear, concrete analysis in plain English. Never give financial advice. Use UK English spelling.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 700
    })
  });
  try { await trackAPICall('xAI', '/v1/chat/completions'); } catch (_) {}
  if (!r.ok) throw new Error(`xai ${r.status}`);
  const d = await r.json();
  const content = d.choices?.[0]?.message?.content || '';
  return { content, model: `xai:${model}` };
}

async function generateAlertSummaryContent(alert) {
  const prompt = buildAlertSummaryPrompt(alert);
  // Try xAI (Grok) first, then OpenAI, then Anthropic
  const attempts = [callXAISummary, callOpenAISummary, callAnthropicSummary];
  let lastErr = null;
  for (const fn of attempts) {
    try {
      const out = await fn(prompt);
      if (out && out.content && out.content.trim().length > 20) {
        return out;
      }
    } catch (e) {
      lastErr = e;
      console.warn('[alert-summary] provider failed:', e && e.message);
    }
  }
  throw new Error(lastErr ? (lastErr.message || 'ai_unavailable') : 'ai_unavailable');
}

async function fetchLatestAlertSummary(alertId) {
  const { rows } = await pool.query(
    `SELECT id, alert_id, content, model, prompt_version, source_hash, generated_at, generated_by_uid
       FROM alert_summaries
      WHERE alert_id = $1
      ORDER BY generated_at DESC
      LIMIT 1`,
    [alertId]
  );
  return rows[0] || null;
}

async function insertAlertSummary({ alertId, content, model, sourceHash, uid }) {
  const id = `as_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { rows } = await pool.query(
    `INSERT INTO alert_summaries (id, alert_id, content, model, prompt_version, source_hash, generated_by_uid)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, alert_id, content, model, prompt_version, source_hash, generated_at, generated_by_uid`,
    [id, alertId, content, model || null, ALERT_SUMMARY_PROMPT_VERSION, sourceHash || null, uid || null]
  );
  return rows[0];
}

function serialiseSummaryRow(row) {
  if (!row) return null;
  const generatedAt = Number(row.generated_at) || 0;
  return {
    id: row.id,
    alert_id: row.alert_id,
    content: row.content,
    model: row.model || '',
    prompt_version: row.prompt_version,
    source_hash: row.source_hash || '',
    generated_at: generatedAt,
    generated_at_iso: generatedAt ? new Date(generatedAt * 1000).toISOString() : null
  };
}

/* ----- Routes ----- */

// GET list of all alerts (public)
router.get('/api/alerts', (_req, res) => res.json(alerts));

// POST create a new alert (admin only)
router.post('/api/alerts', require('../lib/middleware').requireAdmin, async (req, res) => {
  const { token, title, description, severity, deadline, tags, further_info, source_type, source_url } = req.body || {};
  if (!token || !title || !deadline) return res.status(400).json({ error:'token, title, deadline are required' });

  // Validate tags against known tag types
  const validTags = [
    'price-change', 'migration', 'hack', 'fork', 'scam',
    'airdrop', 'whale', 'news', 'community', 'exploit', 'privacy',
    'community-vote', 'token-unlocks'
  ];
  const sanitizedTags = Array.isArray(tags)
    ? tags.filter(t => typeof t === 'string' && validTags.includes(t))
    : [];

  const finalSeverity = ['critical','warning','info'].includes(severity) ? severity : 'info';
  const finalTags = sanitizedTags.length > 0 ? sanitizedTags : JSON.parse(getDefaultTags(finalSeverity));

  // Validate source metadata
  const srcType = source_type && SOURCE_TYPES.includes(String(source_type)) ? String(source_type) : '';
  const srcUrl = source_url && /^https?:\/\//i.test(String(source_url)) ? String(source_url) : '';

  // Fetch logo URL from CoinGecko
  let logoUrl = '';
  try {
    logoUrl = await getLogoUrl(String(token).toUpperCase()) || '';
  } catch (err) {
    console.warn(`⚠️ Failed to fetch logo URL for ${token}:`, err.message);
  }

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
    source_url: srcUrl,
    logo_url: logoUrl
  };
  alerts.push(item);

  // Also insert into database if using DB-backed alerts
  if (usingDatabaseAlerts) {
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
      console.warn('Failed to insert individual alert into database:', dbError.message);
    }
  } else {
    persistAlerts();
  }

  push.notifyAlert(item);
  res.status(201).json(item);
});

// GET a single alert (public)
router.get('/api/alerts/:id', (req, res) => {
  const { id } = req.params;
  const item = alerts.find(a => a.id === id);
  if (!item) return res.status(404).json({ error: 'not_found' });
  res.json(item);
});

// GET latest cached summary for an alert (public)
router.get('/api/alerts/:id/summary', async (req, res) => {
  try {
    const { id } = req.params;
    const alert = alerts.find(a => a.id === id);
    if (!alert) return res.status(404).json({ error: 'alert_not_found' });

    const latest = await fetchLatestAlertSummary(id);
    if (!latest) {
      return res.json({ summary: null, stale: false });
    }
    const currentHash = buildAlertSourceHash(alert);
    const stale = latest.source_hash && latest.source_hash !== currentHash;
    res.json({ summary: serialiseSummaryRow(latest), stale: !!stale });
  } catch (error) {
    console.error('[alert-summary GET] error:', error);
    res.status(500).json({ error: 'summary_fetch_failed', details: error && error.message });
  }
});

// POST refresh summary (public with cooldown)
router.post('/api/alerts/:id/summary/refresh', async (req, res) => {
  try {
    const { id } = req.params;
    const alert = alerts.find(a => a.id === id);
    if (!alert) return res.status(404).json({ error: 'alert_not_found' });

    const uid = req.uid || 'anon';
    const cooldownKey = `${uid}:${id}`;
    const lastAt = alertSummaryRefreshCooldown.get(cooldownKey) || 0;
    const now = Date.now();
    if (now - lastAt < SUMMARY_REFRESH_COOLDOWN_MS) {
      const waitMs = SUMMARY_REFRESH_COOLDOWN_MS - (now - lastAt);
      return res.status(429).json({
        error: 'rate_limited',
        retry_after_ms: waitMs,
        message: `Please wait ${Math.ceil(waitMs / 1000)}s before refreshing again.`
      });
    }
    alertSummaryRefreshCooldown.set(cooldownKey, now);

    // Coalesce concurrent refresh requests for the same alert.
    let promise = alertSummaryInflight.get(id);
    if (!promise) {
      promise = (async () => {
        const out = await generateAlertSummaryContent(alert);
        const content = String(out.content || '').trim();
        if (!content) throw new Error('empty_ai_response');
        const row = await insertAlertSummary({
          alertId: id,
          content,
          model: out.model,
          sourceHash: buildAlertSourceHash(alert),
          uid
        });
        return row;
      })();
      alertSummaryInflight.set(id, promise);
      promise.finally(() => alertSummaryInflight.delete(id));
    }

    const row = await promise;
    res.json({ summary: serialiseSummaryRow(row), refreshed: true });
  } catch (error) {
    console.error('[alert-summary refresh] error:', error);
    res.status(500).json({
      error: 'summary_generate_failed',
      details: error && error.message
    });
  }
});

// GET summary history (optional admin-visible log)
router.get('/api/alerts/:id/summary/history', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const { rows } = await pool.query(
      `SELECT id, alert_id, content, model, prompt_version, source_hash, generated_at, generated_by_uid
         FROM alert_summaries
        WHERE alert_id = $1
        ORDER BY generated_at DESC
        LIMIT $2`,
      [id, limit]
    );
    res.json({ history: rows.map(serialiseSummaryRow) });
  } catch (error) {
    console.error('[alert-summary history] error:', error);
    res.status(500).json({ error: 'history_fetch_failed', details: error && error.message });
  }
});

// PUT update an alert (admin only)
router.put('/api/alerts/:id', require('../lib/middleware').requireAdmin, async (req, res) => {
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
      'airdrop', 'whale', 'news', 'community', 'exploit', 'privacy',
      'community-vote', 'token-unlocks'
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

  // If token changed, fetch new logo URL
  if (payload.token && payload.token !== old.token) {
    try {
      const newLogoUrl = await getLogoUrl(payload.token);
      if (newLogoUrl) {
        updated.logo_url = newLogoUrl;
      }
    } catch (err) {
      console.warn(`⚠️ Failed to fetch logo URL for updated token ${payload.token}:`, err.message);
    }
  }

  alerts[idx] = updated;

  // Also update in database if using DB-backed alerts
  if (usingDatabaseAlerts) {
    try {
      await upsertAlert({
        id: updated.id,
        token: updated.token,
        title: updated.title,
        description: updated.description,
        severity: updated.severity,
        deadline: updated.deadline,
        tags: JSON.stringify(updated.tags),
        further_info: updated.further_info,
        source_type: updated.source_type,
        source_url: updated.source_url,
        logo_url: updated.logo_url || ''
      });
      await reloadAlertsFromDatabase();
    } catch (dbError) {
      console.warn('Failed to update alert in database:', dbError.message);
    }
  } else {
    persistAlerts();
  }

  res.json(updated);
});

// DELETE an alert (admin only)
router.delete('/api/alerts/:id', require('../lib/middleware').requireAdmin, async (req, res) => {
  const { id } = req.params;
  const idx = alerts.findIndex(a => a.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not_found' });
  const removed = alerts.splice(idx, 1)[0];

  // Also delete from database if using DB-backed alerts
  if (usingDatabaseAlerts) {
    try {
      await deleteAlert(removed.id);
      await reloadAlertsFromDatabase();
    } catch (dbError) {
      console.warn('Failed to delete alert from database:', dbError.message);
    }
  } else {
    persistAlerts();
  }
  res.json({ ok:true, removedId: removed.id });
});

// POST bulk create alerts (admin only)
router.post('/api/alerts/bulk', require('../lib/middleware').requireAdmin, async (req, res) => {
  const { alerts: alertsToCreate } = req.body || {};

  if (!Array.isArray(alertsToCreate) || alertsToCreate.length === 0) {
    return res.status(400).json({ error: 'alerts array is required and must not be empty' });
  }

  const validTags = [
    'price-change', 'migration', 'hack', 'fork', 'scam',
    'airdrop', 'whale', 'news', 'community', 'exploit', 'privacy',
    'community-vote', 'token-unlocks'
  ];

  const createdAlerts = [];
  const errors = [];

  for (let index = 0; index < alertsToCreate.length; index++) {
    const alertData = alertsToCreate[index];
    try {
      const { token, title, description, severity, deadline, tags, further_info, source_type, source_url } = alertData;

      // Validate required fields
      if (!token || !title || !deadline) {
        errors.push(`Alert ${index + 1}: token, title, deadline are required`);
        continue;
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
        continue;
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

      // Also insert into database if we're using DB-backed alerts
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
          source_url: item.source_url
        });
      } catch (dbError) {
        console.warn('Failed to insert alert into database:', dbError.message);
      }

      createdAlerts.push(item);

    } catch (error) {
      errors.push(`Alert ${index + 1}: ${error.message}`);
    }
  }

  // Persist if any alerts were created (only to JSON if not using DB)
  if (createdAlerts.length > 0 && !usingDatabaseAlerts) {
    persistAlerts();
  }

  // Reload alerts from database to sync in-memory array
  if (createdAlerts.length > 0 && usingDatabaseAlerts) {
    await reloadAlertsFromDatabase();
  }

  // Fan out push notifications for any critical alerts in this batch.
  for (const a of createdAlerts) push.notifyAlert(a);

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

// POST create alert from news (admin only, with optional news cache update)
router.post('/admin/alerts', require('../lib/middleware').requireAdmin, async (req, res) => {
  try {
    const { token, title, body, severity, tags, deadline, source_url } = req.body || {};

    // Validate required fields
    if (!token || !title || !body) {
      return res.status(400).json({
        error: 'token, title, and body are required',
        details: { token: !!token, title: !!title, body: !!body }
      });
    }

    // Validate tags against known tag types
    const validTags = [
      'price-change', 'migration', 'hack', 'fork', 'scam',
      'airdrop', 'whale', 'news', 'community', 'exploit', 'privacy',
      'community-vote', 'token-unlocks'
    ];
    const sanitizedTags = Array.isArray(tags)
      ? tags.filter(t => typeof t === 'string' && validTags.includes(t))
      : [];

    // Validate severity
    const validSeverities = ['critical', 'warning', 'info'];
    const finalSeverity = validSeverities.includes(severity) ? severity : 'info';

    // Use provided tags or default based on severity
    const finalTags = sanitizedTags.length > 0 ? sanitizedTags : JSON.parse(getDefaultTags(finalSeverity));

    // Parse deadline or default to 7 days from now
    let finalDeadline;
    if (deadline) {
      try {
        finalDeadline = new Date(deadline).toISOString();
      } catch (e) {
        return res.status(400).json({ error: 'Invalid deadline format. Use ISO 8601 format.' });
      }
    } else {
      // Default: 7 days from now
      const defaultDeadline = new Date();
      defaultDeadline.setDate(defaultDeadline.getDate() + 7);
      finalDeadline = defaultDeadline.toISOString();
    }

    // Use source_url from request, or parse body to extract source URL if present
    // Look for "Source: https://..." pattern in body
    let finalSourceUrl = source_url || '';
    if (!finalSourceUrl) {
      const sourceMatch = body.match(/Source:\s*(https?:\/\/[^\s\n]+)/i);
      finalSourceUrl = sourceMatch ? sourceMatch[1] : '';
    }

    // Create alert object
    const item = {
      id: `a_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      token: String(token).toUpperCase(),
      title: String(title),
      description: String(body), // Map 'body' to 'description'
      severity: finalSeverity,
      deadline: finalDeadline,
      tags: finalTags,
      further_info: '',
      source_type: finalSourceUrl ? 'mainstream-media' : '',
      source_url: finalSourceUrl
    };

    // Add to in-memory alerts
    alerts.push(item);

    // Insert into database if using DB-backed alerts
    if (usingDatabaseAlerts) {
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
          source_url: item.source_url
        });
        await reloadAlertsFromDatabase();

        // NEW: Mark the news article as having an alert created from it
        if (finalSourceUrl) {
          try {
            await pool.query(
              'UPDATE news_cache SET alert_created = TRUE WHERE article_url = $1',
              [finalSourceUrl]
            );
            console.log(`[Admin Alerts] Marked news article as processed: ${finalSourceUrl}`);
          } catch (newsErr) {
            // Log error but don't fail the alert creation
            console.error('[Admin Alerts] Failed to mark news article as processed:', newsErr.message);
          }
        }

      } catch (dbError) {
        console.error('[Admin Alerts] Failed to insert into database:', dbError.message);
        return res.status(500).json({ error: 'Database error', details: dbError.message });
      }
    } else {
      persistAlerts();
    }

    console.log(`[Admin Alerts] Created alert: ${item.token} - ${item.title} (severity: ${item.severity})`);

    push.notifyAlert(item);

    // Return the created alert
    res.status(201).json({
      success: true,
      alert: item
    });

  } catch (error) {
    console.error('[Admin Alerts] Error creating alert:', error);
    res.status(500).json({
      error: 'Failed to create alert',
      details: error.message
    });
  }
});

/* ----- Initialization & exports ----- */

// Exported function to initialize the alerts module
async function initializeAlerts(externalGetLogoUrl, externalGetCoinGeckoId) {
  getLogoUrl = externalGetLogoUrl;
  getCoinGeckoId = externalGetCoinGeckoId;

  // Initialize alerts from file
  alerts = readJsonSafe(ALERTS_PATH, [
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

  // Try to load from database if available
  try {
    const { rows } = await pool.query('SELECT id, token, title, description, severity, deadline, tags, further_info, source_type, source_url, logo_url FROM alerts');
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
        source_url: String(r.source_url || ''),
        logo_url: String(r.logo_url || '')
      }));
      usingDatabaseAlerts = true;
    }
  } catch (e) {
    console.warn('Failed to load alerts from DB; using file-backed alerts.json', e && e.message);
  }
}

// Export router and helper functions that server.js might need
module.exports = router;
module.exports.initializeAlerts = initializeAlerts;
module.exports.getAlerts = () => alerts;
module.exports.setAlerts = (newAlerts) => { alerts = newAlerts; };
module.exports.reloadAlertsFromDatabase = reloadAlertsFromDatabase;
module.exports.persistAlerts = persistAlerts;
module.exports.getUsingDatabaseAlerts = () => usingDatabaseAlerts;
