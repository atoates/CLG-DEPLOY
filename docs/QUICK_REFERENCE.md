# Quick Reference - News Management

## 🚀 Quick Start

### Local Testing (NOW)
```bash
# Server is running at: http://localhost:5173
# Just open your browser and test!
```

### Production Deploy
```bash
# 1. Update .env
VITE_API_URL=https://app.crypto-lifeguard.com

# 2. Build
npm run build

# 3. Deploy to Railway
railway up
```

## 📋 Feature Overview

| Feature | Endpoint | Status |
|---------|----------|--------|
| List articles | GET /admin/news/cache | ✅ |
| View stats | GET /admin/news/stats | ✅ |
| Edit article | PUT /admin/news/cache/:url | ✅ |
| Delete article | DELETE /admin/news/cache/:url | ✅ |
| Refresh cache | POST /admin/news/refresh | ✅ |
| Bulk delete | POST /admin/news/cache/bulk-delete | ✅ |

## 🎯 Key Files

```
src/
├── types/index.ts          # Type definitions
├── lib/api.ts              # API functions (7 new)
├── pages/
│   ├── NewsFeed.tsx        # News management UI
│   └── Dashboard.tsx       # Stats integration
├── components/Layout.tsx   # Navigation
└── App.tsx                 # Routes
```

## 🔧 API Functions

```typescript
// Import from: import { ... } from '../lib/api'

fetchNewsCache(params?)      // List articles
fetchNewsStats()             // Get statistics
updateNewsArticle(url, data) // Edit article
deleteNewsArticle(url)       // Delete article
refreshNewsCache()           // Fetch from CoinDesk
bulkDeleteNews(urls)         // Bulk delete
```

## 🗄️ Database Schema

```sql
news_cache (
  article_url TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  text TEXT,
  source_name TEXT,
  date BIGINT,              -- Unix timestamp (ms)
  sentiment TEXT,           -- positive|neutral|negative
  tickers JSONB,            -- ["BTC", "ETH"]
  topics JSONB,
  image_url TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP
)
```

## 🎨 UI Components

### Dashboard (`/`)
- News Articles stat card
- News Cache Statistics panel
- Top 10 tokens list

### News Feed (`/news`)
- Stats cards (4 metrics)
- Search bar
- Token filter
- Article list
- Edit modal
- Delete button
- Refresh button

## ⚙️ Environment Variables

```bash
# Required
VITE_API_URL=https://app.crypto-lifeguard.com

# Backend (CLG-DEPLOY)
ADMIN_TOKEN=your-secret-token
DATABASE_URL=postgresql://...
ADMIN_DASHBOARD_URL=https://your-admin-url.railway.app
```

## 🐛 Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| 401 Unauthorized | Check admin token, re-login |
| CORS error | Verify ADMIN_DASHBOARD_URL in backend |
| No articles | Run refresh cache |
| Dates showing as numbers | Backend needs ISO conversion |
| Build fails | Run `npm run build` and check errors |

## 📊 Testing Steps

1. Open http://localhost:5173
2. Login with admin credentials
3. Check dashboard stats
4. Go to News Feed
5. Test search, filter, edit, delete
6. Check console for errors

## 📚 Documentation

- **NEWS_MANAGEMENT.md** - Full technical documentation
- **TESTING_GUIDE.md** - Testing & deployment guide
- **VERIFICATION.md** - Implementation verification
- **IMPLEMENTATION_COMPLETE.md** - Summary & status

## ✅ Status

| Component | Status |
|-----------|--------|
| Frontend | ✅ Complete |
| Backend | ✅ Deployed |
| Database | ✅ Ready |
| Docs | ✅ Complete |
| Build | ✅ Success |
| Dev Server | ✅ Running |

## 🎉 You're Ready!

Everything is implemented and working. Test locally, then deploy to production when ready!

**Dev Server:** http://localhost:5173  
**Backend:** https://app.crypto-lifeguard.com  
**Status:** ✅ READY FOR TESTING
