# Admin Panel Development Task

## Overview
Build an admin panel for managing alerts and viewing system analytics for Crypto Lifeguard.

## Prerequisites
Before starting this task, understand how the existing systems work:

### News Caching System (Recently Implemented)

#### Database Schema
News articles are stored in the `news_cache` table in PostgreSQL:

```sql
CREATE TABLE news_cache (
  article_url TEXT PRIMARY KEY,           -- Unique URL for deduplication
  title TEXT NOT NULL,                    -- Article headline
  text TEXT,                              -- Article body/description
  source_name TEXT,                       -- Always 'CoinDesk' currently
  date BIGINT,                            -- Unix timestamp in milliseconds
  sentiment TEXT,                         -- 'positive', 'neutral', 'negative'
  tickers JSONB DEFAULT '[]'::jsonb,      -- Array of token symbols ["BTC", "ETH"]
  topics JSONB DEFAULT '[]'::jsonb,       -- Array of topics (future use)
  image_url TEXT,                         -- Article image (currently null)
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '120 days'),  -- Auto-expiry
  created_at TIMESTAMP DEFAULT NOW()      -- When cached
);

-- Indexes for performance
CREATE INDEX idx_news_cache_date ON news_cache(date DESC);
CREATE INDEX idx_news_cache_expires ON news_cache(expires_at);
CREATE INDEX idx_news_cache_tickers ON news_cache USING GIN (tickers);
```

#### How News Caching Works

**1. Data Flow:**
```
CoinDesk RSS Feed → Parse XML → Convert to Unix timestamp → PostgreSQL → Convert back to ISO → Frontend
```

**2. Recent Critical Fix (Oct 28, 2025):**
The `date` column is `BIGINT` (stores Unix timestamps in milliseconds), but our code was sending ISO datetime strings like `"2025-10-28T19:40:57.000Z"`. This caused PostgreSQL errors:
```
ERROR: invalid input syntax for type bigint: "2025-10-28T19:40:57.000Z"
```

**Fix implemented in `server.js` (lines ~1815-1845):**
```javascript
// BEFORE (Broken):
article.date || article.publishedAt  // ISO string

// AFTER (Fixed):
const dateValue = article.date || article.publishedAt;
const timestamp = dateValue ? new Date(dateValue).getTime() : Date.now();
// timestamp is now a number like 1730148057000
```

**3. When Reading from Database (lines ~1867-1879):**
```javascript
// Convert Unix timestamp back to ISO string for frontend
date: row.date ? new Date(row.date).toISOString() : new Date().toISOString()
```

**4. News Fetching Process:**
- Every API call to `/api/news` fetches fresh articles from CoinDesk RSS
- Articles are inserted into `news_cache` with `ON CONFLICT (article_url) DO UPDATE`
- This updates `expires_at` to extend cache lifetime by 120 days
- All cached articles (including fresh ones) are returned to frontend
- Old articles automatically expire after 120 days

**5. CoinDesk RSS Integration:**
- Free, public RSS feed (no API key required)
- URL: `https://www.coindesk.com/arc/outboundfeeds/rss/`
- **Critical**: Feed redirects, must use `redirect: 'follow'` in fetch options
- Fetches ~25 articles per request
- Filters by token mentions (BTC, ETH, SOL, etc.)

### Alerts System

