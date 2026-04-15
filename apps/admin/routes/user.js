const express = require('express');
const router = express.Router();

// Import dependencies
const { getSession, ADMIN_EMAILS, requireAdmin } = require('../lib/middleware');
const log = require('../lib/logger');
const {
  getUser,
  getPrefs,
  upsertPrefs,
  insertAudit,
  setUsername,
  getUserByUsername,
  setAvatar,
  getRecentUserSummaries,
  insertUserSummary,
  pool
} = require('../lib/db');
const { generateAISummary, generateFallbackSummary } = require('../lib/ai');
const { getUserProfile, ensureProfile, updateProfile } = require('./chat');
const newsRouter = require('./news');
const fetchNewsForTokens = newsRouter.fetchNewsForTokens;

// generateAlertDigest is defined in the chat module's tool executor, but the
// digest endpoint also needs it. For now, inline a minimal version here.
async function generateAlertDigest(uid, force) {
  try {
    const r = await pool.query(
      'SELECT content, generated_at FROM user_digests WHERE user_id = $1 ORDER BY generated_at DESC LIMIT 1',
      [uid]
    );
    if (r.rows.length && !force) return r.rows[0];
    return null;
  } catch { return null; }
}

// ============================================================================
// Diagnostic logging (no-op if admin module not wired)
function diagLog() { /* forwarded to admin module if available */ }

// GET /api/me - Current user info (with preferences and profile)
// ============================================================================
router.get('/api/me', async (req, res) => {
  // If Google session exists, prefer that user id
  const sess = getSession(req);
  const effectiveUid = sess?.uid || req.uid;
  try {
    diagLog('server', '/api/me', {
      hasSess: !!sess,
      loggedIn: !!sess,
      effectiveUid,
      sidPrefix: req.cookies.sid ? String(req.cookies.sid).slice(0, 8) : null,
      uidCookie: req.cookies.uid || null,
      cookieNames: Object.keys(req.cookies || {}),
      origin: req.get('origin') || '',
      referer: req.get('referer') || '',
    });
  } catch(_) {}
  const urow = await getUser(effectiveUid);
  const emailLower = (urow && urow.email ? String(urow.email).toLowerCase() : '');
  const isAdmin = !!(emailLower && ADMIN_EMAILS.includes(emailLower));
  const row = await getPrefs(effectiveUid);
  if (!row) {
    // first-time defaults
    const payload = {
      userId: effectiveUid,
      watchlist: [],
      severity: ['critical','warning','info'],
      showAll: false,
      dismissed: [],
      currency: 'USD',
      loggedIn: !!sess,
      isAdmin,
      profile: urow ? { name: urow.name || '', email: urow.email || '', avatar: urow.avatar || '', username: urow.username || '' } : { name:'', email:'', avatar:'', username:'' }
    };
    await upsertPrefs(
      effectiveUid,
      JSON.stringify(payload.watchlist),
      JSON.stringify(payload.severity),
      payload.showAll ? 1 : 0,
      JSON.stringify(payload.dismissed),
      payload.currency
    );
    try {
      await insertAudit(effectiveUid, (urow&&urow.email)||'', 'profile_init', JSON.stringify({ watchlist: payload.watchlist }));
    } catch {}
    return res.json({ ...payload, userId: effectiveUid });
  }
  res.json({
    userId: effectiveUid,
    watchlist: JSON.parse(row.watchlist_json),
    severity: JSON.parse(row.severity_json),
    showAll: !!row.show_all,
    dismissed: JSON.parse(row.dismissed_json),
    currency: row.currency || 'USD',
    loggedIn: !!sess,
    isAdmin,
    profile: urow ? { name: urow.name || '', email: urow.email || '', avatar: urow.avatar || '', username: urow.username || '' } : { name:'', email:'', avatar:'', username:'' }
  });
});

// ============================================================================
// POST /api/me/username - Set/update username
// ============================================================================
router.post('/api/me/username', async (req, res) => {
  const sess = getSession(req);
  const effectiveUid = sess?.uid || req.uid;
  const { username } = req.body || {};
  const val = String(username || '').trim();
  // validate: 3-20 chars, letters, numbers, underscore only; must start with a letter
  if (!/^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(val)) {
    return res.status(400).json({ ok:false, error:'invalid_username', rules:'3-20 chars, letters/numbers/underscore, start with a letter' });
  }
  // uniqueness (case-insensitive)
  const taken = await getUserByUsername(val);
  if (taken && taken.id !== effectiveUid) {
    return res.status(409).json({ ok:false, error:'taken' });
  }
  await setUsername(val, effectiveUid);
  try {
    const urow = await getUser(effectiveUid);
    await insertAudit(effectiveUid, (urow&&urow.email)||'', 'username_set', JSON.stringify({ username: val }));
  } catch {}
  res.json({ ok:true, username: val });
});

