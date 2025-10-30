# News Cache System - Implementation Guide

## Table of Contents
1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [Recent Changes & Fixes](#recent-changes--fixes)
4. [Backend API Endpoints](#backend-api-endpoints)
5. [Data Flow](#data-flow)
6. [Admin Panel Integration](#admin-panel-integration)
7. [Critical Implementation Details](#critical-implementation-details)
8. [Testing Guide](#testing-guide)

---

## Overview

The Crypto Lifeguard news system caches cryptocurrency news articles from **CoinDesk RSS feed** (free, public) into a PostgreSQL database. This provides:
- **Fast page loads** - No external API calls on every request
- **Editorial control** - Admins can edit/delete articles via admin panel
- **Offline resilience** - News available even if external source is down
- **No rate limits** - No API quotas or costs
- **Custom tagging** - Manual sentiment and ticker associations

### Architecture
```
CoinDesk RSS Feed → Backend Fetcher → PostgreSQL (news_cache) → API → Admin Panel
                                                                  ↓
                                                            Frontend (News Tab)
```

---

## Database Schema

### Table: `news_cache`
Created in migration `008_recreate_summaries_and_news.sql`

```sql
CREATE TABLE IF NOT EXISTS news_cache (
  article_url TEXT PRIMARY KEY,              -- Unique article URL
  title TEXT NOT NULL,                       -- Article headline
  text TEXT,                                 -- Article content/description
  source_name TEXT,                          -- Always "CoinDesk" currently
  date BIGINT,                               -- ⚠️ Unix timestamp in MILLISECONDS
  sentiment TEXT,                            -- 'positive', 'neutral', 'negative'
  tickers JSONB DEFAULT '[]'::jsonb,        -- ["BTC", "ETH", "SOL"]
  topics JSONB DEFAULT '[]'::jsonb,         -- Reserved for future use
  image_url TEXT,                            -- Article image (usually null)
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '120 days'),  -- Auto-cleanup
  created_at TIMESTAMP DEFAULT NOW()         -- When cached
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_news_cache_date ON news_cache(date DESC);
CREATE INDEX IF NOT EXISTS idx_news_cache_expires ON news_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_news_cache_tickers ON news_cache USING GIN (tickers);
```

### Key Schema Notes

#### ⚠️ Date Column - CRITICAL
The `date` column is **BIGINT** storing Unix timestamps in **milliseconds**, NOT ISO datetime strings.

**Why BIGINT?**
- Efficient sorting and comparison
- Compact storage (8 bytes vs ~25 bytes for strings)
- Standard Unix timestamp format

**Conversion Required:**
```javascript
// INSERT: Convert ISO string → Unix timestamp (milliseconds)
const timestamp = new Date("2025-10-28T19:40:57.000Z").getTime();  // 1730142057000

// SELECT: Convert Unix timestamp → ISO string
const isoDate = new Date(1730142057000).toISOString();  // "2025-10-28T19:40:57.000Z"
```

#### Tickers JSONB
- Array of token symbols: `["BTC", "ETH", "SOL"]`
- GIN index enables fast filtering: `WHERE tickers @> '["BTC"]'`
- Must be valid JSON when inserting: `JSON.stringify(["BTC"])`
- Must be parsed when reading: `JSON.parse(row.tickers)`

---

## Recent Changes & Fixes

### October 28, 2025 - Critical Fixes

#### 1. ✅ Date Type Mismatch Fixed (Commit: 2017d89)
**Problem:**
```
ERROR: invalid input syntax for type bigint: "2025-10-28T19:40:57.000Z"
```
All 25 articles failing to cache because we were sending ISO strings to BIGINT column.

**Solution:**
```javascript
// BEFORE (❌ WRONG)
await pool.query(`INSERT INTO news_cache (date, ...) VALUES ($1, ...)`, [
  article.date || article.publishedAt  // ISO string "2025-10-28T19:40:57.000Z"
]);

// AFTER (✅ CORRECT)
const dateValue = article.date || article.publishedAt;
const timestamp = dateValue ? new Date(dateValue).getTime() : Date.now();
await pool.query(`INSERT INTO news_cache (date, ...) VALUES ($1, ...)`, [
  timestamp  // Unix timestamp 1730142057000
]);
```

**Result:** 0/25 articles caching → **25/25 articles caching successfully** ✅

#### 2. ✅ Redirect Following Added (Commit: 375b304, 0ef3a58)
**Problem:**
CoinDesk RSS feed redirects before serving content. Node.js `fetch()` wasn't following redirects by default.

**Solution:**
```javascript
// Added redirect: 'follow' option
const response = await fetch('https://www.coindesk.com/arc/outboundfeeds/rss/', {
  headers: {
    'User-Agent': 'CryptoLifeguard/1.0'
  },
  redirect: 'follow'  // ← Added this
});
```

#### 3. ✅ Duplicate Endpoint Removed (Commit: 0ef3a58)
**Problem:**
Two `/api/news` POST endpoints existed:
- Line 1795: Correct version with caching
- Line 1976: Old duplicate without caching (overriding the correct one)

**Solution:**
Removed the duplicate at line 1976. Kept only the database-integrated version.

#### 4. ✅ Enhanced Logging (Commit: 63786f4, a61f742)
Added detailed logging to diagnose issues:
```javascript
console.log('[News] Fetching CoinDesk RSS feed...');
console.log(`[News] CoinDesk RSS response status: ${response.status}`);
console.log(`[News] CoinDesk RSS response length: ${xmlText.length} bytes`);
console.log(`[News] CoinDesk RSS: fetched ${articles.length} articles`);
console.error('[News API] Failed to cache article:', title, 'Error:', error.message);
```

---

## Backend API Endpoints

### 1. GET `/api/news` (Public - Already Implemented)
Fetch cached news articles for specific tokens.

**Request:**
```bash
POST /api/news
Content-Type: application/json

{
  "tokens": ["BTC", "ETH", "SOL"]
}
```

**Response:**
```json
{
  "news": [
    {
      "title": "Bitcoin Hits New High",
      "text": "Full article content...",
      "source_name": "CoinDesk",
      "date": "2025-10-28T19:40:57.000Z",
      "sentiment": "positive",
      "tickers": ["BTC"],
      "topics": [],
      "news_url": "https://www.coindesk.com/...",
      "image_url": null
    }
  ],
  "cached": false,
  "freshArticlesAdded": 10,
  "timestamp": "2025-10-28T21:00:00.000Z"
}
```

**Current Implementation:** `server.js` lines 1795-1900

### 2. GET `/admin/news/cache` ⚠️ NEEDS IMPLEMENTATION
Fetch cached news with filters (for admin panel).

**Request:**
```bash
GET /admin/news/cache?token=BTC&days=7&page=1&limit=50
Authorization: Bearer <admin_token>
```

**Query Parameters:**
- `token` (optional): Filter by ticker symbol
- `days` (optional): Only articles from last N days
- `page` (optional): Pagination page number (default: 1)
- `limit` (optional): Results per page (default: 50)

**Implementation Guide:**
```javascript
app.get('/admin/news/cache', requireAdmin, async (req, res) => {
  const { token, days, page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;
  
  let query = `
    SELECT article_url, title, text, source_name, date, 
           sentiment, tickers, topics, image_url, 
           expires_at, created_at
    FROM news_cache
    WHERE expires_at > NOW()
  `;
  const params = [];
  
  // Filter by token
  if (token) {
    params.push(JSON.stringify([token]));
    query += ` AND tickers @> $${params.length}::jsonb`;
  }
  
  // Filter by days
  if (days) {
    const cutoffDate = Date.now() - (days * 24 * 60 * 60 * 1000);
    params.push(cutoffDate);
    query += ` AND date >= $${params.length}`;
  }
  
  query += ` ORDER BY date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);
  
  const result = await pool.query(query, params);
  
  // ⚠️ CRITICAL: Convert date from Unix timestamp to ISO string
  const articles = result.rows.map(row => ({
    ...row,
    date: new Date(row.date).toISOString(),
    tickers: row.tickers,  // Already JSONB, no parsing needed
    topics: row.topics
  }));
  
  res.json(articles);
});
```

### 3. GET `/admin/news/stats` ⚠️ NEEDS IMPLEMENTATION
Get statistics about cached news.

**Implementation Guide:**
```javascript
app.get('/admin/news/stats', requireAdmin, async (req, res) => {
  // Total cached
  const totalResult = await pool.query(
    'SELECT COUNT(*) as count FROM news_cache WHERE expires_at > NOW()'
  );
  
  // By token
  const byTokenResult = await pool.query(`
    SELECT jsonb_array_elements_text(tickers) as token, COUNT(*) as count
    FROM news_cache
    WHERE expires_at > NOW()
    GROUP BY token
    ORDER BY count DESC
    LIMIT 20
  `);
  
  // Average age
  const avgAgeResult = await pool.query(`
    SELECT AVG(EXTRACT(EPOCH FROM (NOW() - to_timestamp(date / 1000)))) as avg_age_seconds
    FROM news_cache
    WHERE expires_at > NOW()
  `);
  
  // Expiring soon (7 days)
  const expiringSoonResult = await pool.query(`
    SELECT COUNT(*) as count
    FROM news_cache
    WHERE expires_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'
  `);
  
  // Oldest and newest
  const rangeResult = await pool.query(`
    SELECT 
      MIN(date) as oldest,
      MAX(date) as newest
    FROM news_cache
    WHERE expires_at > NOW()
  `);
  
  res.json({
    totalCached: parseInt(totalResult.rows[0].count),
    byToken: byTokenResult.rows.map(r => ({
      token: r.token,
      count: parseInt(r.count)
    })),
    avgAgeSeconds: Math.round(avgAgeResult.rows[0].avg_age_seconds || 0),
    expiringSoon: parseInt(expiringSoonResult.rows[0].count),
    oldestArticle: rangeResult.rows[0].oldest ? new Date(rangeResult.rows[0].oldest).toISOString() : null,
    newestArticle: rangeResult.rows[0].newest ? new Date(rangeResult.rows[0].newest).toISOString() : null
  });
});
```

### 4. PUT `/admin/news/cache/:article_url` ⚠️ NEEDS IMPLEMENTATION
Update an existing cached article.

**Request:**
```bash
PUT /admin/news/cache/https%3A%2F%2Fwww.coindesk.com%2F...
Content-Type: application/json

{
  "title": "Updated Title",
  "text": "Updated content",
  "sentiment": "neutral",
  "tickers": ["BTC", "ETH"]
}
```

**Implementation Guide:**
```javascript
app.put('/admin/news/cache/:article_url', requireAdmin, async (req, res) => {
  const articleUrl = decodeURIComponent(req.params.article_url);
  const { title, text, sentiment, tickers } = req.body;
  
  // Validate sentiment
  if (sentiment && !['positive', 'neutral', 'negative'].includes(sentiment)) {
    return res.status(400).json({ error: 'Invalid sentiment value' });
  }
  
  // Build update query dynamically
  const updates = [];
  const params = [articleUrl];
  let paramCount = 1;
  
  if (title) {
    updates.push(`title = $${++paramCount}`);
    params.push(title);
  }
  if (text !== undefined) {
    updates.push(`text = $${++paramCount}`);
    params.push(text);
  }
  if (sentiment) {
    updates.push(`sentiment = $${++paramCount}`);
    params.push(sentiment);
  }
  if (tickers) {
    updates.push(`tickers = $${++paramCount}::jsonb`);
    params.push(JSON.stringify(tickers));
  }
  
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  
  const result = await pool.query(`
    UPDATE news_cache
    SET ${updates.join(', ')}
    WHERE article_url = $1
    RETURNING *
  `, params);
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Article not found' });
  }
  
  const article = result.rows[0];
  res.json({
    ...article,
    date: new Date(article.date).toISOString()
  });
});
```

### 5. DELETE `/admin/news/cache/:article_url` ⚠️ NEEDS IMPLEMENTATION
Delete an article from cache.

**Implementation Guide:**
```javascript
app.delete('/admin/news/cache/:article_url', requireAdmin, async (req, res) => {
  const articleUrl = decodeURIComponent(req.params.article_url);
  
  const result = await pool.query(
    'DELETE FROM news_cache WHERE article_url = $1 RETURNING article_url',
    [articleUrl]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Article not found' });
  }
  
  res.json({ success: true, deleted: articleUrl });
});
```

### 6. POST `/admin/news/refresh` ⚠️ NEEDS IMPLEMENTATION
Force fetch fresh articles from CoinDesk RSS.

**Implementation Guide:**
```javascript
app.post('/admin/news/refresh', requireAdmin, async (req, res) => {
  try {
    // Reuse existing fetchNewsFromCoinDesk function
    const freshArticles = await fetchNewsFromCoinDesk(['BTC', 'ETH', 'SOL', 'BNB', 'XRP']);
    
    let added = 0;
    let updated = 0;
    
    for (const article of freshArticles) {
      const timestamp = article.date ? new Date(article.date).getTime() : Date.now();
      
      const result = await pool.query(`
        INSERT INTO news_cache 
        (article_url, title, text, source_name, date, sentiment, tickers, topics, image_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (article_url) DO UPDATE SET
          title = EXCLUDED.title,
          text = EXCLUDED.text,
          sentiment = EXCLUDED.sentiment,
          expires_at = NOW() + INTERVAL '120 days'
        RETURNING (xmax = 0) AS inserted
      `, [
        article.news_url,
        article.title,
        article.text || '',
        article.source_name,
        timestamp,
        article.sentiment || 'neutral',
        JSON.stringify(article.tickers || []),
        JSON.stringify(article.topics || []),
        article.image_url || null
      ]);
      
      if (result.rows[0].inserted) {
        added++;
      } else {
        updated++;
      }
    }
    
    res.json({ added, updated, total: freshArticles.length });
  } catch (error) {
    console.error('[Admin] News refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh news cache' });
  }
});
```

### 7. POST `/admin/news/cache/bulk-delete` ⚠️ NEEDS IMPLEMENTATION
Delete multiple articles at once.

**Implementation Guide:**
```javascript
app.post('/admin/news/cache/bulk-delete', requireAdmin, async (req, res) => {
  const { urls } = req.body;
  
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'urls must be a non-empty array' });
  }
  
  const result = await pool.query(
    'DELETE FROM news_cache WHERE article_url = ANY($1::text[]) RETURNING article_url',
    [urls]
  );
  
  res.json({
    success: true,
    deleted: result.rows.length,
    urls: result.rows.map(r => r.article_url)
  });
});
```

---

## Data Flow

### Article Caching Flow
```
1. User visits News tab OR Admin clicks "Refresh"
   ↓
