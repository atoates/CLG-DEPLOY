// routes/auth.js - OAuth and auth endpoints
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { sessions, setSession, getSession } = require('../lib/middleware');
const { upsertUser, getUser, pool } = require('../lib/db');

const router = express.Router();

// Configuration from environment
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const BASE_URL = process.env.BASE_URL || '';
const COOKIE_SECURE = (process.env.COOKIE_SECURE || '').toLowerCase() === 'true' || (BASE_URL && BASE_URL.startsWith('https://'));

// OAuth state persistence (disk-backed Map)
const oauthStates = new Map(); // state -> { timestamp, used }
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../data');
const OAUTH_STATES_FILE = path.join(DATA_DIR, 'oauth_states.json');

// Load OAuth states from disk on startup
try {
  if (fs.existsSync(OAUTH_STATES_FILE)) {
    const statesData = JSON.parse(fs.readFileSync(OAUTH_STATES_FILE, 'utf8'));
    const now = Date.now();
    const tenMinutesAgo = now - 10 * 60 * 1000;

    for (const [state, data] of Object.entries(statesData)) {
      if (data.timestamp > tenMinutesAgo && !data.used) {
        oauthStates.set(state, data);
      }
    }
    // OAuth states loaded from disk
  }
} catch (e) {
  console.warn('Failed to load OAuth states from disk:', e.message);
}

// Save OAuth states to disk
function saveOAuthStates() {
  try {
    const statesObj = Object.fromEntries(oauthStates.entries());
    fs.writeFileSync(OAUTH_STATES_FILE, JSON.stringify(statesObj, null, 2));
  } catch (e) {
    console.warn('Failed to save OAuth states to disk:', e.message);
  }
}

// Helper to compute base URL from request
function getBaseUrl(req) {
  if (BASE_URL) {
    try { return String(BASE_URL).replace(/\/+$/, ''); } catch { return BASE_URL; }
  }
  try {
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || '').toString().split(',')[0].trim() || 'http';
    const host = req.get('host');
    if (host) return `${proto}://${host}`.replace(/\/+$/, '');
  } catch {}
  return '';
}

// Helper to check auth config
function assertAuthConfig() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET');
  }
}

// Diagnostic logging helper (if available in server context)
function diagLog(context, event, data) {
  try {
    if (typeof global.diagLog === 'function') {
      global.diagLog(context, event, data);
    }
  } catch (_) {
    // Silently fail if diagLog is not available
  }
}

/**
 * GET /auth/google
 * Initiate Google OAuth flow
 */
router.get('/auth/google', (req, res) => {
  try {
    assertAuthConfig();
  } catch (e) {
    try {
      diagLog('auth', '/auth/google.configError', { err: String(e.message || e) });
    } catch (_) {}
    return res.status(500).send(String(e.message || e));
  }

  const state = crypto.randomBytes(16).toString('hex');
  try {
    diagLog('auth', '/auth/google.enter', {
      host: req.get('host') || '',
      protocol: req.protocol,
      xForwardedProto: req.get('x-forwarded-proto') || '',
      xForwardedHost: req.get('x-forwarded-host') || '',
      cookieNames: Object.keys(req.cookies || {}),
      hasSid: !!req.cookies.sid,
      hasUid: !!req.cookies.uid,
      statePrefix: state.slice(0, 8),
    });
  } catch (_) {}

  // Store state server-side instead of relying on cookies
  oauthStates.set(state, { timestamp: Date.now(), used: false });

  // Clean up old states (older than 10 minutes)
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [key, value] of oauthStates.entries()) {
    if (value.timestamp < tenMinutesAgo) {
      oauthStates.delete(key);
    }
  }

  // Save states to disk for persistence
  saveOAuthStates();

  const base = getBaseUrl(req);
  const redirectUri = `${String(base || '').replace(/\/+$/, '')}/auth/google/callback`;
  try {
    diagLog('auth', '/auth/google.redirect', { base, redirectUri, clientIdSet: !!GOOGLE_CLIENT_ID });
  } catch (_) {}

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });

  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
});

/**
 * GET /auth/google/callback
 * Handle Google OAuth callback
 */