// ============================================================================
// POST /api/me/avatar - Set/update avatar (simple URL validation)
// ============================================================================
router.post('/api/me/avatar', async (req, res) => {
  const sess = getSession(req);
  const effectiveUid = sess?.uid || req.uid;
  const { url } = req.body || {};
  const val = String(url || '').trim();
  try{
    const u = new URL(val);
    if (u.protocol !== 'https:') throw new Error('https_required');
    if (val.length > 300) throw new Error('too_long');
  }catch(e){
    return res.status(400).json({ ok:false, error:'invalid_url' });
  }
  await setAvatar(val, effectiveUid);
  try {
    const urow = await getUser(effectiveUid);
    await insertAudit(effectiveUid, (urow&&urow.email)||'', 'avatar_set', JSON.stringify({ avatar: val.slice(0,120) }));
  } catch {}
  res.json({ ok:true, avatar: val });
});

// ============================================================================
// POST /api/me/prefs - Update preferences (watchlist, severity, currency, etc)
// ============================================================================
router.post('/api/me/prefs', async (req, res) => {
  const { watchlist = [], severity = ['critical','warning','info'], showAll = false, dismissed = [], currency = 'USD' } = req.body || {};
  const sess = getSession(req);
  const effectiveUid = sess?.uid || req.uid;

  // Validate currency code
  const validCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'INR', 'BRL'];
  const currencyCode = validCurrencies.includes(currency) ? currency : 'USD';

  await upsertPrefs(
    effectiveUid,
    JSON.stringify([...new Set(watchlist.map(s => String(s).toUpperCase()))]),
    JSON.stringify(severity),
    showAll ? 1 : 0,
    JSON.stringify(dismissed),
    currencyCode
  );
  try {
    const urow = await getUser(effectiveUid);
    await insertAudit(effectiveUid, (urow&&urow.email)||'', 'prefs_saved', JSON.stringify({ watchlistLen: (watchlist||[]).length }));
  } catch {}
  res.json({ ok: true });
});

// ============================================================================
// GET /api/me/profile - Get user profile (experience, risk tolerance, etc)
// ============================================================================
router.get('/api/me/profile', async (req, res) => {
  const sess = getSession(req);
  const effectiveUid = sess?.uid || req.uid;
  if (!effectiveUid) return res.json({ profile: null });
  const profile = await getUserProfile(effectiveUid);
  if (!profile) return res.json({ profile: null });
  // Parse JSONB fields
  const parsed = { ...profile };
  for (const f of ['holdings', 'interests', 'exchanges', 'wallets', 'notes']) {
    if (typeof parsed[f] === 'string') {
      try { parsed[f] = JSON.parse(parsed[f]); } catch { parsed[f] = []; }
    }
  }
  // Strip internal fields
  delete parsed.user_id;
  res.json({ profile: parsed });
});

// ============================================================================
// POST /api/me/profile - Update user profile
// ============================================================================
router.post('/api/me/profile', async (req, res) => {
  const sess = getSession(req);
  const effectiveUid = sess?.uid || req.uid;
  if (!effectiveUid) return res.status(401).json({ error: 'no user identity' });
  await ensureProfile(effectiveUid);
  const updates = req.body || {};
  // Only allow known fields
  const allowed = ['experience', 'risk_tolerance', 'interests', 'exchanges', 'wallets', 'goals', 'concerns'];
  const filtered = {};
  for (const k of allowed) {
    if (updates[k] !== undefined) filtered[k] = updates[k];
  }
  if (Object.keys(filtered).length) {
    await updateProfile(effectiveUid, filtered);
  }
  res.json({ ok: true });
});

// ============================================================================
// DELETE /api/me/profile - Clear user profile
// ============================================================================
router.delete('/api/me/profile', async (req, res) => {
  const sess = getSession(req);
  const effectiveUid = sess?.uid || req.uid;
  if (!effectiveUid) return res.status(401).json({ error: 'no user identity' });
  try {
    await pool.query('DELETE FROM user_profiles WHERE user_id = $1', [effectiveUid]);
    res.json({ ok: true, note: 'Profile cleared. Sentinel AI will start fresh next time.' });
  } catch (err) {
    if (err.code === '42P01') return res.json({ ok: true });
    res.status(500).json({ error: 'delete_failed' });
  }
});