2. POST /api/news OR POST /admin/news/refresh
   ↓
3. Backend: fetchNewsFromCoinDesk(['BTC', 'ETH', ...])
   ↓
4. Backend: Fetch CoinDesk RSS feed with redirect: 'follow'
   ↓
5. Backend: Parse RSS XML (parseRSSFeed)
   ↓
6. Backend: Filter articles by token relevance
   ↓
7. Backend: Convert ISO date → Unix timestamp (milliseconds)
   ↓
8. Backend: INSERT INTO news_cache ... ON CONFLICT UPDATE
   ↓
9. Backend: SELECT from news_cache
   ↓
10. Backend: Convert Unix timestamp → ISO date string
    ↓
11. Response: JSON with articles array
    ↓
12. Frontend: Display in News tab or Admin panel
```

### Date Conversion Points

**Point A - Before INSERT:**
```javascript
// Article from RSS parser has ISO string
const article = {
  date: "2025-10-28T19:40:57.000Z",  // ISO string
  title: "...",
  // ...
};

// Convert to Unix timestamp
const timestamp = new Date(article.date).getTime();  // 1730142057000

// Insert into database
await pool.query('INSERT INTO news_cache (date, ...) VALUES ($1, ...)', [timestamp]);
```

**Point B - After SELECT:**
```javascript
// Database returns Unix timestamp
const row = {
  date: 1730142057000,  // BIGINT from PostgreSQL
  title: "...",
  // ...
};

