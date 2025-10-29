# Railway Monorepo Configuration

This repository contains two Railway services:

## Backend Service (CLG-DEPLOY)

**Settings in Railway Dashboard:**
- Service Name: CLG-DEPLOY
- Root Directory: `apps/backend`
- Build Command: (leave empty - npm install runs automatically)
- Start Command: `node server.js`
- Environment Variables: (see apps/backend/.env.example)

## Admin Service (CLG-ADMIN)

**Settings in Railway Dashboard:**
- Service Name: CLG-ADMIN
- Source Repository: Change from `atoates/CLG-ADMIN` to `atoates/CLG-DEPLOY`
- Root Directory: `apps/admin`
- Build Command: `npm install && npm run build`
- Start Command: `npm run preview`
- Environment Variables: (see apps/admin/.env.example)

## Migration Steps

### 1. Update CLG-DEPLOY Service (Backend)
1. Go to Railway dashboard → CLG-DEPLOY service
2. Settings → Root Directory: `apps/backend`
3. Settings → Start Command: `node server.js`
4. Deploy tab → Trigger manual deploy
5. Verify deployment succeeds

### 2. Update CLG-ADMIN Service (Frontend)
1. Go to Railway dashboard → CLG-ADMIN service
2. Settings → Source Repository → Disconnect current repo
3. Settings → Connect Repository → Select `atoates/CLG-DEPLOY`
4. Settings → Root Directory: `apps/admin`
5. Settings → Build Command: `npm install && npm run build`
6. Settings → Start Command: `npm run preview`
7. Deploy tab → Trigger manual deploy
8. Verify deployment succeeds

### 3. Verify Both Services
- [ ] Backend API responding at https://app.crypto-lifeguard.com
- [ ] Admin panel loading at https://clg-admin-production.up.railway.app
- [ ] Admin can login and access dashboard
- [ ] API calls from admin to backend working (check Network tab)
- [ ] No CORS errors

## Important Notes

- Both services deploy from the **same repository** but different root directories
- Backend must update ROOT directory **before** first deploy
- Admin service needs to be re-connected to the new repository
- Environment variables remain the same for both services
- Database connection stays unchanged

## Rollback Plan

If anything goes wrong:

**Backend:**
1. Railway → CLG-DEPLOY → Deployments
2. Click on last successful deployment
3. Click "Redeploy"

**Admin:**
1. Railway → CLG-ADMIN → Settings
2. Change root directory back to `/` (root)
3. Reconnect to old `atoates/CLG-ADMIN` repository
4. Redeploy

## Testing Commands

After deployment, test both services:

```bash
# Test backend health
curl https://app.crypto-lifeguard.com/healthz

# Test backend API
curl https://app.crypto-lifeguard.com/api/alerts

# Test admin panel
curl https://clg-admin-production.up.railway.app

# Test admin API connection (from browser console on admin panel)
fetch('/api/alerts').then(r => r.json()).then(console.log)
```