#### Database Schema
```sql
CREATE TABLE alerts (
  id SERIAL PRIMARY KEY,
  token TEXT NOT NULL,                    -- e.g., 'BTC', 'ETH', 'SOL'
  title TEXT NOT NULL,                    -- Alert headline
  body TEXT,                              -- Alert description
  severity TEXT NOT NULL,                 -- 'critical', 'warning', 'info'
  tags JSONB DEFAULT '[]'::jsonb,         -- Array of tags ["hack", "exploit"]
  deadline TIMESTAMP,                     -- Optional deadline for action
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Current Status:**
- **144 total alerts** in production
- 116 original alerts
- 28 new research-based alerts added Oct 28, 2025
- Covers: Bitcoin, Ethereum, Solana, DeFi, Layer 2s, Privacy coins, Stablecoins

**Default Tags by Severity:**
- Critical: `["hack", "exploit"]`
- Warning: `["community", "migration"]`
- Info: `["community", "news"]`

## Admin Panel Requirements

### 1. Authentication
- Use existing `ADMIN_TOKEN` environment variable
- Middleware: `requireAdmin` (already exists in server.js line ~621)
- Cookie-based session (same as user auth)

### 2. Admin Panel Pages

#### A. Dashboard (`/admin`)
**Metrics to display:**
- Total alerts: 144
- Alerts by severity (Critical/Warning/Info)
- Total news articles cached
- News cache hit rate
- Active users (from user_prefs table)
- Recent activity log

**API Endpoints Needed:**
```javascript
GET /admin/stats
Response: {
  alerts: {
    total: 144,
    critical: 45,
    warning: 60,
    info: 39,
    byToken: { BTC: 24, ETH: 31, ... }
  },
  news: {
    totalCached: 150,
    freshToday: 25,
    expiringIn7Days: 10,
    topSources: [{ name: 'CoinDesk', count: 150 }]
  },
  users: {
    total: 1234,
    activeToday: 45,
    watchlistTokens: { BTC: 890, ETH: 756, ... }
  }
}
```

#### B. Alert Management (`/admin/alerts`)
**Features:**
- List all alerts with filtering (token, severity, tags)
- Create new alert (form)
- Edit existing alert
- Delete alert
- Bulk operations (delete multiple, change severity)

**Form Fields:**
- Token (autocomplete with existing tokens)
- Title (required)
- Body (markdown supported)
- Severity (dropdown: critical/warning/info)
- Tags (multi-select with suggestions)
- Deadline (optional date picker)

**API Endpoints Needed:**
```javascript
GET /admin/alerts?token=BTC&severity=critical&page=1
POST /admin/alerts
PUT /admin/alerts/:id
DELETE /admin/alerts/:id
DELETE /admin/alerts/bulk  // body: { ids: [1, 2, 3] }
```

#### C. News Cache Management (`/admin/news`)
**Features:**
- View cached news articles
- Filter by token, date range, source
- Manually delete stale articles
- Force refresh from CoinDesk RSS
- View cache statistics

**Metrics to Show:**
- Total cached articles
- Articles by token
- Cache hit/miss ratio
- Average cache age
- Storage used (estimate: ~500 bytes per article)

**API Endpoints Needed:**
```javascript
GET /admin/news/cache?token=BTC&days=7
DELETE /admin/news/cache/:article_url
POST /admin/news/refresh  // Force fetch fresh articles
GET /admin/news/stats
```

#### D. User Analytics (`/admin/users`)
**Features:**
- View user activity
- Popular tokens in watchlists
- Summary generation usage
- News consumption patterns

**API Endpoints Needed:**
```javascript
GET /admin/users/stats
Response: {
  totalUsers: 1234,
  watchlists: {
    avgTokens: 5.3,
    popular: [
      { token: 'BTC', users: 890 },
      { token: 'ETH', users: 756 }
    ]
  },
  summaries: {
    totalGenerated: 4567,
    byModel: { openai: 3000, anthropic: 1200, xai: 367 }
  }
}
```

### 3. Technical Implementation

#### Frontend Structure
```
admin/
├── index.html          # Dashboard
├── alerts.html         # Alert management
├── news.html           # News cache management
├── users.html          # User analytics
├── admin.js            # Shared admin logic
└── admin.css           # Admin styling
```

#### Backend Routes (add to server.js)
```javascript
// Admin authentication middleware (already exists)
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || req.cookies.admin_token;
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Admin routes
app.get('/admin/stats', requireAdmin, async (req, res) => { /* ... */ });
app.get('/admin/alerts', requireAdmin, async (req, res) => { /* ... */ });
app.post('/admin/alerts', requireAdmin, async (req, res) => { /* ... */ });
app.put('/admin/alerts/:id', requireAdmin, async (req, res) => { /* ... */ });
app.delete('/admin/alerts/:id', requireAdmin, async (req, res) => { /* ... */ });
app.get('/admin/news/cache', requireAdmin, async (req, res) => { /* ... */ });
app.post('/admin/news/refresh', requireAdmin, async (req, res) => { /* ... */ });
app.get('/admin/users/stats', requireAdmin, async (req, res) => { /* ... */ });
```

### 4. Database Queries You'll Need

#### News Cache Statistics
```javascript
// Total cached articles
const total = await pool.query(`
  SELECT COUNT(*) FROM news_cache WHERE expires_at > NOW()
`);

// Articles by token
const byToken = await pool.query(`
  SELECT 
    jsonb_array_elements_text(tickers) as token,
    COUNT(*) as count
  FROM news_cache 
  WHERE expires_at > NOW()
  GROUP BY token
  ORDER BY count DESC
`);

// Cache age distribution
const ageStats = await pool.query(`
  SELECT 
    COUNT(*) as total,
    AVG(EXTRACT(EPOCH FROM (NOW() - created_at))) as avg_age_seconds
  FROM news_cache 
  WHERE expires_at > NOW()
`);

// Articles expiring soon
const expiring = await pool.query(`
  SELECT COUNT(*) FROM news_cache 
  WHERE expires_at > NOW() 
  AND expires_at < NOW() + INTERVAL '7 days'
`);
```

#### Alert Statistics
```javascript
// Alerts by severity
const severity = await pool.query(`
  SELECT severity, COUNT(*) as count 
  FROM alerts 
  GROUP BY severity
`);

// Alerts by token
const byToken = await pool.query(`
  SELECT token, COUNT(*) as count 
  FROM alerts 
  GROUP BY token 
  ORDER BY count DESC
`);

