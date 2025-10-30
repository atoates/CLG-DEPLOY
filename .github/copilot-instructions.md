# Crypto Lifeguard - AI Development Guide# Crypto Lifeguard - AI Development Guide



## Project Overview## Project Overview

Crypto Lifeguard is a web application for tracking crypto token alerts with severity levels and deadlines. The project consists of:

Crypto Lifeguard is a cryptocurrency alert tracking and news aggregation platform with AI-powered summaries. The monorepo contains:- Express.js backend with SQLite database (`server.js`)

- Vite-based frontend (`src/` directory)

- **Admin Backend + Dashboard** (`apps/admin/`) - Express.js API + React admin panel- Database migrations and management scripts

- **Frontend App** (`apps/frontend/`) - Vanilla JavaScript SPA for end users

- **PostgreSQL Database** - Railway-hosted, shared between services## Key Architecture Components



## Current Architecture (October 2025)### Data Layer

- SQLite database using `better-sqlite3` with WAL journaling mode

### Technology Stack- Core tables:

  - `alerts`: Main alert data with severity and tags

**Backend (apps/admin/server.js):**  - `users`: User identities

- Express.js 4.x  - `user_prefs`: User preferences including watchlists

- PostgreSQL with `pg` library (NOT SQLite)- Alert severity levels: 'critical', 'warning', 'info' with associated default tags

- Environment-based logging system (`LOG_LEVEL` env var)- Tags stored as JSON string arrays

- Node.js 18+

### Backend (server.js)

**Admin Dashboard (apps/admin/src/):**- Express server with environment-configurable paths:

- React 18 + TypeScript  - `DATA_DIR`: Base directory for data storage (default: './data')

- Vite build system  - `DATABASE_PATH`: SQLite database location

- TanStack Query for data fetching  - `BACKUP_DIR`: Backup storage location

- TailwindCSS + shadcn/ui components  - `CMC_API_KEY`: For CoinMarketCap market data integration

- Recharts for data visualization  - `NEWSAPI_KEY`: For CryptoNews API integration (fallback news source)

  - **CoinDesk RSS**: Free public RSS feed for crypto news (no API key required - primary news source)

**Frontend App (apps/frontend/):**

- Vanilla JavaScript (no framework)### API Endpoints

- Vite for development and building- `/api/me`: User preferences and watchlist management

- CSS with custom responsive design  - GET: Retrieves user preferences with defaults

- LocalStorage for user preferences  - PUT: Updates preferences (watchlist, severity filters, dismissed items)

- `/api/alerts`: Alert management

### Database (PostgreSQL)  - GET: Filtered alerts based on user preferences

  - POST: Create new alerts (requires admin token)

**Connection:**

```javascript### Authentication

const pool = new Pool({- Anonymous users identified by cookie-based UIDs

  connectionString: DATABASE_URL,- Admin operations protected by `ADMIN_TOKEN` environment variable

  ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }- Cookie settings: HTTPOnly, SameSite=Lax, 1-year expiry

});

```## Development Workflow



**Core Tables (14 migrations):**### Local Development

1. `alerts` - Token alerts with severity, tags, deadlines```bash

2. `users` - User identities (cookie-based)# Start development server with hot reload

3. `user_prefs` - Watchlists, filters, dismissed items (JSON columns)npm run dev

4. `user_summaries` - AI-generated weekly summaries

5. `news_cache` - Cached news articles (120-day retention)# Build for production

6. `news_feeds` - Configurable RSS feed sourcesnpm run build

7. `api_call_tracking` - External API usage monitoring

8. `logo_cache` - Persistent token logo storage (BYTEA binary data)# Start production server (runs migrations, restores alerts, updates tags)

npm run start

**Migration System:**```

- Files: `apps/admin/migrations/001_*.sql` through `014_*.sql`

- Auto-run on server startup via `initDB()` function### Database Management

- Track applied migrations in `schema_migrations` table```bash

# Run migrations

### API Endpoints Structurenpm run migrate



**Public API (User-facing):**# Backup database 

```javascriptnpm run backup   # Creates timestamped backup in BACKUP_DIR

GET  /api/alerts              // Filtered alerts based on user prefs

GET  /api/news                // News with token filtering# Update alert tags

POST /api/summary             // AI-generated weekly summarynpm run update-tags

GET  /api/ticker-prices       // CoinMarketCap market data```