// ============================================================================
// GET /api/me/notifications - Get user notifications
// ============================================================================
router.get('/api/me/notifications', (req, res) => {
  const sess = getSession(req);
  const uid = sess?.uid || req.uid || null;
  if (!uid) return res.json({ notifications: [], unread: 0 });

  pool.query(
    `SELECT id, type, title, body, data, read, created_at
     FROM user_notifications WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 20`,
    [uid]
  ).then(({ rows }) => {
    const unread = rows.filter(r => !r.read).length;
    res.json({ notifications: rows, unread });
  }).catch(e => {
    if (e.code === '42P01') return res.json({ notifications: [], unread: 0 });
    console.warn('[notifications] Error:', e.message);
    res.json({ notifications: [], unread: 0 });
  });
});

// ============================================================================
// POST /api/me/notifications/read - Mark notifications as read
// ============================================================================
router.post('/api/me/notifications/read', express.json(), (req, res) => {
  const sess = getSession(req);
  const uid = sess?.uid || req.uid || null;
  if (!uid) return res.json({ ok: true });

  const { ids } = req.body || {};
  if (Array.isArray(ids) && ids.length) {
    pool.query(
      'UPDATE user_notifications SET read = TRUE WHERE user_id = $1 AND id = ANY($2::int[])',
      [uid, ids]
    ).then(() => res.json({ ok: true }))
     .catch(() => res.json({ ok: true }));
  } else {
    // Mark all as read
    pool.query(
      'UPDATE user_notifications SET read = TRUE WHERE user_id = $1',
      [uid]
    ).then(() => res.json({ ok: true }))
     .catch(() => res.json({ ok: true }));
  }
});

// ============================================================================
// GET /api/me/price-watches - Get user's price watches
// ============================================================================
router.get('/api/me/price-watches', (req, res) => {
  const sess = getSession(req);
  const uid = sess?.uid || req.uid || null;
  if (!uid) return res.json({ watches: [] });

  pool.query(
    'SELECT * FROM price_watches WHERE user_id = $1 ORDER BY created_at DESC',
    [uid]
  ).then(({ rows }) => res.json({ watches: rows }))
   .catch(e => {
     if (e.code === '42P01') return res.json({ watches: [] });
     res.json({ watches: [] });
   });
});

// ============================================================================
// DELETE /api/me/price-watches/:id - Remove a price watch
// ============================================================================
router.delete('/api/me/price-watches/:id', (req, res) => {
  const sess = getSession(req);
  const uid = sess?.uid || req.uid || null;
  if (!uid) return res.status(401).json({ error: 'not_authenticated' });

  pool.query(
    'DELETE FROM price_watches WHERE id = $1 AND user_id = $2',
    [req.params.id, uid]
  ).then(() => res.json({ ok: true }))
   .catch(() => res.json({ ok: true }));
});

// ============================================================================
// GET /api/me/digest - Get latest alert digest or generate on demand
// ============================================================================
router.get('/api/me/digest', async (req, res) => {
  const sess = getSession(req);
  const uid = sess?.uid || req.uid || null;
  if (!uid) return res.json({ digest: null });

  try {
    // Try to get most recent digest
    const { rows } = await pool.query(
      'SELECT * FROM alert_digests WHERE user_id = $1 ORDER BY period_end DESC LIMIT 1',
      [uid]
    );
    if (rows.length) {
      return res.json({ digest: rows[0] });
    }
    // Generate on demand if none exists
    const digest = await generateAlertDigest(uid, true);
    res.json({ digest });
  } catch (e) {
    if (e.code === '42P01') return res.json({ digest: null });
    res.json({ digest: null });
  }
});