// Convert to ISO string for frontend
const article = {
  ...row,
  date: new Date(row.date).toISOString(),  // "2025-10-28T19:40:57.000Z"
};
```

---

## Admin Panel Integration

### What the Admin Panel Expects

The admin panel developers have built:
1. **Dashboard stats**: Shows total cached articles, expiring soon, average age
2. **News Feed page**: Full CRUD interface for managing cached articles
3. **Edit modal**: Update title, content, sentiment, tickers
4. **Bulk delete**: Remove multiple articles at once
5. **Refresh button**: Force fetch from CoinDesk RSS

### Required Backend Response Format

All endpoints MUST return dates as **ISO strings**, not Unix timestamps:

```javascript
// ❌ WRONG - Frontend will break
{
  "date": 1730142057000
}

// ✅ CORRECT - Frontend expects this
{
  "date": "2025-10-28T19:40:57.000Z"
}
```

### Admin Authentication

All admin endpoints require the `requireAdmin` middleware:

```javascript
function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || 
                req.cookies.admin_token;
  
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
}
```

---

## Critical Implementation Details

### 1. Date Column Type Conversion

**The Issue:**
PostgreSQL BIGINT stores numbers. JavaScript dates are objects. TypeScript expects ISO strings.

**The Solution:**
```javascript
// Storage Layer (PostgreSQL)
date BIGINT  →  1730142057000

