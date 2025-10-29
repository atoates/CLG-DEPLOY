# Quick Fix Guide - Alerts Not Loading

## The Situation

✅ Frontend deployed: `https://clg-admin-production.up.railway.app`  
✅ Backend running: `https://app.crypto-lifeguard.com`  
✅ CORS already configured in backend `server.js`  
✅ `ADMIN_DASHBOARD_URL` set in Railway  
❌ Alerts page shows "Loading..." forever

## Most Likely Fix: Redeploy Backend

The environment variable might not have been loaded when you first set it.

### Step 1: Redeploy CLG-DEPLOY

1. Open Railway dashboard
2. Go to **CLG-DEPLOY** project
3. Click **Deploy** dropdown (top right)
4. Click **Redeploy**
5. Wait for deployment (2-3 minutes)

### Step 2: Check Railway Logs

After redeployment, check logs for:

```
[CORS] Allowed origins on startup: [...]
```

Should include: `https://clg-admin-production.up.railway.app`

### Step 3: Test Admin Dashboard

1. Open: `https://clg-admin-production.up.railway.app`
2. Click **Alerts** in sidebar
3. Open DevTools Console (F12)
4. Look for errors

## Quick Diagnostics

### Test 1: Is the endpoint working?

```bash
curl https://app.crypto-lifeguard.com/api/alerts
```

**Expected:** JSON array (may be empty `[]` or have alerts)  
**If 401/403:** Endpoint exists, just needs auth ✅  
**If 404:** Endpoint missing ❌

### Test 2: Is CORS responding?

```bash
curl -X OPTIONS https://app.crypto-lifeguard.com/api/alerts \
  -H "Origin: https://clg-admin-production.up.railway.app" \
  -v
```

**Look for in response:**
```
< Access-Control-Allow-Origin: https://clg-admin-production.up.railway.app
```

**If present:** CORS is working ✅  
**If missing:** CORS not configured or env var not loaded ❌

### Test 3: Is the admin token valid?

Open browser console on admin dashboard:

```javascript
localStorage.getItem('adminToken')
```

**Should return:** A string like `"abc123..."`  
**If null:** You're not logged in ❌  
**If present:** Token exists ✅

### Test 4: Manual fetch from browser

On admin dashboard, open console:

```javascript
fetch('https://app.crypto-lifeguard.com/api/alerts', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('adminToken')
  }
})
  .then(r => r.json())
  .then(console.log)
  .catch(console.error)
```

**If successful:** Shows alerts array → Frontend bug ❌  
**If CORS error:** CORS blocking → Backend needs redeploy ❌  
**If 401:** Invalid token → Re-login ❌

## Most Common Issues

### 1. Env Var Not Loaded (90% of cases)

**Solution:** Redeploy CLG-DEPLOY in Railway

### 2. Admin Token Missing/Invalid

**Solution:** 
1. Go to admin dashboard login page
2. Re-enter admin token
3. Try alerts page again

### 3. Endpoint Doesn't Exist

**Solution:** 
- Check backend `server.js` has `app.get('/api/alerts', ...)` route
- Verify backend is deployed and running

### 4. Network/Firewall Issue

**Solution:**
- Check Railway status page
- Try from different network
- Disable VPN if using one

## Emergency Debug Mode

If nothing works, temporarily allow all origins (TEST ONLY):

1. Edit CLG-DEPLOY `server.js` line ~72:
   ```javascript
   const corsOptions = {
     origin: true,  // ⚠️ ALLOW ALL - REMOVE AFTER TEST
     credentials: true,
     // ... rest
   };
   ```

2. Deploy and test
3. **If it works:** CORS was blocking → Fix env var and revert
4. **If still fails:** Not a CORS issue → Check token/endpoint

5. **IMMEDIATELY REVERT** this change!

## Need Help?

Share these with me:

1. **Railway logs** from CLG-DEPLOY (last 50 lines)
2. **Browser console** screenshot showing errors
3. **Network tab** screenshot showing failed request
4. **Result of Test 1-4** above

## Next Steps After Fix

Once alerts load:

- [ ] Test delete alert functionality
- [ ] Test search and filter
- [ ] Build Users management page
- [ ] Build Token Requests page
- [ ] Build Audit Log page
- [ ] Build Settings page