GET  /api/logo/:symbol        // Token logos (PostgreSQL cached)

GET  /api/me                  // User preferences### Deployment

PUT  /api/me                  // Update preferences- Production deployment via Railway.app

```- **CRITICAL**: All changes MUST go through staging first

  - `develop` branch → staging environment

**Admin API (Protected by ADMIN_TOKEN):**  - `main` branch → production environment

```javascript- Procfile defines startup sequence:

POST   /admin/alerts          // Create new alert  1. Run migrations

GET    /admin/news/cache      // News cache management  2. Restore alerts from backup

PUT    /admin/news/cache/:url // Edit article  3. Update tags

DELETE /admin/news/cache/:url // Delete article  4. Start server

POST   /admin/news/refresh    // Force refresh from RSS- See `DEPLOYMENT.md` for full deployment checklist

GET    /admin/news/stats      // Statistics

GET    /admin/api-stats       // API usage tracking## Deployment Safety Rules

GET    /admin/news/feeds      // CRUD for news feeds

```### ⚠️ NEVER Deploy Directly to Production

1. All changes go to `develop` branch first

### Environment-Based Logging System2. Test on staging: https://clg-staging.up.railway.app

3. Only merge to `main` after staging verification

**CRITICAL: Production uses minimal logging**4. Run smoke tests after production deployment



```javascript### CORS Configuration Rules

const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.RAILWAY_ENVIRONMENT ? 'error' : 'debug');**CRITICAL**: CORS must NEVER be applied globally with `app.use(cors())`



const log = {✅ **Correct** - Scoped CORS:

  error: (...args) => console.error(...args),           // Always logged```javascript

  warn: (...args) => ['warn', 'info', 'debug'].includes(LOG_LEVEL) && console.warn(...args),app.use('/api', cors(corsOptions));

  info: (...args) => ['info', 'debug'].includes(LOG_LEVEL) && console.log(...args),app.use('/auth', cors(corsOptions));

  debug: (...args) => LOG_LEVEL === 'debug' && console.log(...args)app.use('/admin', cors(corsOptions));

};```

```

❌ **Wrong** - Global CORS breaks static assets:

**Usage:**```javascript

- Production (Railway): `LOG_LEVEL=error` (default) - errors onlyapp.use(cors(corsOptions)); // DON'T DO THIS

- Development: `LOG_LEVEL=debug` - full verbose logging```

- Use `log.debug()` for success messages, `log.error()` for actual errors

**Why**: Global CORS interferes with static file serving (JS/CSS/images) and causes 500 errors

### Key Features & Implementation

### Pre-Deployment Checklist

#### 1. Logo Caching (PostgreSQL)- [ ] Changes tested locally with `npm run dev`

```javascript- [ ] Build succeeds: `npm run build`

// Three-tier caching system- [ ] Syntax check passes: `node -c server.js`

async function readFromDbCache(sym) {- [ ] Deployed to staging and tested

  const result = await pool.query(- [ ] No CORS errors in browser console

    'SELECT image_data, content_type, updated_at FROM logo_cache WHERE symbol = $1',- [ ] Static assets load correctly (check Network tab)

    [sym]- [ ] All core features work (alerts, news, summary, market data)

  );

  // Returns { buf: Buffer, ct: string, age: number }### Post-Deployment Verification

}After pushing to `main`:

```bash

// Logos stored as BYTEA in PostgreSQL (not filesystem)# Wait 2-3 minutes for deployment

// Persists across Railway deployments# Run smoke tests

// Background refresh for logos >30 days old./scripts/smoke-test.sh

```

# Or manual checks

#### 2. News Aggregationcurl https://app.crypto-lifeguard.com/healthz

```javascript# Visit site and check browser console for errors

// Primary: CoinDesk RSS (free, no API key)```

async function fetchNewsFromCoinDesk(tokens) {

  // Fetches from https://www.coindesk.com/arc/outboundfeeds/rss/### Rollback Procedure

  // Scheduled refresh every 5 minutesIf production breaks:

  // Cached in PostgreSQL for 120 days```bash

}git checkout main

git revert HEAD

// Fallback: CryptoNews API (requires NEWSAPI_KEY)git push origin main

// Articles stored with sentiment, tickers, topics```

```

## Project Conventions

#### 3. AI Features

```javascript### Alert Severity Levels