// Transport Layer (JSON API)
"date": "2025-10-28T19:40:57.000Z"

// Application Layer (TypeScript/React)
new Date("2025-10-28T19:40:57.000Z")
```

**Always Convert:**
- **Writing to DB**: `new Date(isoString).getTime()`
- **Reading from DB**: `new Date(timestamp).toISOString()`

### 2. JSONB Column Handling

**Tickers column:**
```javascript
// INSERT
const tickers = ["BTC", "ETH"];
await pool.query('INSERT INTO news_cache (tickers) VALUES ($1::jsonb)', [
  JSON.stringify(tickers)  // Convert to JSON string
]);

// SELECT
const row = await pool.query('SELECT tickers FROM news_cache WHERE ...');
const tickers = row.rows[0].tickers;  // Already parsed by node-postgres
// Don't do: JSON.parse(tickers) - it's already an array!
```

**Filtering by ticker:**
```sql
-- Check if tickers contains "BTC"
WHERE tickers @> '["BTC"]'::jsonb

-- Check if tickers contains any of multiple tokens
WHERE tickers ?| ARRAY['BTC', 'ETH']
```

### 3. URL Encoding

Article URLs contain special characters that must be encoded:

```javascript
// Frontend sends
const url = "https://www.coindesk.com/markets/2025/10/28/bitcoin-price/";
const encoded = encodeURIComponent(url);
// https%3A%2F%2Fwww.coindesk.com%2Fmarkets%2F2025%2F10%2F28%2Fbitcoin-price%2F

