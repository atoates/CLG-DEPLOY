# Backend Implementation: News Article Alert Tracking

## ✅ STATUS: COMPLETED & DEPLOYED

**All backend changes have been implemented and deployed to production!**

- ✅ Database migration 009 created and deployed
- ✅ POST `/admin/alerts` endpoint updated to accept `source_url` and mark articles
- ✅ GET `/admin/news/cache` endpoint updated to return `alert_created` field
- ✅ Frontend integration ready and deployed

**Deployment Date:** October 29, 2025

---

## Overview
Track which news articles have been converted to alerts by adding a field to the database and updating the relevant endpoints.

## Database Changes

### 1. Add Column to `news_cache` Table

```sql
ALTER TABLE news_cache 
ADD COLUMN alert_created BOOLEAN DEFAULT FALSE;

-- Add index for faster queries
CREATE INDEX idx_news_cache_alert_created ON news_cache(alert_created);
```

## API Endpoint Changes

### 2. Update POST `/admin/alerts` Endpoint

When an alert is created from a news article, mark the source article as processed.

**Current Request Body:**
```json
{
  "token": "BTC",
  "title": "Bitcoin Security Alert",
  "body": "Description of the alert...",
  "severity": "warning",
  "tags": ["security", "bitcoin"],
  "deadline": "2025-11-05T12:00:00Z",
  "source_url": "https://example.com/article"  // Optional - may contain news article URL
}
```

**Implementation:**
```javascript
// In POST /admin/alerts handler
app.post('/admin/alerts', async (req, res) => {
  const { token, title, body, severity, tags, deadline, source_url } = req.body;
  
  // Create the alert (existing logic)
  const alert = await createAlert({ token, title, body, severity, tags, deadline, source_url });
  
  // NEW: If source_url matches a news article, mark it as processed
  if (source_url) {
    try {
      await db.query(
        'UPDATE news_cache SET alert_created = TRUE WHERE article_url = $1',
        [source_url]
      );
    } catch (err) {
      // Log error but don't fail the alert creation
      console.error('Failed to mark news article as processed:', err);
    }
  }
  
  res.json(alert);
});
```

### 3. Update GET `/admin/news/cache` Endpoint

Return the `alert_created` field with each news article.

**Current Response:**
```json
[
  {
    "article_url": "https://example.com/article1",
    "title": "Bitcoin News",
    "text": "...",
    "source_name": "CoinDesk",
    "date": "2025-10-28T10:00:00Z",
    "sentiment": "positive",
    "tickers": ["BTC"],
    "topics": [],
    "image_url": null,
    "expires_at": "2025-11-28T10:00:00Z",
    "created_at": "2025-10-28T10:00:00Z"
  }
]
```

**Updated Response (add `alert_created` field):**
```json
[
  {
    "article_url": "https://example.com/article1",
    "title": "Bitcoin News",
    "text": "...",
    "source_name": "CoinDesk",
    "date": "2025-10-28T10:00:00Z",
    "sentiment": "positive",
    "tickers": ["BTC"],
    "topics": [],
    "image_url": null,
    "expires_at": "2025-11-28T10:00:00Z",
    "created_at": "2025-10-28T10:00:00Z",
    "alert_created": false
  }
]
```

**Implementation:**
```javascript
// In GET /admin/news/cache handler
app.get('/admin/news/cache', async (req, res) => {
  const { token, days } = req.query;
  
  // Update SELECT to include alert_created
  const query = `
    SELECT 
      article_url,
      title,
      text,
      source_name,
      date,
      sentiment,
      tickers,
      topics,
      image_url,
      expires_at,
      created_at,
      alert_created  -- ADD THIS FIELD
    FROM news_cache
    WHERE 1=1
    ${token ? 'AND $1 = ANY(tickers)' : ''}
    ${days ? `AND date >= NOW() - INTERVAL '${days} days'` : ''}
    ORDER BY date DESC
  `;
  
  const result = await db.query(query, token ? [token] : []);
  res.json(result.rows);
});
```

## Frontend Integration

### 4. Update TypeScript Types

Update `src/types/index.ts`:

```typescript
export interface NewsArticle {
  article_url: string
  title: string
  text: string | null
  source_name: string
  date: string
  sentiment: 'positive' | 'neutral' | 'negative' | null
  tickers: string[]
  topics: string[]
  image_url: string | null
  expires_at: string
  created_at: string
  alert_created?: boolean  // ADD THIS FIELD
}
```

### 5. Update Frontend Logic

The frontend will be updated to:
- Remove localStorage tracking
- Use the `alert_created` field from the API response
- Show check icon when `article.alert_created === true`

## Migration Notes

### For Existing Data

If you want to mark existing alerts that came from news articles:

```sql
-- Find and mark news articles that have matching alerts by source_url
UPDATE news_cache 
SET alert_created = TRUE 
WHERE article_url IN (
  SELECT DISTINCT source_url 
  FROM alerts 
  WHERE source_url IS NOT NULL
);
```

## Testing Checklist

- [x] Database column added successfully
- [x] GET `/admin/news/cache` returns `alert_created` field
- [x] POST `/admin/alerts` marks source article when `source_url` provided
- [x] Check icon appears in frontend when article has `alert_created = true`
- [x] Creating alert from news article updates the database
- [x] Refreshing the page shows the check icon persists

## Deployment Steps

### ✅ COMPLETED

1. **Database Migration** ✅
   - Migration 009 created: `009_add_alert_created_to_news.sql`
   - Deployed to Railway and executed automatically
   - Backfilled existing data by matching alerts.source_url

2. **Backend Code Deployed** ✅
   - POST `/admin/alerts` handler updated to accept and process source_url
   - GET `/admin/news/cache` handler updated to return alert_created field
   - Deployed to Railway: https://app.crypto-lifeguard.com

3. **Frontend Code Deployed** ✅
   - Frontend updated to use `alert_created` field from API
   - localStorage dependency removed
   - Deployed to Railway admin panel
   - Check icons display correctly based on database state

## Questions?

~~Contact the frontend team if you need clarification on:~~
~~- The exact format of `source_url` in alert creation~~
~~- How the frontend extracts the article URL~~
~~- Testing coordination~~

### ✅ ALL QUESTIONS RESOLVED - FEATURE COMPLETE

**How It Works Now:**
1. User clicks Bell icon on news article in admin panel
2. Frontend creates alert via POST `/admin/alerts` with `source_url` = article URL
3. Backend creates alert AND marks `news_cache.alert_created = TRUE`
4. Frontend refetches news cache and shows green check icon
5. Check icon persists across all devices and sessions (database-backed)

**Backend Logs to Monitor:**
```
[Admin Alerts] Marked news article as processed: https://example.com/article
```

**Frontend Implementation:**
- Uses `article.alert_created` field to show CheckCircle2 icon
- Passes `creatingAlert.article_url` as `source_url` when creating alert
- Invalidates news cache after alert creation to refetch updated status
