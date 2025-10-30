# Logo Cache PostgreSQL Migration

## Overview
Migrated token logo caching from ephemeral filesystem storage to PostgreSQL to ensure logos persist across Railway deployments and restarts.

## Problem
- Railway uses ephemeral filesystem storage
- `DATA_DIR` (where logos were cached) is lost on every deployment/restart
- Logos had to be re-fetched from CoinGecko API after each deployment
- Potential for rate limiting and slow initial page loads

## Solution
Store logos as binary data (BYTEA) in PostgreSQL database, which is persistent across deployments.

## Changes Made

### 1. Database Migration (014_create_logo_cache_table.sql)
```sql
CREATE TABLE logo_cache (
  symbol TEXT PRIMARY KEY,
  image_data BYTEA NOT NULL,
  content_type TEXT NOT NULL,
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_logo_cache_updated_at ON logo_cache(updated_at);
```

### 2. Server-Side Functions (server.js)

**New PostgreSQL Functions:**
- `readFromDbCache(sym)` - Retrieves logo from database
  - Returns `{ buf, ct, age }` matching disk cache format
  - Returns null if not found
  
- `writeToDbCache(sym, buf, ct)` - Stores logo in database
  - Uses INSERT ... ON CONFLICT to upsert
  - Updates timestamp automatically

**Updated Functions:**
- `refreshLogoInBackground(sym)` - Now writes to PostgreSQL instead of disk
- `/api/logo/:symbol` endpoint - Checks PostgreSQL cache first

### 3. Caching Strategy

**Three-tier caching:**
1. **In-memory cache** (LRU, 1-year TTL) - Fastest, first check
2. **PostgreSQL cache** (permanent) - Second check, survives restarts
3. **External API fetch** (CoinGecko, LogoKit, GitHub) - Last resort

**Refresh logic:**
- Logos older than 30 days trigger background refresh
- Background refresh doesn't block API response
- Automatically updates PostgreSQL with fresh logo

## Deployment Checklist

### Pre-Deployment
- [x] Migration file created (014_create_logo_cache_table.sql)
- [x] Server.js updated to use PostgreSQL
- [x] Syntax check passed: `node -c server.js`
- [x] Committed to git

### Staging Deployment
- [ ] Push to `develop` branch
- [ ] Verify migration runs successfully
- [ ] Test logo endpoint: `curl https://clg-admin-staging.up.railway.app/api/logo/BTC`
- [ ] Check logos display on staging frontend
- [ ] Restart staging server and verify logos persist
- [ ] Check PostgreSQL table: `SELECT COUNT(*) FROM logo_cache;`

### Production Deployment
- [ ] Merge `develop` to `main`
- [ ] Push to production
- [ ] Monitor migration in Railway logs
- [ ] Test logo endpoint: `curl https://clg-admin-production.up.railway.app/api/logo/BTC`
- [ ] Verify logos display on app.crypto-lifeguard.com
- [ ] Check database size (logos are ~10-50KB each)

## Testing

### Local Testing
```bash
# Check migration syntax
psql -d crypto_lifeguard_dev -f apps/admin/migrations/014_create_logo_cache_table.sql

# Start server
npm run start

# Test logo endpoint
curl http://localhost:3003/api/logo/BTC -o btc.png
curl http://localhost:3003/api/logo/ETH -o eth.svg

# Check database
psql -d crypto_lifeguard_dev -c "SELECT symbol, content_type, updated_at FROM logo_cache;"
```

### Staging Testing
```bash
# Test logo endpoint
curl https://clg-admin-staging.up.railway.app/api/logo/BTC -o btc.png
curl https://clg-admin-staging.up.railway.app/api/logo/ETH -o eth.svg

# Check file size (should be >0)
ls -lh btc.png eth.svg

# Restart staging and verify logos still work
```

## Rollback Plan
If issues occur in production:

```bash
# Option 1: Revert commit
git revert HEAD
git push origin main

# Option 2: Drop table and redeploy previous version
# In Railway PostgreSQL:
DROP TABLE logo_cache;
# Then redeploy previous commit
```

## Performance Considerations

### Storage
- Average logo size: ~20KB
- 100 tokens = ~2MB
- 1000 tokens = ~20MB
- PostgreSQL has plenty of capacity

### Query Performance
- Primary key lookup on `symbol` = very fast (<1ms)
- In-memory cache prevents most DB queries
- Background refresh prevents blocking on old logos

### Network Savings
- Persistent cache eliminates re-fetching after deployments
- Reduces CoinGecko API calls (rate limit protection)
- Faster page loads for users

## Migration from Disk Cache (Optional)

If you want to migrate existing disk-cached logos to PostgreSQL:

```javascript
// Run this once on server startup or as a migration script
const fs = require('fs');
const path = require('path');

async function migrateDiskLogosToDb() {
  const cacheDir = process.env.DATA_DIR + '/logo-cache';
  if (!fs.existsSync(cacheDir)) return;
  
  const files = fs.readdirSync(cacheDir);
  for (const file of files) {
    const match = file.match(/^([A-Z0-9]+)\.(svg|png)$/);
    if (!match) continue;
    
    const [, symbol, ext] = match;
    const filePath = path.join(cacheDir, file);
    const buf = fs.readFileSync(filePath);
    const ct = ext === 'svg' ? 'image/svg+xml' : 'image/png';
    
    await writeToDbCache(symbol, buf, ct);
    console.log(`Migrated ${symbol} logo to PostgreSQL`);
  }
}
```

## Monitoring

### Things to Watch
- Database size growth (logos table)
- Logo endpoint response times
- CoinGecko API call frequency
- Error logs for database write failures

### Useful Queries
```sql
-- Count cached logos
SELECT COUNT(*) FROM logo_cache;

-- See most recently updated logos
SELECT symbol, content_type, updated_at 
FROM logo_cache 
ORDER BY updated_at DESC 
LIMIT 10;

-- Find logos older than 30 days
SELECT symbol, updated_at 
FROM logo_cache 
WHERE updated_at < NOW() - INTERVAL '30 days';

-- Check total storage used
SELECT pg_size_pretty(pg_total_relation_size('logo_cache'));
```

## Future Enhancements
- Add cleanup job for logos not accessed in 90+ days
- Implement logo versioning (track URL changes)
- Add logo quality/size preferences
- Batch logo refresh for all watchlist tokens
