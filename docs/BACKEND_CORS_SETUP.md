# Backend CORS Setup - Troubleshooting Guide

## ✅ CORS Already Configured!

Your backend (CLG-DEPLOY `server.js`) **already has CORS properly configured** (lines 60-91):

```javascript
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4173',
  process.env.ADMIN_DASHBOARD_URL,      // ← Your production admin URL
  process.env.STAGING_ADMIN_URL,
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('[CORS] Blocked request from origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
```

## Why Alerts Still Won't Load?

Since CORS is configured, the issue is likely:

### 1. Environment Variable Not Loaded in Railway

**Action:** Verify in Railway → CLG-DEPLOY → Variables

You've set:
```
ADMIN_DASHBOARD_URL=https://clg-admin-production.up.railway.app
```

**But did you redeploy after setting it?**

1. Go to Railway → CLG-DEPLOY
2. Click **Deploy** dropdown → **Redeploy**
3. Wait for deployment to complete
4. Check logs for errors

### 2. Add Debug Logging to Backend

Edit CLG-DEPLOY `server.js` around line 66 to add logging:

```javascript
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4173',
  process.env.ADMIN_DASHBOARD_URL,
  process.env.STAGING_ADMIN_URL,
].filter(Boolean);

// 🔍 ADD THIS DEBUG LOG:
console.log('[CORS] Allowed origins on startup:', allowedOrigins);

const corsOptions = {
  origin: function (origin, callback) {
    // 🔍 ADD THIS DEBUG LOG:
    console.log('[CORS] Incoming request from origin:', origin);
    
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      // 🔍 ADD THIS:
      console.log('[CORS] ✅ Origin ALLOWED');
      callback(null, true);
    } else {
      // 🔍 ADD THIS:
      console.log('[CORS] ❌ Origin BLOCKED');
      console.log('[CORS] Blocked request from origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
};
```

Then check Railway logs when loading admin dashboard.

### 3. Test CORS with cURL

Run this from your terminal:

```bash
curl -X OPTIONS https://app.crypto-lifeguard.com/api/alerts \
  -H "Origin: https://clg-admin-production.up.railway.app" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Authorization" \
  -v
```

**Expected response headers:**
```
Access-Control-Allow-Origin: https://clg-admin-production.up.railway.app
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
```

**If you see:**
- `Access-Control-Allow-Origin: *` → Something's wrong with origin check
- No `Access-Control-Allow-Origin` → CORS middleware not working
- `403 Forbidden` or `Not allowed by CORS` → Origin is being blocked

### 4. Check Browser DevTools

In admin dashboard (https://clg-admin-production.up.railway.app):

1. Open **DevTools** (F12)
2. Go to **Network** tab
3. Refresh the page
4. Find the `/api/alerts` request (should be red if failing)
5. Click on it
6. Check **Headers** tab:

**Request Headers should show:**
```
Origin: https://clg-admin-production.up.railway.app
Authorization: Bearer your-token-here
```

**Response Headers should show:**
```
Access-Control-Allow-Origin: https://clg-admin-production.up.railway.app
Access-Control-Allow-Credentials: true
```

**If missing CORS headers** → Backend didn't process CORS middleware
**If CORS headers present but request fails** → Different issue (auth, endpoint, etc.)

### 5. Verify Admin Token

The token might be invalid or expired. In browser console:

```javascript
// Check if token exists
localStorage.getItem('adminToken')

// Try a manual fetch
fetch('https://app.crypto-lifeguard.com/api/alerts', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('adminToken')
  }
})
  .then(r => r.json())
  .then(console.log)
  .catch(console.error)
```

**If you see:**
- `401 Unauthorized` → Token is invalid (not a CORS issue)
- `CORS error` → CORS is still blocking
- `404 Not Found` → Endpoint doesn't exist
- `200 OK` with data → **It works!** Frontend code issue

### 6. Check Endpoint Exists

Verify `/api/alerts` endpoint is accessible:

```bash
curl https://app.crypto-lifeguard.com/api/alerts
```

Should return JSON with alerts array (even if empty).

**If you see:**
- `{"error":"unauthorized"}` → Good, endpoint exists, just needs auth
- `404 Not Found` → Endpoint missing
- HTML response → Wrong URL or server misconfigured

### 7. Temporary Debug: Allow All Origins

⚠️ **ONLY FOR DEBUGGING - DO NOT LEAVE IN PRODUCTION!**

Edit CLG-DEPLOY `server.js` line 72:

```javascript
const corsOptions = {
  origin: true,  // ⚠️ TEMPORARY: Allow ALL origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
};
```

Deploy and test:
- **If it works** → CORS config was the issue
- **If still fails** → Problem is NOT CORS (check auth token, endpoint, etc.)

**IMMEDIATELY REVERT THIS CHANGE after testing!**

## Common Issues & Solutions

### Issue: "No 'Access-Control-Allow-Origin' header is present"

**Cause:** Backend isn't sending CORS headers

**Solutions:**
1. Verify `cors` package is installed in backend
2. Check CORS middleware is before route handlers
3. Ensure `app.use(cors(corsOptions))` is called
4. Check Railway logs for CORS middleware errors

### Issue: "Origin ... has been blocked by CORS policy"

**Cause:** Your origin isn't in allowedOrigins array

**Solutions:**
1. Verify `ADMIN_DASHBOARD_URL` env var in Railway
2. Ensure exact match (no trailing slash, correct protocol)
3. Check Railway logs show correct URL in allowedOrigins
4. Redeploy backend after setting env var

### Issue: Requests work in Postman but not browser

**Cause:** Postman doesn't enforce CORS (browsers do)

**Solution:** This confirms it's a CORS issue. Follow steps above.

### Issue: "The CORS protocol does not allow specifying a wildcard when credentials are included"

**Cause:** Using `origin: '*'` with `credentials: true`

**Solution:** Use specific origins or set `credentials: false`

### Issue: OPTIONS preflight request fails

**Cause:** Preflight not handled correctly

**Solution:** Ensure `app.options('*', cors(corsOptions))` is in server.js (line 91)

## Security Checklist

After fixing CORS:

- [ ] Remove debug logging from production
- [ ] Never use `origin: true` or `origin: '*'` in production
- [ ] Verify only your admin URL is allowed
- [ ] Ensure admin token is validated server-side
- [ ] Monitor logs for unusual origin requests
- [ ] Keep admin dashboard URL private

## Next Steps

Once CORS is verified working:

1. **Remove debug logs** from server.js
2. **Test all admin features** (create, edit, delete alerts)
3. **Monitor Railway logs** for any CORS warnings
4. **Set up monitoring** to catch CORS issues early

## Still Not Working?

If you've tried everything above and alerts still won't load:

1. **Share Railway logs** - Look for errors during startup or requests
2. **Share browser console errors** - Exact error message matters
3. **Share Network tab screenshot** - Shows request/response headers
4. **Verify both deployments** - CLG-ADMIN and CLG-DEPLOY are both live

The backend CORS config looks correct, so the issue is likely:
- Environment variable not loaded (needs redeploy)
- Admin token invalid or not sent
- Endpoint doesn't exist or has different URL
- Network/firewall blocking requests
