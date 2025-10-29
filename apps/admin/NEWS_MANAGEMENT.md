# News Management Implementation

## Overview
The admin panel now has full news cache management capabilities, connecting directly to the `news_cache` database table. The external API integration has been removed in favor of database-driven content management.

## What Was Implemented

### 1. TypeScript Type Definitions (`src/types/index.ts`)
Created comprehensive type definitions for:
- **NewsArticle**: Matches `news_cache` table schema
  - Handles Unix timestamp → ISO string conversion for dates
  - Includes all fields: title, text, sentiment, tickers, topics, image_url, etc.
- **NewsStats**: Statistics about cached news
- **AdminStats**: Comprehensive admin dashboard metrics
- **Alert**: Alert management types

### 2. API Integration (`src/lib/api.ts`)
Added news management functions:
- `fetchNewsCache(params?)`: Get news articles with optional filters (token, days, page, limit)
- `fetchNewsStats()`: Get cache statistics (total, by token, age, expiring soon)
- `updateNewsArticle(url, updates)`: Edit article title, text, sentiment, tickers
- `deleteNewsArticle(url)`: Remove article from cache
- `refreshNewsCache()`: Force fetch fresh articles from CoinDesk RSS
- `bulkDeleteNews(urls)`: Delete multiple articles at once
- `fetchAdminStats()`: Get comprehensive dashboard statistics

### 3. News Feed Page (`src/pages/NewsFeed.tsx`)
Complete news management interface with:

#### Features:
- **List View**: Display all cached news articles
- **Search**: Filter by title, content, or source
- **Token Filter**: View articles for specific cryptocurrencies
- **Edit Modal**: Update article details inline
  - Edit title
  - Edit content/description
  - Change sentiment (positive/neutral/negative)
  - Modify ticker tags
- **Delete**: Remove articles from cache (with confirmation)
- **Refresh**: Force fetch fresh articles from CoinDesk RSS
- **Statistics Cards**:
  - Total cached articles
  - Expiring soon (7 days)
  - Average cache age
  - Unique tokens covered

#### UI Components:
- Stats cards showing cache metrics
- Search and filter controls
- Article cards with metadata (source, date, sentiment, tickers)
- Edit/delete action buttons
- Modal for editing articles
- Loading and empty states

### 4. Dashboard Integration (`src/pages/Dashboard.tsx`)
Added news cache section to main dashboard:
- **News Articles Stat Card**: Shows total cached articles
- **News Cache Statistics Panel**:
  - Total cached articles
  - Articles expiring soon
  - Average cache age in days
  - Number of unique tokens
  - Top 10 tokens in news (with article counts)
- Updated "News API" to "News Source: CoinDesk RSS"

### 5. Navigation (`src/App.tsx`, `src/components/Layout.tsx`)
- Re-enabled News Feed route (`/news`)
- Restored sidebar navigation item with Newspaper icon
- All previously commented code now active

## Database Integration

### Table: `news_cache`
```sql
article_url TEXT PRIMARY KEY
title TEXT NOT NULL
text TEXT
source_name TEXT
date BIGINT                    -- Unix timestamp (milliseconds)
sentiment TEXT
tickers JSONB                  -- ["BTC", "ETH"]
topics JSONB
image_url TEXT
expires_at TIMESTAMP
created_at TIMESTAMP
```

### Date Handling (Critical!)
The `date` column stores Unix timestamps (milliseconds) as BIGINT, but the frontend expects ISO strings:
- **Backend → Frontend**: Unix timestamp converted to ISO string
- **Frontend → Backend**: ISO string converted to Unix timestamp
- This conversion happens in the backend API endpoints

## Backend Requirements

The following endpoints need to be implemented in the CLG-DEPLOY backend:

### News Cache Endpoints
```javascript
GET /admin/news/cache?token=BTC&days=7&page=1&limit=50
GET /admin/news/stats
PUT /admin/news/cache/:article_url
DELETE /admin/news/cache/:article_url
POST /admin/news/refresh
POST /admin/news/cache/bulk-delete
```

### Expected Responses

