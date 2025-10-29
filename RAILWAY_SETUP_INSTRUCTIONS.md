# 🚂 Railway Configuration Quick Guide

## ✅ What's Done

- [x] Monorepo structure created
- [x] Backend moved to `apps/backend/`
- [x] Admin moved to `apps/admin/`
- [x] Shared types in `packages/shared/`
- [x] Root workspace configured
- [x] Pushed to GitHub

## 🎯 What You Need to Do in Railway

### Step 1: Update Backend Service (CLG-DEPLOY) - DO THIS FIRST!

**⚠️ IMPORTANT: This won't break production!** Railway just needs to know where the code is now.

1. Go to https://railway.app
2. Select your project
3. Click on **CLG-DEPLOY** service
4. Go to **Settings** tab
5. Scroll to **Root Directory**
6. Change from `/` to `apps/backend`
7. Scroll to **Start Command**  
8. Verify it says: `node server.js` (should already be this)
9. Click **Deploy** tab
10. Click **Deploy Now**
11. Wait for deployment (should succeed - all files are in apps/backend now)
12. Test: Visit https://app.crypto-lifeguard.com (should work)

### Step 2: Update Admin Service (CLG-ADMIN)

1. Still in Railway dashboard
2. Click on **CLG-ADMIN** service
3. Go to **Settings** tab
4. Scroll to **Source** section
5. Click **Disconnect** on current repo
6. Click **Connect Repository**
7. Select `atoates/CLG-DEPLOY` (the monorepo we just pushed)
8. Scroll to **Root Directory**
9. Change from `/` to `apps/admin`
10. Scroll to **Build Command**
11. Set to: `npm install && npm run build`
12. Scroll to **Start Command**
13. Set to: `npm run preview`
14. Click **Deploy** tab
15. Click **Deploy Now**
16. Wait for deployment
17. Test: Visit https://clg-admin-production.up.railway.app

### Step 3: Verify Everything Works

- [ ] Backend API: https://app.crypto-lifeguard.com/api/alerts
- [ ] Admin loads: https://clg-admin-production.up.railway.app
- [ ] Can login to admin panel
- [ ] News feed loads
- [ ] Alerts load
- [ ] No CORS errors in browser console

## 🆘 If Something Breaks

### Backend not deploying?

```bash
# Check the logs in Railway dashboard
# Most likely: forgot to set root directory to apps/backend

Settings → Root Directory → apps/backend → Redeploy
```

### Admin not deploying?

```bash
# Check these settings:
Root Directory: apps/admin
Build Command: npm install && npm run build
Start Command: npm run preview
```

### "Repository not found" error?

Make sure you pushed the monorepo:
```bash
cd /Users/ato/Downloads/CLG/CLG-DEPLOY
git push origin main
```

## 📝 Environment Variables

**No changes needed!** All your environment variables stay the same:

**Backend:**
- DATABASE_URL
- ADMIN_TOKEN
- ADMIN_DASHBOARD_URL
- OPENAI_API_KEY
- (all others stay)

**Admin:**
- VITE_API_URL
- VITE_OPENAI_API_KEY

## 🔄 Development Workflow (New!)

Now you can work on both frontend and backend in one repo:

```bash
cd /Users/ato/Downloads/CLG/CLG-DEPLOY

# Run both services locally
npm run dev

# Or individually:
npm run dev:admin    # Just admin panel
npm run dev:backend  # Just backend
```

## 📊 Benefits You Now Have

✅ **Single repository** - no more switching between repos  
✅ **Shared types** - frontend and backend use same TypeScript types  
✅ **Atomic commits** - change frontend + backend together  
✅ **Better organization** - clear separation of concerns  
✅ **Easier onboarding** - new developers clone one repo  

## 🎉 Next Steps After Railway is Updated

1. **Test everything thoroughly**
2. **(Optional) Rename repo** from "CLG-DEPLOY" to "CLG"
3. **Archive CLG-ADMIN repo** on GitHub
4. **Update any documentation** with new repo name
5. **Consider implementing** Token Request System (see TOKEN_REQUEST_SYSTEM.md)
6. **Run architecture audit** (see CLG_DEPLOY_AUDIT.md)

---

**Current Status:** Monorepo created ✅  
**Next Action:** Update Railway service configurations  
**Estimated Time:** 10-15 minutes  
**Risk Level:** LOW (can easily rollback if needed)
