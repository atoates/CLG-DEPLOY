# Testing & Deployment Guide - News Management

## ✅ Current Status

### Frontend Implementation
- **Build Status**: ✅ Successful (no TypeScript errors)
- **Bundle Size**: 658 KB (gzipped: 199 KB)
- **All Types Valid**: ✅ No compile errors
- **Routes Enabled**: ✅ `/news` active in navigation

### Backend Implementation (CLG-DEPLOY)
- **Endpoints Deployed**: ✅ All 6 admin news endpoints live
- **Production URL**: https://app.crypto-lifeguard.com
- **Authentication**: ✅ requireAdmin middleware active
- **Database**: ✅ news_cache table ready

## 🧪 Testing Steps

### 1. Local Development Test

#### Start Dev Server
```bash
cd /Users/ato/Downloads/CLG/CLG-ADMIN
npm run dev
```

#### Update .env for Production Testing
```bash
# Edit .env
VITE_API_URL=https://app.crypto-lifeguard.com
```

#### Test Checklist
- [ ] Navigate to http://localhost:5173
- [ ] Login with admin credentials
- [ ] Check Dashboard shows "News Articles" stat
- [ ] Check Dashboard shows "News Cache Statistics" section
- [ ] Click "News Feed" in sidebar
- [ ] Verify news articles load (or empty state if no articles)
- [ ] Test search functionality
- [ ] Test token filter dropdown
- [ ] Click "Refresh Cache" button
- [ ] Click "Edit" on an article
- [ ] Modify article and save
- [ ] Click "Delete" on an article
- [ ] Verify stats update after changes

### 2. API Endpoint Testing

#### Test with cURL (replace YOUR_ADMIN_TOKEN)

```bash
# Test news cache list
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  "https://app.crypto-lifeguard.com/admin/news/cache"

# Test news stats
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  "https://app.crypto-lifeguard.com/admin/news/stats"

# Test refresh (POST)
curl -X POST \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  "https://app.crypto-lifeguard.com/admin/news/refresh"

# Test filter by token
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  "https://app.crypto-lifeguard.com/admin/news/cache?token=BTC"

# Test update article
curl -X PUT \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Updated Title","sentiment":"positive"}' \
  "https://app.crypto-lifeguard.com/admin/news/cache/ARTICLE_URL_HERE"
```

### 3. Browser Console Testing

Open browser console and test API directly:

```javascript
// Get cached news
const token = localStorage.getItem('admin_token')
const response = await fetch('https://app.crypto-lifeguard.com/admin/news/cache', {
  headers: { 'Authorization': `Bearer ${token}` }
})
const data = await response.json()
console.log('News articles:', data)

// Get stats
const statsResponse = await fetch('https://app.crypto-lifeguard.com/admin/news/stats', {
  headers: { 'Authorization': `Bearer ${token}` }
})
const stats = await statsResponse.json()
console.log('News stats:', stats)
```

## 🚀 Deployment to Production

### Option 1: Railway Deployment (Recommended)

#### If Using Railway CLI:
```bash
# Install Railway CLI if not installed
npm i -g @railway/cli

# Login to Railway
railway login

# Link to your CLG-ADMIN project
railway link

# Deploy
railway up
```

#### Via Railway Dashboard:
1. Go to https://railway.app
2. Open CLG-ADMIN project
3. Go to **Variables** tab
4. Set: `VITE_API_URL=https://app.crypto-lifeguard.com`
5. Click **Deploy** > **Redeploy Latest**
6. Wait for build to complete (~2 minutes)

### Option 2: Manual Deployment

```bash
# Build production bundle
npm run build

# The dist/ folder is ready to deploy
# Upload to your hosting service (Vercel, Netlify, etc.)
```

### Environment Variables for Production

```bash
VITE_API_URL=https://app.crypto-lifeguard.com
```

## 🔍 Troubleshooting

### Issue: News articles don't load

**Check:**
1. Browser console for CORS errors
2. Network tab for failed requests
3. Admin token is valid (check localStorage)
4. Backend is returning ISO date strings (not Unix timestamps)

**Fix:**
```bash
# Check backend CORS settings
# Ensure ADMIN_DASHBOARD_URL includes your admin panel URL
```

### Issue: "Unauthorized" error

**Check:**
1. Admin token exists: `localStorage.getItem('admin_token')`
2. Token matches backend ADMIN_TOKEN
3. Authorization header is sent