// ============================================================================
// POST /api/token-requests - Submit a token request
// ============================================================================
router.post('/api/token-requests', async (req, res) => {
  const sess = getSession(req);
  const effectiveUid = sess?.uid || req.uid;

  const { symbol, name, reason, website, marketCap } = req.body || {};

  // Validate required fields
  if (!symbol || !name || !reason) {
    return res.status(400).json({
      error: 'missing_fields',
      message: 'Symbol, name, and reason are required'
    });
  }

  // Validate symbol format
  const cleanSymbol = String(symbol).trim().toUpperCase();
  if (!/^[A-Z0-9]{1,10}$/.test(cleanSymbol)) {
    return res.status(400).json({
      error: 'invalid_symbol',
      message: 'Symbol must be 1-10 characters, letters and numbers only'
    });
  }

  // Validate lengths
  const cleanName = String(name).trim();
  const cleanReason = String(reason).trim();
  if (cleanName.length > 50) {
    return res.status(400).json({
      error: 'name_too_long',
      message: 'Token name must be 50 characters or less'
    });
  }
  if (cleanReason.length > 500) {
    return res.status(400).json({
      error: 'reason_too_long',
      message: 'Reason must be 500 characters or less'
    });
  }

  // Validate website URL if provided
  let cleanWebsite = '';
  if (website) {
    try {
      const url = new URL(String(website).trim());
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        cleanWebsite = url.href;
      }
    } catch (e) {
      return res.status(400).json({
        error: 'invalid_website',
        message: 'Website must be a valid URL'
      });
    }
  }

  // Check for duplicate recent submissions from this user
  const recentSubmissionsResult = await pool.query(`
    SELECT COUNT(*) as count FROM token_requests
    WHERE user_id = $1 AND symbol = $2 AND submitted_at > NOW() - INTERVAL '24 hours'
  `, [effectiveUid, cleanSymbol]);

  const recentSubmissions = parseInt(recentSubmissionsResult.rows[0].count);

  if (recentSubmissions > 0) {
    return res.status(429).json({
      error: 'duplicate_request',
      message: 'You have already submitted a request for this token in the last 24 hours'
    });
  }

  try {
    // Insert token request
    const result = await pool.query(`
      INSERT INTO token_requests (user_id, symbol, name, reason, website, market_cap, submitted_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      effectiveUid,
      cleanSymbol,
      cleanName,
      cleanReason,
      cleanWebsite,
      String(marketCap || '').trim(),
      new Date().toISOString()
    ]);

    // Log audit event
    try {
      const urow = await getUser(effectiveUid);
      await insertAudit(
        effectiveUid,
        (urow && urow.email) || '',
        'token_request_submitted',
        JSON.stringify({ symbol: cleanSymbol, name: cleanName })
      );
    } catch (auditError) {
      console.warn('Failed to log token request audit:', auditError.message);
    }

    res.status(201).json({
      success: true,
      id: result.rows[0].id,
      message: 'Token request submitted successfully'
    });

  } catch (error) {
    console.error('Error submitting token request:', error);
    res.status(500).json({
      error: 'submission_failed',
      message: 'Failed to submit token request'
    });
  }
});

// ============================================================================
// GET /api/token-requests/mine - Get user's token requests
// ============================================================================
router.get('/api/token-requests/mine', async (req, res) => {
  const sess = getSession(req);
  const effectiveUid = sess?.uid || req.uid;

  try {
    const result = await pool.query(`
      SELECT id, symbol, name, reason, website, market_cap, status, submitted_at, reviewed_at, notes
      FROM token_requests
      WHERE user_id = $1
      ORDER BY submitted_at DESC
    `, [effectiveUid]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching user token requests:', error);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// ============================================================================
// POST /api/summary/generate - Generate AI summary for alerts
// ============================================================================
router.post('/api/summary/generate', async (req, res) => {
  try {
    // Require Google login to generate summaries
    const sess = getSession(req);
    if (!sess || !sess.uid) {
      return res.status(401).json({ error: 'Authentication required. Please sign in with Google to generate summaries.' });
    }

    const { alerts, tokens, sevFilter, tagFilter, model } = req.body;

    if (!alerts || !Array.isArray(alerts)) {
      return res.status(400).json({ error: 'Invalid alerts data' });
    }

    console.log(`[Summary] Requested model: "${model}" (type: ${typeof model})`);

    // Generate AI summary using available API
    const summary = await generateAISummary(alerts, tokens || [], sevFilter || [], tagFilter || [], model);
    const news = await fetchNewsForTokens(tokens || []);

    // Persist for logged-in users
    try {
      const alertIds = (alerts || []).map(a => a.id).filter(Boolean);
      await insertUserSummary(sess.uid, {
        model: summary.model,
        tokens: tokens || [],
        sevFilter: sevFilter || [],
        tagFilter: tagFilter || [],
        alertIds,
        content: summary.content,
        usage: summary.usage || null
      });
    } catch (persistErr) {
      console.warn('Failed to persist user summary (non-fatal):', persistErr && persistErr.message);
    }

    res.json({
      summary: summary.content,
      model: summary.model,
      usage: summary.usage,
      alertCount: summary.alertCount,
      tokenCount: summary.tokenCount,
      news: news,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('AI Summary generation error:', error);
    res.status(500).json({
      error: 'Failed to generate summary',
      fallback: generateFallbackSummary(req.body.alerts || [], req.body.tokens || [])
    });
  }
});

// ============================================================================
// GET /api/summary/recent - Get recent user summaries (logged-in only)
// ============================================================================
router.get('/api/summary/recent', async (req, res) => {
  try {
    const sess = getSession(req);
    if (!sess || !sess.uid) return res.json({ summaries: [] }); // Not logged in → nothing
    const lim = req.query.limit ? parseInt(String(req.query.limit)) : 10;
    const items = await getRecentUserSummaries(sess.uid, lim);
    res.json({ summaries: items });
  } catch (e) {
    console.error('Failed to fetch recent summaries:', e && e.message);
    res.status(500).json({ summaries: [] });
  }
});

module.exports = router;