// Backend receives
const url = decodeURIComponent(req.params.article_url);
// https://www.coindesk.com/markets/2025/10/28/bitcoin-price/
```

### 4. Sentiment Values

Only three valid values:
- `"positive"` - Green badge
- `"neutral"` - Gray badge  
- `"negative"` - Red badge

Validate on update:
```javascript
const validSentiments = ['positive', 'neutral', 'negative'];
if (sentiment && !validSentiments.includes(sentiment)) {
  return res.status(400).json({ error: 'Invalid sentiment' });
}
```

### 5. Cache Expiration

Articles auto-expire after 120 days:
```sql
expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '120 days')
```

**On update**, refresh expiration:
```sql
UPDATE news_cache 
SET title = $1, expires_at = NOW() + INTERVAL '120 days'
WHERE article_url = $2
```

---

## Testing Guide

### Manual Testing Checklist

#### 1. Basic Caching Test
```bash
# Should return 10+ articles
curl -s "https://app.crypto-lifeguard.com/api/news" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"tokens":["BTC","ETH","SOL"]}' | jq '{count: (.news | length), freshAdded: .freshArticlesAdded}'
```

Expected: `{"count": 10, "freshAdded": 10}`

#### 2. Date Format Test
```bash
# Check date is ISO string, not Unix timestamp
curl -s "https://app.crypto-lifeguard.com/api/news" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"tokens":["BTC"]}' | jq '.news[0].date'
```

Expected: `"2025-10-28T19:40:57.000Z"` (ISO string)
NOT: `1730142057000` (Unix timestamp)

#### 3. Admin Stats Test
```bash
curl -s "https://app.crypto-lifeguard.com/admin/news/stats" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" | jq '.'
```

Expected:
```json
{
  "totalCached": 25,
  "byToken": [{"token": "BTC", "count": 10}, ...],
  "avgAgeSeconds": 3600,
  "expiringSoon": 0,
  "oldestArticle": "2025-10-28T...",
  "newestArticle": "2025-10-28T..."
}
```

#### 4. Update Article Test
```bash
curl -s "https://app.crypto-lifeguard.com/admin/news/cache/https%3A%2F%2Fwww.coindesk.com%2F..." \
  -X PUT \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sentiment": "positive"}' | jq '.sentiment'
```

Expected: `"positive"`

#### 5. Delete Article Test
```bash
curl -s "https://app.crypto-lifeguard.com/admin/news/cache/https%3A%2F%2Fwww.coindesk.com%2F..." \
  -X DELETE \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" | jq '.'
```

Expected: `{"success": true, "deleted": "https://..."}`

### Database Verification

```sql
-- Check dates are Unix timestamps (numbers)
SELECT date, to_timestamp(date / 1000) as readable_date 
FROM news_cache 
LIMIT 5;

