/**
 * News Routes Module
 *
 * Handles all news-related routes:
 * - Public API: POST /api/news (fetch/cache RSS articles)
 * - Admin cache management: GET/PUT/DELETE /admin/news/cache/*
 * - Admin refresh: POST /admin/news/refresh
 * - Bulk operations: POST /admin/news/cache/bulk-delete
 * - News feeds CRUD: GET/POST/PUT/DELETE /admin/news/feeds
 * - Cache stats: GET /admin/news/stats
 *
 * Also exports news fetching functions for use by other modules (e.g., AI summaries).
 */

const express = require('express');
const router = express.Router();
const { pool, trackAPICall } = require('../lib/db');
const { requireAdmin } = require('../lib/middleware');
const log = require('../lib/logger');

function safeParseJson(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback !== undefined ? fallback : str; }
}

function normalizeTickers(tickers) {
  if (!Array.isArray(tickers)) return [];
  return tickers.map(t => typeof t === 'string' ? t.toUpperCase().replace(/[^A-Z0-9]/g, '') : t).filter(Boolean);
}

// ============================================
// PUBLIC NEWS API
// ============================================

/**
 * POST /api/news
 * Fetch and cache RSS articles from news sources
 * Fetches fresh articles from CoinDesk, adds to DB cache, returns merged result
 */