// Support for 3 AI providers:- 🚨 Critical: Default tags: ["hack", "exploit"]

// - OpenAI GPT-4o (OPENAI_API_KEY)- ⚠️ Warning: Default tags: ["community", "migration"]

// - Anthropic Claude 3.5 (ANTHROPIC_API_KEY)  - 🛟 Info: Default tags: ["community", "news"]

// - xAI Grok-2 (XAI_API_KEY)

### Data Validation

// Token usage tracked in api_call_tracking table- Tags are always stored as JSON string arrays

async function trackAPICall(serviceName, endpoint) {- Invalid tag formats are converted to empty arrays (`[]`)

  await pool.query(`INSERT INTO api_call_tracking ...`);- Token symbols follow A-Z/0-9 format validation

}- User preferences (watchlist, dismissed items) stored as JSON strings in database

```

### Database Operations

#### 4. Alert System- Uses WAL journaling mode for concurrent access

```javascript- Backups performed using VACUUM INTO when available

// Severity levels: 'critical', 'warning', 'info'- Fallback to file copy for older SQLite versions

// Tags: JSON array stored as TEXT- Transactions wrap critical operations

// Deadlines: Unix timestamps

// User filtering: By token watchlist + severity preferences## Integration Points

```- CoinMarketCap API integration for cryptocurrency market data and logos

- **CoinDesk RSS feed** for cryptocurrency news (free, public - primary news source)

### CORS Configuration- CryptoNews API integration for news (fallback source, requires API key)

- Local storage for persisting user token selections in browser

**⚠️ CRITICAL: NEVER apply CORS globally**- SQLite WAL mode enables concurrent read/write operations

- Railway.app deployment integration

```javascript

// ✅ CORRECT - Scoped to API routes only## Error Handling

app.use('/api', cors(corsOptions));- Database operations use transactions for data integrity

app.use('/auth', cors(corsOptions));- Tag parsing includes fallback to empty array on invalid JSON

app.use('/admin', cors(corsOptions));- Environment variables include sensible defaults for local development

- Database backup includes fallback mechanisms

// ❌ WRONG - Breaks static file serving- Safe JSON read/write operations with fallback values

app.use(cors(corsOptions)); // NEVER DO THIS

```For questions or clarifications about these patterns, check implementations in `server.js` and migration files.

**Why:** Global CORS interferes with static assets (JS/CSS/images) causing 500 errors and MIME type issues.

### Deployment (Railway)

**Two Services from One Monorepo:**

1. **Admin Service (clg-admin-production)**
   - Path: `apps/admin/`
   - Build: `npm install && npm run build`
   - Start: `npm run start`
   - Runs migrations automatically
   - URL: https://clg-admin-production.up.railway.app

2. **Frontend Service (CLG-DEPLOY)**
   - Path: `apps/frontend/`
   - Build: `npm install && npm run build`
   - Start: `node serve-spa.js`
   - URL: https://app.crypto-lifeguard.com

**Environment Variables (Admin Service):**
```
DATABASE_URL=postgresql://... (auto from Railway PostgreSQL)
ADMIN_TOKEN=secret
LOG_LEVEL=error
CMC_API_KEY=...
COINGECKO_API_KEY=...
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
XAI_API_KEY=xai-...
FRONTEND_URL=https://app.crypto-lifeguard.com
```

**Environment Variables (Frontend Service):**
```
BACKEND_URL=https://clg-admin-production.up.railway.app
```

### Development Workflow

**⚠️ CRITICAL: Never push directly to main**

```bash
# 1. Work on develop branch
git checkout develop
git add .
git commit -m "feat: description"
git push origin develop

# 2. Test on staging
# URL: https://clg-staging.up.railway.app

# 3. After staging verification
git checkout main
git merge develop
git push origin main

# 4. Verify production
curl https://clg-admin-production.up.railway.app/healthz
```

### Pre-Deployment Checklist

- [ ] Changes tested locally: `npm run dev`
- [ ] Build succeeds: `npm run build`
- [ ] Syntax check: `node -c apps/admin/server.js`
- [ ] Deployed to staging and tested
- [ ] No CORS errors in browser console
- [ ] Static assets load (check Network tab)
- [ ] Core features work: alerts, news, summaries, market data

### Post-Deployment Verification

```bash
# Health check
curl https://clg-admin-production.up.railway.app/healthz

# Logo verification
./scripts/verify-logo-migration.sh