#### GET /admin/news/cache
```json
[
  {
    "article_url": "https://...",
    "title": "Bitcoin Hits New High",
    "text": "Article content...",
    "source_name": "CoinDesk",
    "date": "2025-10-28T19:40:57.000Z",
    "sentiment": "positive",
    "tickers": ["BTC", "ETH"],
    "topics": [],
    "image_url": null,
    "expires_at": "2026-02-25T19:40:57.000Z",
    "created_at": "2025-10-28T19:40:57.000Z"
  }
]
```

#### GET /admin/news/stats
```json
{
  "totalCached": 150,
  "byToken": [
    { "token": "BTC", "count": 45 },
    { "token": "ETH", "count": 38 }
  ],
  "avgAgeSeconds": 2592000,
  "expiringSoon": 10,
  "oldestArticle": "2025-08-28T12:00:00.000Z",
  "newestArticle": "2025-10-28T19:40:57.000Z"
}
```

#### PUT /admin/news/cache/:article_url
Request body:
```json
{
  "title": "Updated Title",
  "text": "Updated content",
  "sentiment": "neutral",
  "tickers": ["BTC", "ETH", "SOL"]
}
```

#### POST /admin/news/refresh
```json
{
  "added": 12,
  "updated": 5
}
```

## Implementation Notes

### Security
- All endpoints require admin authentication (Bearer token or admin cookie)
- Article URL encoding/decoding for special characters in URLs
- Input validation for sentiment values and ticker arrays

### Performance
- Pagination support for large article lists
- Indexed queries on `date` and `tickers` columns
- Efficient filtering by token using GIN index on JSONB

### UX Decisions
- Confirmation dialog before deleting articles
- Loading states during mutations
- Optimistic UI updates with React Query
- Error handling with toast notifications (can be added)
- Article preview with "line-clamp-2" for long descriptions

## Testing Checklist

Before deployment, verify:
- [ ] News cache loads on dashboard
- [ ] News Feed page displays articles
- [ ] Search functionality works
- [ ] Token filter works
- [ ] Edit modal saves changes
- [ ] Delete removes article
- [ ] Refresh fetches new articles
- [ ] Stats display correctly
- [ ] Date formatting is correct (not showing Unix timestamps)
- [ ] Sentiment badges display correct colors
- [ ] Token tags render properly
- [ ] Empty states show when no articles

## Next Steps

1. **Backend Implementation**: Add the required endpoints to CLG-DEPLOY
2. **Date Conversion**: Ensure Unix timestamp ↔ ISO conversion in backend
3. **Error Handling**: Add toast notifications for errors
4. **Pagination**: Implement if article count exceeds 100
5. **Image Support**: Add image display when `image_url` is present
6. **Topics**: Add topic management when topics are implemented
7. **Bulk Operations**: Add multi-select for bulk delete

## Migration from Old System

**Before**: News was fetched from external API on every page load
**After**: News is cached in database, managed through admin panel

**Benefits**:
- Faster page loads (no external API calls)
- Full editorial control over content
- Better offline support
- No API rate limits or costs
- Custom sentiment tagging
- Custom ticker associations

**Trade-offs**:
- Requires manual refresh to get latest news
- Storage space needed for cache
- Admin needs to manage stale articles

## Configuration

No new environment variables needed. Uses existing:
- `VITE_API_URL`: Backend API endpoint
- Admin authentication via existing token system

## Files Changed

1. ✅ `src/types/index.ts` - Created
2. ✅ `src/lib/api.ts` - Updated
3. ✅ `src/pages/NewsFeed.tsx` - Completely rewritten
4. ✅ `src/pages/Dashboard.tsx` - Enhanced with news stats
5. ✅ `src/App.tsx` - Re-enabled route
6. ✅ `src/components/Layout.tsx` - Re-enabled navigation

## Dependencies

All required dependencies already installed:
- `@tanstack/react-query` - Data fetching and caching
- `lucide-react` - Icons (Newspaper, RefreshCw, Edit2, Trash2, etc.)
- `axios` - HTTP client

No additional packages needed! 🎉