**Fix:**
- Logout and login again
- Clear localStorage and re-authenticate

### Issue: Dates showing as numbers

**Problem:** Backend returning Unix timestamps instead of ISO strings

**Fix in backend:**
```javascript
// Ensure date conversion in server.js
date: row.date ? new Date(row.date).toISOString() : null
```

### Issue: Stats showing 0 or undefined

**Check:**
1. Database has news_cache entries
2. Entries haven't expired (expires_at > NOW())
3. News stats endpoint returns correct format

**Test:**
```sql
-- Check news_cache table
SELECT COUNT(*) FROM news_cache WHERE expires_at > NOW();
```

### Issue: Edit modal doesn't save

**Check:**
1. Network tab for PUT request errors
2. Article URL encoding is correct
3. Request body has valid sentiment values

**Debug:**
```javascript
// In browser console
console.log('Editing article:', articleUrl)
console.log('Updates:', updates)
```

## 📊 Performance Monitoring

### Metrics to Watch

1. **API Response Times**
   - `/admin/news/cache`: Should be < 500ms
   - `/admin/news/stats`: Should be < 200ms

2. **Bundle Size**
   - Current: 658 KB (199 KB gzipped)
   - Target: Keep under 700 KB

3. **Database Queries**
   - Ensure indexes are used (check EXPLAIN)
   - Monitor slow queries in PostgreSQL logs

### Optimization Tips

If news cache grows large (>1000 articles):

1. **Add Pagination**
   ```typescript
   // In NewsFeed.tsx
   const [page, setPage] = useState(1)
   const limit = 50
   fetchNewsCache({ token, days: 120, page, limit })
   ```

2. **Add Virtual Scrolling**
   - Use react-window for large lists
   - Render only visible items

3. **Add Caching**
   - React Query already caches for 5 minutes
   - Adjust staleTime if needed

## 🎯 Success Criteria

Before marking as complete, verify:

✅ **Build & Deploy**
- [ ] npm run build completes with no errors
- [ ] Production deployment successful
- [ ] VITE_API_URL points to production backend

✅ **Functionality**
- [ ] Login works
- [ ] Dashboard displays news stats
- [ ] News Feed page loads articles
- [ ] Search works
- [ ] Filter by token works
- [ ] Edit modal opens and saves
- [ ] Delete removes article
- [ ] Refresh fetches new articles

✅ **Data Integrity**
- [ ] Dates display correctly (not Unix timestamps)
- [ ] Sentiment badges show correct colors
- [ ] Ticker tags render properly
- [ ] Stats are accurate

✅ **UX**
- [ ] Loading states display during fetch
- [ ] Empty states show when no articles
- [ ] Confirmation dialog before delete
- [ ] Success feedback after mutations

✅ **Performance**
- [ ] Page loads in < 2 seconds
- [ ] API calls respond in < 500ms
- [ ] No console errors or warnings

## 📝 Post-Deployment Tasks

1. **Monitor Logs**
   - Check Railway logs for errors
   - Watch for failed API calls
   - Monitor database query performance

2. **User Feedback**
   - Test with real admin users
   - Gather feedback on UX
   - Note any edge cases

3. **Documentation**
   - Update team wiki with new features
   - Document common admin tasks
   - Create video tutorial if needed

4. **Future Enhancements**
   - Add bulk selection UI
   - Implement image upload/display
   - Add topic management
   - Create automated cache refresh (cron job)
   - Add export to CSV functionality

## 🆘 Support

If issues persist:

1. **Check Backend Logs**
   ```bash
   railway logs -f
   ```

2. **Check Database**
   ```sql
   SELECT * FROM news_cache LIMIT 5;
   SELECT COUNT(*) FROM news_cache;
   ```

3. **Verify Environment**
   - Backend: https://app.crypto-lifeguard.com
   - Admin Panel: YOUR_RAILWAY_URL
   - Database: PostgreSQL on Railway

4. **Contact**
   - Check NEWS_MANAGEMENT.md for API specs
   - Review server.js lines with admin news endpoints
   - Test endpoints directly with cURL

## ✨ Ready to Go!

The news management system is fully implemented and ready for testing. Once you verify everything works in your environment, you can start managing news articles directly from the admin panel!

**Next Steps:**
1. Test locally with `npm run dev`
2. Verify backend endpoints work
3. Deploy to production
4. Monitor for issues
5. Enjoy full editorial control! 🎉