router.post('/api/news', async (req, res) => {
  try {
    const { tokens } = req.body;

    // Default to popular tokens if none specified
    const tokensToFetch = Array.isArray(tokens) && tokens.length > 0
      ? tokens
      : ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'];

    // ALWAYS fetch fresh articles from CoinDesk RSS to add to database
    log.debug('[News API] Fetching fresh articles from CoinDesk RSS...');
    let freshArticles = [];
    try {
      freshArticles = await fetchNewsFromCoinDesk(tokensToFetch);
      log.debug(`[News API] Fetched ${freshArticles.length} fresh articles from CoinDesk`);
    } catch (error) {
      log.warn('[News API] Failed to fetch from CoinDesk RSS:', error.message);
    }

    // Add fresh CoinDesk articles to database cache
    let addedCount = 0;
    for (const article of freshArticles) {
      try {
        // Convert ISO date string to Unix timestamp (milliseconds)
        const dateValue = article.date || article.publishedAt;
        const timestamp = dateValue ? new Date(dateValue).getTime() : Date.now();

        await pool.query(`
          INSERT INTO news_cache
          (article_url, title, text, source_name, date, sentiment, tickers, topics, image_url)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (article_url) DO UPDATE SET
            title = EXCLUDED.title,
            text = EXCLUDED.text,
            sentiment = EXCLUDED.sentiment,
            expires_at = NOW() + INTERVAL '120 days'
        `, [
          article.news_url || article.url,
          article.title,
          article.text || article.description || '',
          article.source_name,
          timestamp,
          article.sentiment || 'neutral',
          JSON.stringify(article.tickers || []),
          JSON.stringify(article.topics || []),
          article.image_url || null
        ]);
        addedCount++;
      } catch (dbError) {
        // Continue even if one article fails
        log.error('[News API] Failed to cache article:', article.title?.substring(0, 50), 'Error:', dbError.message);
      }
    }
    log.debug(`[News API] Added/updated ${addedCount} articles in cache`);

    // Now get all cached articles (including the fresh ones we just added)
    let allNews = [];
    try {
      // Clean up any system messages that might have been cached
      await pool.query(`
        DELETE FROM news_cache
        WHERE source_name IN ('System', 'CryptoNews API')
        OR title LIKE '%Service Unavailable%'
        OR title LIKE '%No News Available%'
      `).catch(() => {});

      const cacheResult = await pool.query(`
        SELECT * FROM news_cache
        WHERE expires_at > NOW()
        ORDER BY date DESC
        LIMIT 50
      `);

      allNews = cacheResult.rows
        .map(row => ({
          title: row.title,
          text: row.text,
          source_name: row.source_name,
          date: row.date ? new Date(row.date).toISOString() : new Date().toISOString(), // Convert Unix timestamp to ISO string
          sentiment: row.sentiment,
          tickers: row.tickers ? JSON.parse(row.tickers) : [],
          topics: row.topics ? JSON.parse(row.topics) : [],
          news_url: row.article_url,
          image_url: row.image_url
        }))
        .filter(article =>
          article.source_name !== 'System' &&
          article.source_name !== 'CryptoNews API' &&
          !article.title.includes('Service Unavailable') &&
          !article.title.includes('No News Available')
        );

      log.debug(`[News API] Returning ${allNews.length} total articles from cache`);
    } catch (cacheError) {
      log.warn('[News API] Cache read error, returning fresh articles only:', cacheError.message);
      allNews = freshArticles;
    }

    return res.json({
      news: allNews,
      cached: false,
      freshArticlesAdded: addedCount,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[News API] Error:', error.message);
    res.status(500).json({
      error: 'Failed to fetch news',
      message: error.message,
      news: []
    });
  }
});

// ============================================
// ADMIN NEWS CACHE MANAGEMENT
// ============================================

/**
 * GET /admin/news/cache
 * Get cached news with optional filters (token, days, pagination)
 */
router.get('/admin/news/cache', requireAdmin, async (req, res) => {
  try {
    const { token, days, page = 1, limit = 50 } = req.query;

    const params = [];
    let query = `
      SELECT * FROM news_cache
      WHERE expires_at > NOW()
    `;

    // Filter by token if specified (expects uppercase tickers stored in DB)
    const tokenFilter = typeof token === 'string' ? token.trim().toUpperCase() : '';
    if (tokenFilter) {
      params.push(JSON.stringify([tokenFilter]));
      query += ` AND tickers @> $${params.length}::jsonb`;
    }

    // Filter by age (days back from now)
    const parsedDays = days !== undefined ? Number.parseInt(String(days), 10) : NaN;
    if (!Number.isNaN(parsedDays) && parsedDays > 0) {
      const daysAgo = Date.now() - (parsedDays * 24 * 60 * 60 * 1000);
      params.push(daysAgo);
      query += ` AND date >= $${params.length}`;
    }

    query += ' ORDER BY date DESC';

    // Pagination
    const pageNum = Math.max(Number.parseInt(String(page), 10) || 1, 1);
    const limitNum = Math.min(Math.max(Number.parseInt(String(limit), 10) || 50, 1), 200);
    const offset = (pageNum - 1) * limitNum;

    params.push(limitNum);
    query += ` LIMIT $${params.length}`;
    params.push(offset);
    query += ` OFFSET $${params.length}`;

    const result = await pool.query(query, params);

    const articles = result.rows.map(row => ({
      article_url: row.article_url,
      title: row.title,
      text: row.text,
      source_name: row.source_name,
      date: row.date ? new Date(Number(row.date)).toISOString() : new Date().toISOString(),
      sentiment: row.sentiment,
      tickers: safeParseJson(row.tickers, []),
      topics: safeParseJson(row.topics, []),
      image_url: row.image_url,
      expires_at: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
      alert_created: row.alert_created || false
    }));

    res.json(articles);
  } catch (error) {
    console.error('[Admin News] Failed to fetch cache:', error);
    res.status(500).json({ error: 'Failed to fetch news cache' });
  }
});

/**
 * GET /admin/news/stats
 * Get cache statistics (total, by token, age, expiring soon)
 */
router.get('/admin/news/stats', requireAdmin, async (req, res) => {
  try {
    // Total cached articles
    const totalResult = await pool.query(`
      SELECT COUNT(*) as total FROM news_cache
      WHERE expires_at > NOW()
    `);
    const totalCached = parseInt(totalResult.rows[0].total);

    // Articles by token
    const tokenResult = await pool.query(`
      SELECT jsonb_array_elements_text(tickers) as token, COUNT(*) as count
      FROM news_cache
      WHERE expires_at > NOW()
      GROUP BY token
      ORDER BY count DESC
      LIMIT 20
    `);
    const byToken = tokenResult.rows.map(row => ({
      token: row.token,
      count: parseInt(row.count)
    }));

    // Average age and date range
    const ageResult = await pool.query(`
      SELECT
        MIN(date) as oldest,
        MAX(date) as newest,
        AVG(EXTRACT(EPOCH FROM NOW()) * 1000 - date) as avg_age_ms
      FROM news_cache
      WHERE expires_at > NOW()
    `);
    const ageData = ageResult.rows[0];

    // Expiring soon (within 7 days)
    const expiringResult = await pool.query(`
      SELECT COUNT(*) as count FROM news_cache
      WHERE expires_at > NOW()
      AND expires_at < NOW() + INTERVAL '7 days'
    `);
    const expiringSoon = parseInt(expiringResult.rows[0].count);

    res.json({
      totalCached,
      byToken,
      avgAgeSeconds: ageData.avg_age_ms ? Math.floor(ageData.avg_age_ms / 1000) : 0,
      expiringSoon,
      oldestArticle: ageData.oldest ? new Date(parseInt(ageData.oldest)).toISOString() : null,
      newestArticle: ageData.newest ? new Date(parseInt(ageData.newest)).toISOString() : null
    });
  } catch (error) {
    console.error('[Admin News] Failed to fetch stats:', error);
    res.status(500).json({ error: 'Failed to fetch news stats' });
  }
});

/**
 * PUT /admin/news/cache/:article_url
 * Update a cached article (title, text, sentiment, tickers)
 */
router.put('/admin/news/cache/:article_url', requireAdmin, async (req, res) => {
  try {
    const articleUrl = decodeURIComponent(req.params.article_url);
    const { title, text, sentiment, tickers } = req.body;
    const normalizedSentiment = typeof sentiment === 'string' ? sentiment.toLowerCase() : undefined;

    // Validate sentiment
    const validSentiments = ['positive', 'neutral', 'negative'];
    if (normalizedSentiment && !validSentiments.includes(normalizedSentiment)) {
      return res.status(400).json({ error: 'Invalid sentiment value' });
    }

    // Build update query dynamically
    const updates = [];
    const params = [];
    let paramCount = 1;

    if (title !== undefined) {
      params.push(title);
      updates.push(`title = $${paramCount++}`);
    }
    if (text !== undefined) {
      params.push(text);
      updates.push(`text = $${paramCount++}`);
    }
    if (normalizedSentiment !== undefined) {
      params.push(normalizedSentiment);
      updates.push(`sentiment = $${paramCount++}`);
    }
    if (tickers !== undefined) {
      params.push(JSON.stringify(normalizeTickers(tickers)));
      updates.push(`tickers = $${paramCount++}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(articleUrl);
    const query = `
      UPDATE news_cache
      SET ${updates.join(', ')}
      WHERE article_url = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }

    const row = result.rows[0];
    res.json({
      article_url: row.article_url,
      title: row.title,
      text: row.text,
      source_name: row.source_name,
      date: row.date ? new Date(Number(row.date)).toISOString() : new Date().toISOString(),
      sentiment: row.sentiment,
      tickers: safeParseJson(row.tickers, []),
      topics: safeParseJson(row.topics, []),
      image_url: row.image_url,
      expires_at: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : null
    });
  } catch (error) {
    console.error('[Admin News] Failed to update article:', error);
    res.status(500).json({ error: 'Failed to update article' });
  }
});

/**
 * DELETE /admin/news/cache/:article_url
 * Delete a cached article by URL
 */
router.delete('/admin/news/cache/:article_url', requireAdmin, async (req, res) => {
  try {
    const articleUrl = decodeURIComponent(req.params.article_url);

    const result = await pool.query(
      'DELETE FROM news_cache WHERE article_url = $1 RETURNING article_url',
      [articleUrl]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }

    res.json({ success: true, article_url: articleUrl });
  } catch (error) {
    console.error('[Admin News] Failed to delete article:', error);
    res.status(500).json({ error: 'Failed to delete article' });
  }
});

/**
 * POST /admin/news/refresh
 * Force fetch fresh articles from CoinDesk and update cache
 */
router.post('/admin/news/refresh', requireAdmin, async (req, res) => {
  try {
    const { tokens } = req.body;
    const tokensToFetch = Array.isArray(tokens) && tokens.length > 0
      ? tokens
      : ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'];

    console.log('[Admin News Refresh] Fetching articles for tokens:', tokensToFetch);

    const freshArticles = await fetchNewsFromCoinDesk(tokensToFetch);
    console.log(`[Admin News Refresh] Fetched ${freshArticles.length} articles`);

    let addedCount = 0;
    let updatedCount = 0;

    for (const article of freshArticles) {
      try {
        const dateValue = article.date || article.publishedAt;
        const timestamp = dateValue ? new Date(dateValue).getTime() : Date.now();

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
          article.news_url || article.url,
          article.title,
          article.text || article.description || '',
          article.source_name,
          timestamp,
          article.sentiment || 'neutral',
          JSON.stringify(article.tickers || []),
          JSON.stringify(article.topics || []),
          article.image_url || null
        ]);

        if (result.rows[0].inserted) {
          addedCount++;
        } else {
          updatedCount++;
        }
      } catch (dbError) {
        console.error('[Admin News Refresh] Failed to cache article:', article.title?.substring(0, 50), dbError.message);
      }
    }

    console.log(`[Admin News Refresh] Added ${addedCount}, updated ${updatedCount}`);

    res.json({
      added: addedCount,
      updated: updatedCount,
      total: freshArticles.length
    });
  } catch (error) {
    console.error('[Admin News Refresh] Error:', error);
    res.status(500).json({ error: 'Failed to refresh news cache' });
  }
});

/**
 * POST /admin/news/cache/bulk-delete
 * Bulk delete articles by URL list
 */
router.post('/admin/news/cache/bulk-delete', requireAdmin, async (req, res) => {
  try {
    const { urls } = req.body;

    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'urls must be a non-empty array' });
    }

    const normalizedUrls = urls
      .map(u => {
        try {
          return decodeURIComponent(u);
        } catch {
          return u;
        }
      })
      .filter(Boolean);

    if (!normalizedUrls.length) {
      return res.status(400).json({ error: 'No valid article URLs provided' });
    }

    const result = await pool.query(
      'DELETE FROM news_cache WHERE article_url = ANY($1) RETURNING article_url',
      [normalizedUrls]
    );

    res.json({
      deleted: result.rows.length,
      urls: result.rows.map(row => row.article_url)
    });
  } catch (error) {
    console.error('[Admin News] Failed to bulk delete:', error);
    res.status(500).json({ error: 'Failed to bulk delete articles' });
  }
});

