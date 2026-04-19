// lib/push.js — Web Push (VAPID) setup and send helper.
//
// Configured via three env vars:
//   VAPID_PUBLIC_KEY  — base64url-encoded public key, shared with clients
//   VAPID_PRIVATE_KEY — base64url-encoded private key, server-only
//   VAPID_SUBJECT     — mailto:admin@example.com or https://your-site
//
// Generate once with:  npx web-push generate-vapid-keys
//
// If any env var is missing, this module goes into a graceful "disabled"
// mode: isConfigured() returns false, sendToSubscription() becomes a no-op.
// The rest of the server starts and runs normally without push.

const webpush = require('web-push');
const { pool } = require('./db');
const log = require('./logger');

const VAPID_PUBLIC_KEY = (process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || '').trim();
const VAPID_SUBJECT = (process.env.VAPID_SUBJECT || 'mailto:admin@crypto-lifeguard.com').trim();

let configured = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    configured = true;
    log.debug('[Push] VAPID configured');
  } catch (err) {
    console.warn('[Push] Failed to configure VAPID, push disabled:', err.message);
  }
} else {
  console.warn('[Push] VAPID keys not set — push notifications disabled.');
}

function isConfigured() { return configured; }
function getPublicKey() { return VAPID_PUBLIC_KEY; }

// Send a push to one subscription. On HTTP 404/410 (endpoint gone)
// we prune the subscription from the DB so we don't retry forever.
async function sendToSubscription(sub, payload) {
  if (!configured) return { ok: false, skipped: true };
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      body,
      { TTL: 60 * 60 * 24 } // 24h
    );
    return { ok: true };
  } catch (err) {
    const status = err && (err.statusCode || err.status);
    if (status === 404 || status === 410) {
      try {
        await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
        log.debug('[Push] Pruned dead subscription:', sub.endpoint.slice(0, 60));
      } catch (_) { /* ignore */ }
      return { ok: false, pruned: true };
    }
    console.warn('[Push] send failed:', status || err.message);
    return { ok: false, error: err.message };
  }
}

// Fan out to all subscriptions. Used for critical alerts.
async function broadcastToAll(payload) {
  if (!configured) return { sent: 0, failed: 0, skipped: true };
  let rows;
  try {
    ({ rows } = await pool.query('SELECT endpoint, p256dh, auth FROM push_subscriptions'));
  } catch (err) {
    console.warn('[Push] broadcast: DB query failed:', err.message);
    return { sent: 0, failed: 0, error: err.message };
  }
  let sent = 0, failed = 0;
  // Fire concurrently but don't await the whole thing if there are many.
  await Promise.allSettled(rows.map(async (row) => {
    const r = await sendToSubscription(row, payload);
    if (r.ok) sent++; else failed++;
  }));
  return { sent, failed, total: rows.length };
}

// Fire a push notification for a freshly-created alert. No-op if VAPID
// isn't configured or the alert isn't severe enough to page users.
// Today: critical only. Could be extended to warning + holdings filter.
function notifyAlert(alert) {
  if (!configured) return;
  if (!alert || alert.severity !== 'critical') return;
  const token = String(alert.token || '').toUpperCase();
  const title = `${token}: ${alert.title || 'Critical alert'}`.slice(0, 200);
  const body = String(alert.description || '').replace(/\s+/g, ' ').slice(0, 240);
  const payload = {
    title,
    body,
    url: `/alert.html?id=${encodeURIComponent(alert.id || '')}`,
    tag: `clg-alert-${alert.id || Date.now()}`,
    token,
    severity: alert.severity,
  };
  // Fire and forget — callers should not await this.
  broadcastToAll(payload).catch((err) => {
    console.warn('[Push] notifyAlert failed:', err && err.message);
  });
}

module.exports = {
  isConfigured,
  getPublicKey,
  sendToSubscription,
  broadcastToAll,
  notifyAlert,
};
