# Backend Fix Instructions for CLG-DEPLOY Team

## Issue
The CLG-ADMIN dashboard is deployed but cannot fetch alert data because it's pointing to the wrong backend URL.

## Root Cause
The Railway environment variable `VITE_API_URL` is either:
- Not set at all
- Set to localhost
- Set to the wrong URL

## Quick Fix (5 minutes)

### Step 1: Set Railway Environment Variable

1. Go to Railway dashboard: https://railway.app
2. Open the **CLG-ADMIN** service (not CLG-DEPLOY)
3. Go to **Variables** tab
4. Add or update this variable:

```
VITE_API_URL=https://app.crypto-lifeguard.com
```

**Important:** Replace `https://app.crypto-lifeguard.com` with your actual CLG-DEPLOY backend URL.

### Step 2: Verify CORS is Configured

Make sure CLG-DEPLOY backend has the admin dashboard URL in CORS:

1. Open CLG-DEPLOY service in Railway
2. Go to **Variables** tab
3. Verify this variable exists:

```
ADMIN_DASHBOARD_URL=https://clg-admin-production.up.railway.app
```

(Replace with your actual CLG-ADMIN Railway URL)

### Step 3: Trigger Rebuild

After setting `VITE_API_URL`:

1. In CLG-ADMIN service, go to **Deployments** tab
2. Click **Redeploy** on the latest deployment
   
   OR just push a new commit to trigger auto-deploy

3. Wait 1-2 minutes for build to complete

### Step 4: Test

1. Visit your CLG-ADMIN Railway URL
2. Login to dashboard
3. Check that alerts load on Dashboard page
4. Check that Alerts page shows data

## What Each Variable Does

### CLG-ADMIN Variables
- `VITE_API_URL` - Where the frontend sends API requests (points to CLG-DEPLOY backend)

### CLG-DEPLOY Variables  
- `ADMIN_DASHBOARD_URL` - Which domains can access the API (CORS whitelist)

## Verification Checklist

✅ CLG-ADMIN has `VITE_API_URL` set to backend URL  
✅ CLG-DEPLOY has `ADMIN_DASHBOARD_URL` set to admin URL  
✅ Both services are deployed and running  
✅ Dashboard loads without errors  
✅ Alerts page shows data  

## Troubleshooting

### Still getting errors after setting variables?

1. **Check Railway build logs** - Look for build errors
2. **Check browser console** - Look for CORS or network errors
3. **Verify URLs** - Make sure no typos in URLs, and they're https:// not http://
4. **Check backend logs** - See if requests are reaching the backend

### CORS errors in browser?

Backend needs to restart after changing `ADMIN_DASHBOARD_URL`:
- Go to CLG-DEPLOY service
- Click **Restart** or trigger a redeploy

### Backend returning 401 Unauthorized?

Admin token might be invalid:
- Logout and login again
- Check admin user exists in database
- Check JWT_SECRET is set in CLG-DEPLOY

## Architecture Overview

```
[Browser] 
    ↓
[CLG-ADMIN on Railway] 
    ↓ (VITE_API_URL points here)
[CLG-DEPLOY on Railway]
    ↓
[PostgreSQL on Railway]
```

## Contact

If issues persist after following these steps, provide:
1. CLG-ADMIN Railway URL
2. CLG-DEPLOY Railway URL  
3. Screenshot of browser console errors
4. Screenshot of Railway environment variables (both services)
