// middleware.js - Auth and middleware utilities
const crypto = require('crypto');
const log = require('./logger');
const { upsertUser, getUser } = require('./db');

// Admin token + email helpers (reuse for admin-only APIs)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'ali@crypto-lifeguard.com,jordan@crypto-lifeguard.com,george@crypto-lifeguard.com')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

// CORS configuration for admin dashboard
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4173',
  process.env.ADMIN_DASHBOARD_URL,
  process.env.STAGING_ADMIN_URL,
  'https://app.crypto-lifeguard.com',  // Production main app
  'https://clg-staging.up.railway.app', // Staging main app
  'https://clg-admin-production.up.railway.app', // Production admin dashboard
  process.env.FRONTEND_URL, // CLG-DEPLOY frontend (production)
  process.env.STAGING_FRONTEND_URL, // CLG-DEPLOY frontend (staging)
].filter(Boolean); // Remove undefined values

log.debug('[CORS] Allowed origins:', allowedOrigins.length, 'configured');

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman, same-origin)
    if (!origin) return callback(null, true);

    const allowed = allowedOrigins.indexOf(origin) !== -1;
    try {
      if (typeof diagLog === 'function') {
        diagLog('server', 'cors-check', { origin, allowed, allowedOrigins });
      }
    } catch(_) {}
    if (allowed) {
      callback(null, true);
    } else {
      log.debug('[CORS] Blocked request from origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies to be sent
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
};

// Very small ephemeral in-memory session store
const sessions = new Map(); // sid -> { uid }

// Session management helpers
function setSession(res, data){
  const sid = crypto.randomBytes(16).toString('hex');
  sessions.set(sid, { ...data, t: Date.now() });
  // Same-origin: lax is the safe default. Works for top-level navigations (OAuth redirect).
  res.cookie('sid', sid, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    maxAge: 365*24*3600*1000
  });
  try {
    if (typeof diagLog === 'function') {
      diagLog('server', 'setSession', { sidPrefix: sid.slice(0, 8), uid: data && data.uid, totalSessions: sessions.size });
    }
  } catch(_) {}
}

function getSession(req){
  const sid = req.cookies.sid; if (!sid) return null;
  const s = sessions.get(sid); return s || null;
}

// Helper to extract admin token from request
function getAdminTokenFromReq(req){
  const auth = String(req.get('authorization') || req.get('x-admin-token') || '').trim();
  if (!auth) return '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return auth;
}

// requireAdmin middleware - checks token OR session-based email whitelist
async function requireAdmin(req, res, next){
  // Option 1: Header token
  const token = getAdminTokenFromReq(req);
  if (ADMIN_TOKEN && token && token === ADMIN_TOKEN) return next();

  // Option 2: Logged-in user from session and email whitelist
  const sess = getSession(req);
  if (sess && sess.uid) {
    try{
      const u = await getUser(sess.uid);
      const email = (u && u.email ? String(u.email).toLowerCase() : '');
      if (email && ADMIN_EMAILS.includes(email)) return next();
    }catch(e){ /* ignore */ }
  }
  return res.status(401).json({ error: 'unauthorized' });
}

// Anonymous user middleware - assigns req.uid via cookie if missing
// This should be used as: app.use(createAnonUserMiddleware())
function createAnonUserMiddleware() {
  return async (req, res, next) => {
    let uid = req.cookies.uid;
    const hadUid = !!uid;
    if (!uid) {
      uid = `usr_${Math.random().toString(36).slice(2,10)}`;
      res.cookie('uid', uid, {
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        maxAge: 365*24*3600*1000
      });
    }
    req.uid = uid;
    // Only log for auth/api routes to avoid flooding on static assets
    try {
      if (typeof diagLog === 'function' && (req.path.startsWith('/api/') || req.path.startsWith('/auth/'))) {
        diagLog('server', 'anon-uid-middleware', {
          path: req.path,
          method: req.method,
          hadUid,
          newUid: hadUid ? null : uid,
          cookieNames: Object.keys(req.cookies || {}),
          hasSid: !!req.cookies.sid,
        });
      }
    } catch(_) {}
    try {
      await upsertUser(uid);
    } catch (err) {
      console.error('Error upserting user:', err);
    }
    next();
  };
}

// Lightweight per-IP rate limiting (memory-based token bucket)
const chatRateMap = new Map(); // ip -> { tokens, resetAt }
function chatRateLimit(ip, limit = 20, windowMs = 60_000) {
  const now = Date.now();
  const entry = chatRateMap.get(ip) || { tokens: limit, resetAt: now + windowMs };
  if (now > entry.resetAt) { entry.tokens = limit; entry.resetAt = now + windowMs; }
  if (entry.tokens <= 0) { chatRateMap.set(ip, entry); return false; }
  entry.tokens -= 1;
  chatRateMap.set(ip, entry);
  return true;
}

module.exports = {
  // Auth configuration
  ADMIN_TOKEN,
  ADMIN_EMAILS,

  // CORS
  corsOptions,
  allowedOrigins,

  // Session management
  sessions,
  setSession,
  getSession,
  getAdminTokenFromReq,

  // Middleware
  requireAdmin,
  createAnonUserMiddleware,

  // Rate limiting
  chatRateLimit,
  chatRateMap
};
