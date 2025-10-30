# Production Deployment Checklist

## ⚠️ CRITICAL: Never push directly to `main` branch

All changes MUST go through staging first:

```bash
# ✅ Correct workflow
git checkout develop
git add .
git commit -m "feat: description"
git push origin develop

# Wait for staging deployment
# Test on https://clg-staging.up.railway.app

# If staging works, merge to main
git checkout main
git merge develop
git push origin main
```

## Pre-Deployment Checklist

- [ ] Changes tested locally (`npm run dev`)
- [ ] Build succeeds (`npm run build`)
- [ ] No syntax errors (`node -c server.js`)
- [ ] Deployed to staging and verified working
- [ ] All critical features tested on staging:
  - [ ] Alerts load
  - [ ] News tab works
  - [ ] Summary generation works
  - [ ] Market data displays
  - [ ] Token search/add works
  - [ ] User preferences save
- [ ] Admin dashboard tested (if admin changes made)
- [ ] No CORS errors in browser console
- [ ] Static assets load (check Network tab)

## Post-Deployment Verification

After pushing to `main`:

1. **Wait 2-3 minutes** for Railway deployment
2. **Check health endpoint**: `curl https://app.crypto-lifeguard.com/healthz`
3. **Visit production**: https://app.crypto-lifeguard.com
4. **Open browser console** - verify no errors
5. **Test core functionality**:
   - Add a token
   - View alerts
   - Check news tab
   - Generate summary

## 🚨 Rollback Procedure

If production breaks:

```bash
# Find last working commit
git log --oneline main

# Rollback to previous commit
git checkout main
git revert HEAD  # or git reset --hard <commit-hash>
git push origin main --force  # Only in emergencies!

# Or create a fix commit
git checkout develop
# make fixes
git add .
git commit -m "fix: emergency production fix"
git push origin develop
git checkout main
git merge develop
git push origin main
```

## Railway Monitoring

Check Railway dashboard regularly:
- **Logs**: Look for errors, CORS warnings, failed requests
- **Metrics**: CPU/Memory usage spikes
- **Health checks**: Should be green
- **Build logs**: Verify frontend builds successfully

## Common Issues & Solutions

### CORS Blocking Static Assets
**Symptom**: 500 errors on JS/CSS files, wrong MIME types
**Solution**: Ensure CORS only applies to `/api`, `/auth`, `/admin` routes
```javascript
// ✅ Correct - scoped CORS
app.use('/api', cors(corsOptions));
app.use('/auth', cors(corsOptions));

// ❌ Wrong - global CORS
app.use(cors(corsOptions));
```

### Missing Environment Variables
**Symptom**: Features work on staging but not production
**Solution**: Check Railway variables are set for production environment

### Build Failures
**Symptom**: HTML loads but no JavaScript/CSS
**Solution**: Check Railway build logs, ensure `npm run build` completed

## Contact

If production is down:
1. Check Railway logs immediately
2. Check GitHub Actions workflow status
3. Create emergency fix on `develop` branch
4. Test on staging
5. Merge to `main` only after staging verification