// Recent alerts
const recent = await pool.query(`
  SELECT * FROM alerts 
  ORDER BY created_at DESC 
  LIMIT 10
`);
```

#### User Statistics
```javascript
// Total users
const total = await pool.query(`SELECT COUNT(*) FROM users`);

// Watchlist statistics
const watchlists = await pool.query(`
  SELECT 
    jsonb_array_elements_text(
      COALESCE(preferences->>'watchlist', '[]')::jsonb
    ) as token,
    COUNT(*) as user_count
  FROM user_prefs
  GROUP BY token
  ORDER BY user_count DESC
`);

// Summary generation stats
const summaries = await pool.query(`
  SELECT 
    model,
    COUNT(*) as count
  FROM user_summaries
  GROUP BY model
`);
```

### 5. UI/UX Guidelines

**Design System:**
- Use existing Crypto Lifeguard styles from `styles.css`
- Maintain consistent color scheme:
  - Critical: `#E63946` (red)
  - Warning: `#F77F00` (orange)
  - Info: `#1D3557` (blue)
- Use same fonts: Anton (headings), Poppins (body)

**Component Library:**
- Reuse `.card`, `.btn`, `.input` classes from existing app
- Add admin-specific classes prefixed with `.admin-`
- Mobile-responsive (use same breakpoints as main app)

**Navigation:**
- Top navbar with admin menu
- Links: Dashboard | Alerts | News | Users | Logout
- Visual indicator for current page

### 6. Security Considerations

**Critical:**
- All admin routes MUST use `requireAdmin` middleware
- Never expose `ADMIN_TOKEN` in frontend code
- Admin pages should require token in cookie or header
- Validate all inputs (token symbols, dates, tags)
- Sanitize HTML in alert bodies (use DOMPurify or similar)
- Rate limit admin endpoints (max 100 req/min per token)

**CSRF Protection:**
- Use SameSite=Strict for admin cookies
- Include CSRF token in forms

### 7. Testing Checklist

**Before Deployment:**
- [ ] Test all CRUD operations on alerts
- [ ] Verify admin authentication works
- [ ] Test pagination for large datasets
- [ ] Verify news cache refresh works
- [ ] Test bulk operations (delete multiple alerts)
- [ ] Check mobile responsiveness
- [ ] Verify no admin routes accessible without token
- [ ] Test with production data (144 alerts)
- [ ] Verify CORS doesn't block admin API calls

**Edge Cases:**
- [ ] Empty states (no alerts, no news cache)
- [ ] Very long alert titles/bodies
- [ ] Invalid date formats
- [ ] Malformed JSON in tags/tickers
- [ ] Expired news articles
- [ ] Non-existent token symbols

### 8. Deployment Process

**Follow strict deployment checklist:**
1. Develop on `develop` branch
2. Test locally with production database snapshot
3. Deploy to staging environment
4. Run full test suite on staging
5. Get approval before merging to `main`
6. Deploy to production
7. Run smoke tests (see `scripts/smoke-test.sh`)
8. Monitor logs for 30 minutes post-deployment

**Migration Required:**
None - admin panel uses existing tables. But if you add admin-specific tables:
```bash
# Create migration file
touch migrations/009_create_admin_logs.sql
# Add migration, test, then run
npm run migrate
```

### 9. Environment Variables

**Required:**
- `ADMIN_TOKEN` - Already exists in production
- `DATABASE_URL` - PostgreSQL connection string (already exists)

**Optional:**
- `ADMIN_SESSION_SECRET` - For signing admin cookies (add if implementing sessions)

### 10. Recent Changes Summary (for context)

**Oct 28, 2025 - News Caching Implementation:**
1. **Added news_cache table** via migration 008
2. **Fixed critical bug**: Date column type mismatch
   - Problem: BIGINT column receiving ISO strings
   - Solution: Convert ISO → Unix timestamp on INSERT, Unix → ISO on SELECT
3. **Implemented CoinDesk RSS integration**
   - Free public feed, no API key
   - Requires `redirect: 'follow'` in fetch
4. **Added 28 new research-based alerts** (Bitcoin, Ethereum, Solana, DeFi, L2s)
5. **Total alerts now: 144** (was 116)

**Key Files Modified:**
- `server.js` - News endpoints, timestamp conversion, duplicate endpoint removal
- `migrations/008_recreate_summaries_and_news.sql` - Created news_cache and user_summaries tables
- `add-production-alerts.js` - Script with 28 new alerts

## Questions?

If anything is unclear about:
- News caching timestamp conversion
- Alert schema and tags
- Database queries
- Authentication flow

Refer to:
- `server.js` lines 1795-1900 (News caching logic)
- `server.js` lines 2347-2430 (CoinDesk RSS fetching)
- `migrations/008_recreate_summaries_and_news.sql` (Table schemas)
- `DEPLOYMENT.md` (Deployment checklist and safety rules)
- `.github/copilot-instructions.md` (Project architecture overview)

Good luck! 🚀