// ============================================
// NEWS FEEDS MANAGEMENT
// ============================================

/**
 * GET /admin/news/feeds
 * Get all configured news feeds
 */
router.get('/admin/news/feeds', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM news_feeds ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('[Admin Feeds] Failed to fetch feeds:', error);
    res.status(500).json({ error: 'Failed to fetch news feeds' });
  }
});

/**
 * POST /admin/news/feeds
 * Add a new news feed
 */
router.post('/admin/news/feeds', requireAdmin, async (req, res) => {
  try {
    const { name, url, feed_type = 'rss' } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: 'Name and URL are required' });
    }

    const result = await pool.query(
      `INSERT INTO news_feeds (name, url, feed_type, enabled, article_count)
       VALUES ($1, $2, $3, true, 0)
       RETURNING *`,
      [name, url, feed_type]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('[Admin Feeds] Failed to add feed:', error);
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'Feed URL already exists' });
    }
    res.status(500).json({ error: 'Failed to add news feed' });
  }
});

/**
 * PUT /admin/news/feeds/:id
 * Update a news feed
 */
router.put('/admin/news/feeds/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, url, enabled } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (url !== undefined) {
      updates.push(`url = $${paramCount++}`);
      values.push(url);
    }
    if (enabled !== undefined) {
      updates.push(`enabled = $${paramCount++}`);
      values.push(enabled);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE news_feeds SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Feed not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('[Admin Feeds] Failed to update feed:', error);
    res.status(500).json({ error: 'Failed to update news feed' });
  }
});