# Manual checks
# - Visit https://app.crypto-lifeguard.com
# - Open browser DevTools console
# - Add token, view alerts, generate summary
# - Check for errors
```

### Common Patterns

#### Database Queries
```javascript
// Always use parameterized queries
await pool.query('SELECT * FROM alerts WHERE token = $1', [token]);

// JSON columns
const tags = JSON.stringify(['hack', 'exploit']);
await pool.query('UPDATE alerts SET tags = $1 WHERE id = $2', [tags, id]);

// Timestamps
const expiresAt = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);
```

#### Error Handling
```javascript
// Use try/catch with appropriate logging level
try {
  const result = await someOperation();
  log.debug('Operation succeeded:', result);
} catch (error) {
  log.error('Critical error:', error.message);
  throw error;
}
```

#### API Response Format
```javascript
// Success
res.json({ data: result, success: true });

// Error
res.status(400).json({ error: 'Message', success: false });
```

### Authentication

**User Auth:**
- Cookie-based anonymous users
- UID cookie: `user_${randomUUID()}`
- HTTPOnly, SameSite=Lax, 1-year expiry

**Admin Auth:**
- Bearer token in Authorization header
- Environment variable: `ADMIN_TOKEN`
- Middleware: `requireAdminToken()`

### File Organization

```
apps/admin/
├── server.js              # Main Express server (4200+ lines)
├── migrations/            # PostgreSQL migrations (001-014)
├── src/
│   ├── App.tsx           # React admin app root
│   ├── pages/            # Dashboard, Settings, etc.
│   ├── components/       # Reusable UI components
│   └── lib/
│       └── api.ts        # Axios API client
├── public/               # Static assets
└── package.json

apps/frontend/
├── src/
│   ├── app.js           # Main app logic
│   ├── styles.css       # Responsive CSS
│   └── config.js        # BACKEND_URL configuration
├── index.html           # Main page
├── create.html          # Alert creation (admin)
├── profile.html         # User preferences
└── serve-spa.js         # Production server
```

### Performance Optimizations

**Caching Layers:**
1. In-memory LRU cache (logos, API responses)
2. PostgreSQL cache (news, logos)
3. Browser cache (static assets, 86400s)

**Background Tasks:**
- News refresh every 5 minutes
- Logo refresh for old entries (>30 days)
- Expired article cleanup (>120 days)

### Troubleshooting

**Database Issues:**
- Check `DATABASE_URL` is set
- Verify SSL config for Railway
- Run migrations: `cd apps/admin && npm run migrate`

**CORS Errors:**
- Ensure CORS only on `/api`, `/auth`, `/admin`
- Check `FRONTEND_URL` matches actual frontend URL
- Verify origin in allowed list

**Missing Logos:**
- Check `logo_cache` table exists (migration 014)
- Verify `COINGECKO_API_KEY` is set
- Check PostgreSQL permissions for BYTEA columns

**News Not Loading:**
- Verify `news_cache` table exists (migration 006)
- Check CoinDesk RSS is accessible
- Look for scheduled fetch errors in logs

### Code Quality Standards

**Logging:**
- Use `log.debug()` for routine operations
- Use `log.warn()` for recoverable failures
- Use `log.error()` for critical failures
- Production should have minimal log output

**Database:**
- Always use parameterized queries ($1, $2, etc.)
- Handle JSON parsing with try/catch
- Use transactions for multi-step operations
- Index frequently queried columns

**API Design:**
- RESTful endpoints
- Consistent error responses
- Validate input parameters
- Return appropriate HTTP status codes

### Recent Changes (Oct 2025)

✅ **Logo Cache Migration** - Moved from ephemeral filesystem to PostgreSQL BYTEA
✅ **Logging System** - Added environment-based LOG_LEVEL with production defaults
✅ **News Feeds** - Made RSS feed sources configurable via admin dashboard
✅ **API Tracking** - Monitor external API usage (CoinGecko, CMC, AI services)

### Documentation

- `docs/README.md` - Comprehensive project overview
- `docs/DEPLOYMENT.md` - Deployment procedures
- `docs/LOGO_CACHE_POSTGRESQL_MIGRATION.md` - Logo caching architecture
- `CODE_REVIEW.md` - Logging cleanup status

For questions about architecture, check the actual implementation in `apps/admin/server.js` or the documentation files.