-- Should show:
--   date          | readable_date
-- ----------------+-------------------------
--  1730142057000 | 2025-10-28 19:40:57+00

-- Check tickers are JSONB arrays
SELECT tickers, jsonb_typeof(tickers) as type
FROM news_cache
LIMIT 5;

-- Should show:
--   tickers       | type
-- ----------------+-------
--  ["BTC", "ETH"] | array

-- Check expiration dates
SELECT COUNT(*) as total,
       COUNT(*) FILTER (WHERE expires_at > NOW()) as active,
       COUNT(*) FILTER (WHERE expires_at <= NOW()) as expired
FROM news_cache;
```

### Admin Panel Testing

1. **Dashboard Stats**
   - [ ] Total cached articles displays correct count
   - [ ] Expiring soon count updates
   - [ ] Average age calculates correctly
   - [ ] Top tokens list shows article counts

2. **News Feed Page**
   - [ ] Articles load on page load
   - [ ] Search filters articles by title
   - [ ] Token filter shows only relevant articles
   - [ ] Dates display as readable format (not timestamps)
   - [ ] Sentiment badges show correct colors

3. **Edit Modal**
   - [ ] Opens when clicking Edit button
   - [ ] Pre-fills current values
   - [ ] Saves changes to database
   - [ ] Updates UI optimistically

4. **Delete Function**
   - [ ] Shows confirmation dialog
   - [ ] Removes article from database
   - [ ] Updates article count
   - [ ] Refreshes list

5. **Refresh Function**
   - [ ] Fetches new articles from CoinDesk
   - [ ] Shows success message with count
   - [ ] Updates article list
   - [ ] Increments total cached count

---

## Troubleshooting

### Problem: Dates showing as numbers (1730142057000)

**Cause:** Missing conversion from Unix timestamp to ISO string

**Fix:**
```javascript
// Add conversion when reading from database
const article = {
  ...row,
  date: new Date(row.date).toISOString()  // ← Add this
};
```

### Problem: "invalid input syntax for type bigint"

**Cause:** Sending ISO string to BIGINT column

**Fix:**
```javascript
// Convert ISO string to Unix timestamp before INSERT
const timestamp = new Date(isoString).getTime();
await pool.query('INSERT INTO news_cache (date) VALUES ($1)', [timestamp]);
```

### Problem: Tickers not filtering correctly

**Cause:** Wrong JSONB query syntax

**Fix:**
```sql
-- ✅ CORRECT
WHERE tickers @> '["BTC"]'::jsonb

-- ❌ WRONG
WHERE tickers = '["BTC"]'
WHERE tickers LIKE '%BTC%'
```

### Problem: Articles not expiring

**Cause:** `expires_at` not being set on update

**Fix:**
```sql
UPDATE news_cache
SET title = $1,
    expires_at = NOW() + INTERVAL '120 days'  -- ← Add this
WHERE article_url = $2
```

---

## Summary

### What's Working ✅
- CoinDesk RSS fetch with redirect following
- Date conversion (Unix timestamp ↔ ISO string)
- Article caching to PostgreSQL
- Public news API endpoint
- Database schema with proper indexes
- 120-day auto-expiration

### What Needs Implementation ⚠️
- Admin endpoints: `/admin/news/cache`, `/admin/news/stats`, etc.
- Admin authentication middleware
- URL encoding/decoding for article URLs
- Sentiment validation
- Bulk delete functionality
- Error handling and logging

### Key Takeaways

1. **Always convert dates**: BIGINT in DB, ISO string in API
2. **Use JSONB operators**: `@>` for containment, not LIKE
3. **Encode URLs**: Special characters must be URL-encoded
4. **Validate sentiment**: Only 'positive', 'neutral', 'negative'
5. **Refresh expiration**: Update `expires_at` when editing
6. **Require admin auth**: Protect all admin endpoints

---

## Next Steps

1. ✅ Implement admin endpoints in `server.js`
2. ✅ Test with admin panel locally
3. ✅ Deploy to staging environment
4. ✅ Verify admin panel integration
5. ✅ Deploy to production
6. ✅ Monitor logs for errors
7. ✅ Document any additional findings

---

**Document Version:** 1.0  
**Last Updated:** October 28, 2025  
**Author:** CLG Backend Team  
**Status:** Ready for implementation