/**
 * DELETE /admin/news/feeds/:id
 * Delete a news feed
 */
router.delete('/admin/news/feeds/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM news_feeds WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Feed not found' });
    }

    res.json({ success: true, feed: result.rows[0] });
  } catch (error) {
    console.error('[Admin Feeds] Failed to delete feed:', error);
    res.status(500).json({ error: 'Failed to delete news feed' });
  }
});

// ============================================
// NEWS FETCHING FUNCTIONS (exported for reuse)
// ============================================

/**
 * Fetch news for specified tokens from available providers
 * Tries CoinDesk RSS first (always available), falls back to CryptoNews API
 * Used by other modules like AI summary generation
 *
 * @param {string[]} tokens - List of token symbols to fetch news for
 * @returns {Promise<Object[]>} Array of news articles
 */
async function fetchNewsForTokens(tokens) {
  try {
    if (tokens.length === 0) {
      tokens = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'];
    }

    // Try CoinDesk RSS (free, always available) first, then CryptoNews API as fallback
    const tryProvidersInOrder = ['coindesk', 'cryptonews'];

    let aggregated = [];
    for (const provider of tryProvidersInOrder) {
      try {
        if (provider === 'coindesk') {
          const cd = await fetchNewsFromCoinDesk(tokens);
          aggregated.push(...cd);
        } else if (provider === 'cryptonews') {
          const cn = await fetchNewsFromCryptoNews(tokens);
          aggregated.push(...cn);
        }
      } catch (e) {
        console.warn(`[News] Provider ${provider} failed:`, e && e.message);
      }
      // If we already have a decent set (>=20), stop early
      if (aggregated.length >= 20) break;
    }

    if (aggregated.length > 0) {
      // Deduplicate by title + url and sort by date desc
      const seen = new Set();
      const uniq = [];
      for (const a of aggregated) {
        const key = `${a.title}::${a.news_url || a.url || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        uniq.push(a);
      }
      return uniq
        .sort((a, b) => new Date(b.publishedAt || b.date) - new Date(a.publishedAt || a.date))
        .slice(0, 30);
    }

    // If no articles found from any provider, return informative message
    return [{
      title: "No News Available",
      description: "No recent cryptocurrency news found for your selected tokens. Try adding more tokens to your watchlist.",
      text: "No recent cryptocurrency news found for your selected tokens. Try adding more tokens to your watchlist.",
      url: "#",
      news_url: "#",
      publishedAt: new Date().toISOString(),
      date: new Date().toISOString(),
      source: { name: "System" },
      source_name: "System",
      sentiment: "neutral",
      tickers: tokens,
      image_url: null
    }];

  } catch (error) {
    console.error('News API error:', error.message);

    return [{
      title: "News Service Temporarily Unavailable",
      description: "Unable to load news at this time. Please try again later.",
      text: "Unable to load news at this time. Please try again later.",
      url: "#",
      news_url: "#",
      publishedAt: new Date().toISOString(),
      date: new Date().toISOString(),
      source: { name: "System" },
      source_name: "System",
      sentiment: "neutral",
      tickers: [],
      image_url: null
    }];
  }
}

/**
 * Fetch news from CoinDesk RSS feed (free, public, no API key required)
 * Parses RSS XML and extracts articles matching specified tokens
 *
 * @param {string[]} tokens - Token symbols to filter for
 * @returns {Promise<Object[]>} Array of articles with normalized fields
 */
async function fetchNewsFromCoinDesk(tokens) {
  try {
    console.log('[News] Fetching CoinDesk RSS feed...');
    // CoinDesk provides a free public RSS feed - no API key required
    const response = await fetch('https://www.coindesk.com/arc/outboundfeeds/rss/', {
      headers: {
        'User-Agent': 'CryptoLifeguard/1.0'
      },
      redirect: 'follow' // Explicitly follow redirects (CoinDesk RSS redirects)
    });

    // Track API call
    await trackAPICall('CoinDesk', '/rss');

    console.log(`[News] CoinDesk RSS response status: ${response.status}`);

    if (!response.ok) {
      console.warn(`[News] CoinDesk RSS feed failed with status ${response.status}`);
      return [];
    }

    const xmlText = await response.text();
    console.log(`[News] CoinDesk RSS response length: ${xmlText.length} bytes`);

    // Parse RSS XML to extract articles
    const articles = parseRSSFeed(xmlText, tokens);

    console.log(`[News] CoinDesk RSS: fetched ${articles.length} articles`);
    return articles;

  } catch (error) {
    console.error('[News] Error fetching from CoinDesk RSS:', error.message);
    return [];
  }
}

/**
 * Simple RSS parser for CoinDesk feed
 * Uses regex to extract item elements and article metadata
 *
 * @param {string} xmlText - Raw RSS XML
 * @param {string[]} tokens - Token symbols to filter for
 * @returns {Object[]} Parsed articles
 */
function parseRSSFeed(xmlText, tokens) {
  const articles = [];

  try {
    // Extract items from RSS feed
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const items = xmlText.match(itemRegex) || [];

    for (const item of items.slice(0, 30)) {
      // Extract fields
      const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
                   item.match(/<title>(.*?)<\/title>/)?.[1] || '';
      const link = item.match(/<link>(.*?)<\/link>/)?.[1] || '';
      const description = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] ||
                         item.match(/<description>(.*?)<\/description>/)?.[1] || '';
      const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';

      // Check if article mentions any of the tracked tokens
      const articleText = `${title} ${description}`.toUpperCase();
      const relevantTokens = tokens.filter(token =>
        articleText.includes(token.toUpperCase()) ||
        articleText.includes(`BITCOIN`) && token === 'BTC' ||
        articleText.includes(`ETHEREUM`) && token === 'ETH'
      );

      // Only include if relevant to at least one token (or include all if no tokens specified)
      if (tokens.length === 0 || relevantTokens.length > 0) {
        articles.push({
          title: title.trim(),
          text: description.replace(/<[^>]*>/g, '').trim(), // Strip HTML tags
          source_name: 'CoinDesk',
          date: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
          sentiment: 'neutral',
          tickers: relevantTokens.length > 0 ? relevantTokens : tokens,
          news_url: link,
          image_url: null
        });
      }
    }

  } catch (parseError) {
    console.error('[News] RSS parsing error:', parseError.message);
  }

  return articles;
}

/**
 * Fetch news from CryptoNews API (paid service with API key)
 * Falls back gracefully if no API key is configured
 * Fetches articles for each token individually to distribute quota
 *
 * @param {string[]} tokens - Token symbols to fetch for
 * @returns {Promise<Object[]>} Array of articles
 */
async function fetchNewsFromCryptoNews(tokens) {
  // Get CryptoNews API key
  const cryptoNewsApiKey = (
    process.env.NEWSAPI_KEY
    || process.env.NEWS_API
    || process.env.CRYPTONEWS_API_KEY
    || process.env.CRYPTO_NEWS_API_KEY
  );
  // Validate API key
  const invalidKeys = ['undefined', 'null', '', 'fs', 'your-key-here', 'xxx'];
  if (!cryptoNewsApiKey || invalidKeys.includes(String(cryptoNewsApiKey).toLowerCase().trim())) {
    return [];
  }

  const allArticles = [];
  let ipBlacklisted = false;
  const itemsPerToken = Math.max(5, Math.ceil(20 / Math.max(1, tokens.length)));

  for (const token of (tokens.length ? tokens.slice(0, 8) : ['BTC','ETH'])) {
    try {
      const url = `https://cryptonews-api.com/api/v1?tickers=${token}&items=${itemsPerToken}&page=1&token=${cryptoNewsApiKey}`;
      const response = await fetch(url, {
        timeout: 10000,
        headers: { 'User-Agent': 'CryptoLifeguard/1.0' }
      });
      console.log(`[News] CryptoNews ${token} -> ${response.status}`);
      if (response.ok) {
        const data = await response.json();
        if (data.data && Array.isArray(data.data) && data.data.length > 0) {
          const tokenArticles = data.data.map(article => ({
            title: article.title || 'No title available',
            description: article.text || article.description || 'No description available',
            text: article.text || article.description || '',
            url: article.news_url || article.url || '#',
            news_url: article.news_url || article.url || '#',
            publishedAt: article.date || new Date().toISOString(),
            date: article.date || new Date().toISOString(),
            source: { name: article.source_name || article.source || 'Unknown' },
            source_name: article.source_name || article.source || 'Unknown',
            sentiment: article.sentiment || 'neutral',
            tickers: article.tickers || [token],
            token,
            image_url: article.image_url || null
          }));
          allArticles.push(...tokenArticles);
        }
      } else {
        const errorText = await response.text();
        console.error(`[News] CryptoNews error for ${token} (${response.status}):`, errorText.substring(0, 200));
        if (response.status === 403) {
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.message && errorData.message.includes('blacklisted')) {
              ipBlacklisted = true;
              break;
            }
          } catch {}
        }
      }
      await new Promise(resolve => setTimeout(resolve, 150));
    } catch (tokenError) {
      console.error(`[News] CryptoNews exception for ${token}:`, tokenError.message);
    }
  }

  if (ipBlacklisted) {
    console.error('CryptoNews API: IP blacklisted');
    return [];
  }
  return allArticles;
}

// ============================================
// MODULE EXPORTS
// ============================================

// Export router as default, plus helper functions
router.fetchNewsForTokens = fetchNewsForTokens;
router.fetchNewsFromCoinDesk = fetchNewsFromCoinDesk;
router.fetchNewsFromCryptoNews = fetchNewsFromCryptoNews;
router.parseRSSFeed = parseRSSFeed;
module.exports = router;