router.get('/auth/google/callback', async (req, res) => {
  try {
    assertAuthConfig();
  } catch (e) {
    console.error('OAuth config error:', e.message);
    return res.status(500).send(String(e.message || e));
  }

  const { code, state } = req.query || {};
  console.log('OAuth callback received:', {
    code: code ? `${String(code).slice(0, 10)}...` : 'missing',
    state: state ? 'present' : 'missing',
    cookieState: req.cookies.oauth_state ? 'present' : 'missing',
    allCookies: Object.keys(req.cookies || {}),
    userAgent: req.get('user-agent'),
    timestamp: new Date().toISOString(),
  });

  try {
    diagLog('auth', '/auth/google/callback.enter', {
      hasCode: !!code,
      hasState: !!state,
      statePrefix: state ? String(state).slice(0, 8) : null,
      cookieNames: Object.keys(req.cookies || {}),
      host: req.get('host') || '',
      referer: req.get('referer') || '',
    });
  } catch (_) {}

  if (!code || !state) {
    console.error('OAuth callback missing code or state:', { code: !!code, state: !!state });
    return res.status(400).send('Invalid request - missing code or state');
  }

  // Validate state against server-side store
  const stateData = oauthStates.get(state);
  if (!stateData) {
    console.error('OAuth state not found in server store:', {
      receivedState: state,
      availableStates: Array.from(oauthStates.keys()),
      storeSize: oauthStates.size,
    });
    return res.status(400).send('Invalid state - not found');
  }

  if (stateData.used) {
    console.error('OAuth state already used:', { state, timestamp: stateData.timestamp });
    return res.status(400).send('Invalid state - already used');
  }

  // Mark state as used and remove it
  oauthStates.delete(state);
  saveOAuthStates();

  try {
    // Exchange code for tokens
    const base = getBaseUrl(req);
    const redirectUri = `${String(base || '').replace(/\/+$/, '')}/auth/google/callback`;
    const tokenParams = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code: String(code),
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    console.log('Exchanging OAuth code for tokens...');

    const tr = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });

    if (!tr.ok) {
      const errorText = await tr.text();
      console.error('Token exchange failed:', { status: tr.status, error: errorText });
      return res.status(502).send('token exchange failed');
    }

    const tj = await tr.json();
    console.log('Token exchange successful');

    const idToken = tj.id_token;
    if (!idToken) {
      console.error('No ID token in response');
      return res.status(502).send('No ID token received');
    }

    // Decode ID token payload (without verification — for demo)
    const payload = JSON.parse(
      Buffer.from(String(idToken).split('.')[1] || '', 'base64').toString('utf8')
    ) || {};

    const googleId = payload.sub || '';
    const email = payload.email || '';
    const name = payload.name || '';
    const avatar = payload.picture || '';

    // Create or map user
    const uid = `usr_${googleId}`; // simple mapping for demo

    console.log('Creating/updating user:', { uid, email });

    await upsertUser(uid);
    await pool.query(
      'UPDATE users SET google_id=$1, email=$2, name=$3, avatar=$4 WHERE id=$5',
      [googleId, email, name, avatar, uid]
    );

    setSession(res, { uid });
    console.log('OAuth success, session cookie set, redirecting to profile');

    // Same-origin: the sid cookie we just set will be present when the
    // browser loads /profile.html, so no auth-token exchange is needed.
    // We still generate one as a fallback for any cross-origin callers
    // (e.g. the admin dashboard).
    const authToken = crypto.randomBytes(32).toString('hex');
    sessions.set(`auth_token_${authToken}`, { uid, createdAt: Date.now() });

    try {
      diagLog('auth', '/auth/google/callback.success', {
        uid,
        email,
        sameOriginRedirect: true,
      });
    } catch (_) {}

    // Redirect to the profile page on the same origin.
    // The sid cookie is already set and will travel with the redirect.
    res.redirect('/profile.html');
  } catch (e) {
    console.error('OAuth callback error:', e.message, e.stack);
    res.status(500).send('oauth failed');
  }
});

/**
 * POST /auth/exchange-token
 * Exchange one-time auth token for session cookie
 */
router.post('/auth/exchange-token', express.json(), (req, res) => {
  const { token } = req.body;
  console.log('Token exchange request received:', {
    hasToken: !!token,
    tokenPrefix: token ? token.substring(0, 8) : 'none',
  });

  try {
    diagLog('auth', '/auth/exchange-token.enter', {
      hasToken: !!token,
      tokenPrefix: token ? String(token).substring(0, 8) : null,
      origin: req.get('origin') || '',
      referer: req.get('referer') || '',
      cookieNames: Object.keys(req.cookies || {}),
      hasSid: !!req.cookies.sid,
      hasUid: !!req.cookies.uid,
    });
  } catch (_) {}

  if (!token) {
    console.log('No token provided');
    try {
      diagLog('auth', '/auth/exchange-token.reject', { reason: 'no_token' });
    } catch (_) {}
    return res.status(400).json({ error: 'Token required' });
  }

  const sessionData = sessions.get(`auth_token_${token}`);
  console.log('Session data lookup:', { found: !!sessionData, totalSessions: sessions.size });

  if (!sessionData) {
    console.log('Token not found in sessions');
    try {
      diagLog('auth', '/auth/exchange-token.reject', {
        reason: 'token_not_found',
        totalSessions: sessions.size,
      });
    } catch (_) {}
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Check if token is too old (5 minutes)
  const age = Date.now() - sessionData.createdAt;
  console.log('Token age:', age, 'ms');

  if (age > 5 * 60 * 1000) {
    console.log('Token expired');
    try {
      diagLog('auth', '/auth/exchange-token.reject', { reason: 'token_expired', ageMs: age });
    } catch (_) {}
    sessions.delete(`auth_token_${token}`);
    return res.status(401).json({ error: 'Token expired' });
  }

  // Delete one-time token
  sessions.delete(`auth_token_${token}`);
  console.log('Token validated, creating session for uid:', sessionData.uid);

  // Create session with uid
  setSession(res, { uid: sessionData.uid });

  console.log('Session created successfully');
  try {
    diagLog('auth', '/auth/exchange-token.success', { uid: sessionData.uid, ageMs: age });
  } catch (_) {}
  res.json({ success: true, uid: sessionData.uid });
});

/**
 * POST /auth/logout
 * Clear session and logout
 */
router.post('/auth/logout', (req, res) => {
  const sid = req.cookies.sid;
  if (sid) {
    sessions.delete(sid);
    res.clearCookie('sid', { secure: COOKIE_SECURE, sameSite: 'lax', httpOnly: true });
  }
  res.json({ ok: true });
});

module.exports = router;
