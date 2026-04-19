// routes/push.js — Web Push subscription management and admin test endpoint.
//
// Public:
//   GET  /api/push/vapid-key       → { key } (public, safe to expose)
//   POST /api/push/subscribe       → store a { endpoint, keys:{p256dh,auth} }
//   POST /api/push/unsubscribe     → delete by endpoint
//
// Admin:
//   POST /admin/push/test          → send a test notification to all subs
//   GET  /admin/push/subscriptions → list (count-only for privacy)

const express = require('express');
const router = express.Router();

const { pool } = require('../lib/db');
const push = require('../lib/push');
const { requireAdmin } = require('../lib/middleware');

router.get('/api/push/vapid-key', (_req, res) => {
  if (!push.isConfigured()) {
    return res.status(503).json({ error: 'push_not_configured' });
  }
  res.json({ key: push.getPublicKey() });
});

// Accepts either the raw PushSubscription.toJSON() shape
// { endpoint, keys: { p256dh, auth } } or a flat variant.
router.post('/api/push/subscribe', async (req, res) => {
  const body = req.body || {};
  const endpoint = String(body.endpoint || '').trim();
  const p256dh = String((body.keys && body.keys.p256dh) || body.p256dh || '').trim();
  const auth = String((body.keys && body.keys.auth) || body.auth || '').trim();

  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({ error: 'missing_fields', required: ['endpoint', 'keys.p256dh', 'keys.auth'] });
  }
  if (!/^https:\/\//i.test(endpoint)) {
    return res.status(400).json({ error: 'invalid_endpoint' });
  }

  try {
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET
         p256dh = EXCLUDED.p256dh,
         auth   = EXCLUDED.auth,
         user_id = COALESCE(EXCLUDED.user_id, push_subscriptions.user_id)`,
      [req.uid || null, endpoint, p256dh, auth]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[Push] subscribe failed:', err.message);
    res.status(500).json({ error: 'subscribe_failed' });
  }
});

router.post('/api/push/unsubscribe', async (req, res) => {
  const endpoint = String((req.body && req.body.endpoint) || '').trim();
  if (!endpoint) return res.status(400).json({ error: 'missing_endpoint' });
  try {
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Push] unsubscribe failed:', err.message);
    res.status(500).json({ error: 'unsubscribe_failed' });
  }
});

router.post('/admin/push/test', requireAdmin, async (_req, res) => {
  if (!push.isConfigured()) {
    return res.status(503).json({ error: 'push_not_configured' });
  }
  const payload = {
    title: 'Crypto Lifeguard — test notification',
    body: 'Push notifications are configured correctly.',
    url: '/',
    tag: 'clg-test'
  };
  const result = await push.broadcastToAll(payload);
  res.json({ ok: true, ...result });
});

router.get('/admin/push/subscriptions', requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM push_subscriptions');
    res.json({ count: rows[0] ? rows[0].n : 0 });
  } catch (err) {
    res.status(500).json({ error: 'count_failed', details: err.message });
  }
});

module.exports = router;
