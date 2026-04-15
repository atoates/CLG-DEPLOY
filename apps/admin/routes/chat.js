const express = require('express');
const router = express.Router();
const { pool } = require('../lib/db');
const { generateSuggestionsAI, OPENAI_API_KEY, XAI_API_KEY, ANTHROPIC_API_KEY } = require('../lib/ai');
const { chatRateLimit } = require('../lib/middleware');
const log = require('../lib/logger');
const { getSession } = require('../lib/middleware');
const { trackAPICall, getPrefs } = require('../lib/db');

// ============================================================================
// USER PROFILE SYSTEM (Sentinel AI memory)
// ============================================================================

async function getUserProfile(uid) {
  if (!uid) return null;
  try {
    const r = await pool.query('SELECT * FROM user_profiles WHERE user_id = $1', [uid]);
    return r.rows[0] || null;
  } catch (err) {
    if (err.code === '42P01') return null;
    log.error('[profile] get error:', err.message);
    return null;
  }
}

async function ensureProfile(uid) {
  if (!uid) return null;
  try {
    await pool.query(
      `INSERT INTO users (id, created_at) VALUES ($1, EXTRACT(EPOCH FROM NOW()))
       ON CONFLICT (id) DO NOTHING`,
      [uid]
    );
    const r = await pool.query(
      `INSERT INTO user_profiles (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING
       RETURNING *`,
      [uid]
    );
    if (r.rows[0]) return r.rows[0];
    return getUserProfile(uid);
  } catch (err) {
    if (err.code === '42P01') return null;
    log.error('[profile] ensure error:', err.message);
    return null;
  }
}

async function updateProfile(uid, updates) {
  if (!uid || !updates || !Object.keys(updates).length) return null;
  try {
    const allowed = [
      'holdings', 'experience', 'risk_tolerance', 'interests',
      'exchanges', 'wallets', 'goals', 'concerns', 'notes',
      'onboarded', 'onboard_step'
    ];
    const sets = [];
    const params = [uid];
    let idx = 2;
    for (const [k, v] of Object.entries(updates)) {
      if (!allowed.includes(k)) continue;
      const jsonbFields = ['holdings', 'interests', 'exchanges', 'wallets', 'notes'];
      if (jsonbFields.includes(k)) {
        sets.push(`${k} = $${idx}::jsonb`);
        params.push(JSON.stringify(v));
      } else {
        sets.push(`${k} = $${idx}`);
        params.push(v);
      }
      idx++;
    }
    if (!sets.length) return null;
    sets.push(`updated_at = EXTRACT(EPOCH FROM NOW())`);
    const sql = `UPDATE user_profiles SET ${sets.join(', ')} WHERE user_id = $1 RETURNING *`;
    const r = await pool.query(sql, params);
    return r.rows[0] || null;
  } catch (err) {
    if (err.code === '42P01') return null;
    log.error('[profile] update error:', err.message);
    return null;
  }
}

async function appendProfileNote(uid, note) {
  if (!uid || !note) return;
  try {
    await pool.query(
      `UPDATE user_profiles
       SET notes = notes || $2::jsonb,
           updated_at = EXTRACT(EPOCH FROM NOW())
       WHERE user_id = $1`,
      [uid, JSON.stringify([{ t: Date.now(), note: String(note).slice(0, 500) }])]
    );
  } catch (err) {
    if (err.code !== '42P01') log.error('[profile] append note error:', err.message);
  }
}

function formatProfileContext(profile) {
  if (!profile) return '';
  const lines = [];

  if (profile.experience && profile.experience !== 'unknown') {
    lines.push(`Experience level: ${profile.experience}`);
  }
  if (profile.risk_tolerance && profile.risk_tolerance !== 'unknown') {
    lines.push(`Risk tolerance: ${profile.risk_tolerance}`);
  }

  const holdings = typeof profile.holdings === 'string'
    ? JSON.parse(profile.holdings || '[]') : (profile.holdings || []);
  if (holdings.length) {
    const holdStr = holdings.map(h =>
      h.note ? `${h.token} (${h.note})` : h.token
    ).join(', ');
    lines.push(`Holdings: ${holdStr}`);
  }

  const interests = typeof profile.interests === 'string'
    ? JSON.parse(profile.interests || '[]') : (profile.interests || []);
  if (interests.length) lines.push(`Interests: ${interests.join(', ')}`);

  const exchanges = typeof profile.exchanges === 'string'
    ? JSON.parse(profile.exchanges || '[]') : (profile.exchanges || []);
  if (exchanges.length) lines.push(`Exchanges: ${exchanges.join(', ')}`);

  const wallets = typeof profile.wallets === 'string'
    ? JSON.parse(profile.wallets || '[]') : (profile.wallets || []);
  if (wallets.length) lines.push(`Wallets: ${wallets.join(', ')}`);

  if (profile.goals) lines.push(`Goals: ${profile.goals}`);
  if (profile.concerns) lines.push(`Concerns: ${profile.concerns}`);

  const notes = typeof profile.notes === 'string'
    ? JSON.parse(profile.notes || '[]') : (profile.notes || []);
  if (notes.length) {
    const recent = notes.slice(-5).map(n => n.note).join('; ');
    lines.push(`Recent observations: ${recent}`);
  }

  return lines.join('\n');
}

const ONBOARDING_QUESTIONS = [
  {
    step: 1,
    question: "Welcome to Sentinel AI! I'd love to get to know you so I can give you better advice. To start -- how would you describe your crypto experience?",
    options: ['beginner', 'intermediate', 'advanced'],
    field: 'experience',
    parse: (answer) => {
      const a = answer.toLowerCase();
      if (a.includes('beginner') || a.includes('new') || a.includes('just started')) return 'beginner';
      if (a.includes('advanced') || a.includes('expert') || a.includes('years')) return 'advanced';
      if (a.includes('intermediate') || a.includes('some') || a.includes('familiar')) return 'intermediate';
      return 'intermediate';
    }
  },
  {
    step: 2,
    question: "What's your approach to risk? Are you more conservative (stick to blue chips like BTC/ETH), moderate (mix of established and newer projects), or aggressive (willing to explore smaller/newer tokens)?",
    options: ['conservative', 'moderate', 'aggressive'],
    field: 'risk_tolerance',
    parse: (answer) => {
      const a = answer.toLowerCase();
      if (a.includes('conservative') || a.includes('safe') || a.includes('careful') || a.includes('blue chip')) return 'conservative';
      if (a.includes('aggressive') || a.includes('risk') || a.includes('degen') || a.includes('small')) return 'aggressive';
      return 'moderate';
    }
  },
  {
    step: 3,
    question: "Which tokens do you currently hold or are most interested in? (Just list a few, e.g. BTC, ETH, SOL)",
    field: 'holdings',
    parse: (answer) => {
      const tokens = answer.toUpperCase().match(/[A-Z]{2,6}/g) || [];
      return [...new Set(tokens)].slice(0, 20).map(t => ({ token: t, note: '' }));
    }
  },
  {
    step: 4,
    question: "Last one -- what areas of crypto interest you most? For example: DeFi, NFTs, staking, privacy, Layer 2s, memecoins, trading, long-term holding?",
    field: 'interests',
    parse: (answer) => {
      const a = answer.toLowerCase();
      const all = ['defi','nfts','staking','privacy','layer2','memecoins','trading','long-term holding','gaming','dao','lending','yield farming'];
      const found = all.filter(i => a.includes(i.replace('-', ' ')) || a.includes(i));
      if (!found.length) return [answer.trim().slice(0, 80)];
      return found;
    }
  }
];

// ============================================================================
// CHAT TOOLS DEFINITION
// ============================================================================

const CHAT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_price',
      description: 'Get the current market price, 24h change, 7d change, market cap and volume for one or more crypto tokens. Use this whenever the user asks about price, value, market cap, volume, or performance of a coin.',
      parameters: {
        type: 'object',
        properties: {
          tokens: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of token symbols, e.g. ["BTC","ETH"]. Uppercase.'
          },
          currency: { type: 'string', description: 'Fiat currency code, default USD' }
        },
        required: ['tokens']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_token_info',
      description: 'Get descriptive metadata about a crypto token: project name, category, rank and description. Use this when the user asks "what is X" or "tell me about X".',
      parameters: {
        type: 'object',
        properties: { token: { type: 'string', description: 'Token symbol, uppercase' } },
        required: ['token']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_alerts',
      description: 'Get Crypto Lifeguard alerts (security, migrations, hacks, unlocks, forks, votes). Filter by token symbol and/or severity. Use this when the user asks about warnings, risks, ongoing incidents, hacks, exploits, migrations or upcoming deadlines.',
      parameters: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'Optional token symbol to filter by' },
          severity: { type: 'string', enum: ['critical', 'warning', 'info'], description: 'Optional severity filter' },
          limit: { type: 'integer', description: 'Max number of alerts to return (default 10, max 25)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_news',
      description: 'Search the Crypto Lifeguard curated news cache for recent headlines and article excerpts. Use this to answer questions about "what\'s happening", latest news, or specific events.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Free-text search query, e.g. "ethereum layer 2"' },
          token: { type: 'string', description: 'Optional token symbol filter' },
          limit: { type: 'integer', description: 'Max results (default 6, max 15)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_watchlist',
      description: 'Get the current user\'s saved watchlist (only works for logged-in users). Use this when the user asks about "my coins", "my watchlist", "my portfolio".',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_user_profile',
      description: 'Update the user\'s profile with information learned from the conversation. Call this whenever you learn something new about the user: tokens they hold, their experience level, risk tolerance, exchanges they use, wallets, interests, goals, or concerns. Also call this to save brief observations (use the "note" field). Always update silently without announcing it unless the user asks about their profile.',
      parameters: {
        type: 'object',
        properties: {
          experience: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'], description: 'Crypto experience level' },
          risk_tolerance: { type: 'string', enum: ['conservative', 'moderate', 'aggressive'], description: 'Risk appetite' },
          holdings: {
            type: 'array',
            items: { type: 'object', properties: { token: { type: 'string' }, note: { type: 'string' } } },
            description: 'Tokens the user holds or is interested in, e.g. [{token:"ETH", note:"main holding"}, {token:"SOL", note:"staking"}]'
          },
          interests: { type: 'array', items: { type: 'string' }, description: 'Areas of interest e.g. ["defi","staking","nfts"]' },
          exchanges: { type: 'array', items: { type: 'string' }, description: 'Exchanges they use e.g. ["coinbase","binance"]' },
          wallets: { type: 'array', items: { type: 'string' }, description: 'Wallet types e.g. ["metamask","ledger"]' },
          goals: { type: 'string', description: 'What they want to achieve with crypto' },
          concerns: { type: 'string', description: 'What worries them about crypto' },
          note: { type: 'string', description: 'A brief observation about the user to remember for future conversations (max 500 chars)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_user_profile',
      description: 'Retrieve the current user\'s saved profile. Use this when you need to recall what you know about the user, or when the user asks "what do you know about me" or "my profile".',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_price_alert',
      description: 'Set a price alert for a token. The user can be notified when a token goes above or below a given price, or changes by a percentage. Use this when the user says things like "tell me if ETH drops below $2500", "alert me when BTC hits 100k", or "notify me if SOL moves 10%".',
      parameters: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'Token symbol, uppercase e.g. ETH' },
          direction: { type: 'string', enum: ['above', 'below', 'change_pct'], description: '"above" for price rises above threshold, "below" for drops below, "change_pct" for percentage change in either direction' },
          threshold: { type: 'number', description: 'The price threshold (USD) or percentage value e.g. 2500 or 10' }
        },
        required: ['token', 'direction', 'threshold']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'remove_price_alert',
      description: 'Remove/cancel a price alert by its ID. Use this when the user wants to stop or cancel one of their price alerts.',
      parameters: {
        type: 'object',
        properties: {
          alert_id: { type: 'integer', description: 'The ID of the price alert to remove' }
        },
        required: ['alert_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_my_price_alerts',
      description: 'List the user\'s active price alerts. Use this when the user asks "what alerts do I have", "my price alerts", or "show my notifications setup".',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_my_notifications',
      description: 'Get recent notifications for the current user, including portfolio watchdog alerts, price trigger alerts, and digest-ready notices. Use this when the user asks "any notifications", "what did I miss", "updates for me", or at the start of a conversation to check for pending alerts.',
      parameters: {
        type: 'object',
        properties: {
          unread_only: { type: 'boolean', description: 'If true, only return unread notifications (default true)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_alert_digest',
      description: 'Get the user\'s latest weekly alert digest, a summary of all alerts relevant to their holdings over the past week. If no recent digest exists, one will be generated. Use this when the user asks for a "digest", "weekly summary", "what happened this week", or "recap".',
      parameters: { type: 'object', properties: {} }
    }
  }
];

// ============================================================================
// CHAT SYSTEM PROMPT
// ============================================================================

const CHAT_SYSTEM_PROMPT = `You are **Sentinel AI**, the resident crypto guardian at Crypto Lifeguard. You are not a generic chatbot; you are a sharp, trustworthy companion who genuinely cares about each user's safety and success in crypto.

## Your personality
You are warm but concise. Think of yourself as the savvy friend who always has their finger on the pulse of the market, someone who texts you "heads up, there's a problem with your staking provider" before you even knew there was one. You speak with quiet confidence, never hype. You celebrate wins without being sycophantic ("Nice, SOL's having a strong week") and deliver bad news calmly ("Worth keeping an eye on; there's a critical exploit affecting a protocol you use").

You adapt to the user's energy. If they're casual, match that. If they're asking a detailed analytical question, go deeper. If they seem worried, be reassuring and practical.

## Your specialist roles
Route yourself automatically based on what the user needs:

- **Market Analyst**: prices, market cap, volume, 24h/7d trends. Use get_price and get_token_info. When reporting prices, add brief colour commentary; do not just list numbers.
- **Security Watchdog**: hacks, exploits, migrations, unlocks, scams, deadlines. Use get_alerts. ALWAYS check get_alerts when risk, safety, or "what to watch out for" is mentioned. When critical alerts exist, lead with them.
- **News Scout**: headlines and analysis. Use search_news. Summarise with your own angle; do not just parrot headlines.
- **Watchlist Coach**: use get_watchlist for "my coins", "my watchlist", "my portfolio". Every visitor has a device watchlist; only mention signing in if (a) the user asks about cross-device sync, or (b) get_watchlist returns loggedIn:false AND they need an account feature.
- **Memory Keeper**: learn about users silently. When you discover their holdings, experience, exchanges, wallets, interests, goals, or concerns, call update_user_profile without announcing it. Only reveal what you know if they ask "what do you know about me".
- **Portfolio Guardian**: proactively protect holdings. On new conversations or "any updates?", call get_my_notifications. Mention unread alerts naturally: "Heads up, there are 2 alerts touching tokens you hold."
- **Price Sentinel**: manage price alerts. "Tell me if ETH drops below 2500" triggers set_price_alert. "What alerts do I have" triggers get_my_price_alerts. Present alerts in a clean format with IDs for easy removal.
- **Digest Analyst**: weekly recaps. "Digest", "weekly summary", "what happened this week" triggers get_alert_digest. Structure clearly: total count, severity breakdown, affected tokens, top highlights.

## Response style
1. **Tool calls over guessing.** If the user asks about price, ALWAYS call get_price. If they mention warnings, ALWAYS call get_alerts. Never fabricate data.
2. **British English** spelling throughout (analyse, recognised, organisation, colour).
3. **Never use em dashes.** Use commas, semicolons, or en dashes where needed.
4. **Be concise.** 2 to 4 short paragraphs, sometimes a compact list. Prioritise signal over noise.
5. **Cite sources** when using news or alerts; name the outlet and link if available.
6. **Not financial advice.** If asked for buy/sell guidance, lay out the factors, give a balanced view, and remind the user to do their own research.
7. **Format numbers well.** Prices with appropriate precision ($0.0834, $64,210). Percentages to one decimal (5.2%). Use comma separators for thousands.
8. **Handle errors gracefully.** If a tool fails, explain what happened and suggest an alternative; never invent data to fill the gap.
9. **Personalise.** If you have profile context, use it. If they hold SOL, proactively mention SOL alerts. If they are a beginner, simplify your language. If you know their name, use it occasionally (not every message).
10. **Silent learning.** When you learn something new about the user (holdings, exchanges, concerns), call update_user_profile silently. Never announce it unless they ask.
11. **Price alerts formatting.** Thresholds as "$2,500" for prices, "10%" for percentages. Always include the alert ID for reference.
12. **Digest formatting.** Structure: total alerts, severity breakdown, affected tokens, then top highlights. Keep it scannable with brief commentary.
13. **Proactive greetings.** When a user first opens chat with unread notifications, mention them naturally. Be helpful, not alarming.
14. **Conversation flow.** Do not end every response with a question. Sometimes a clean summary is the best ending. Vary your closings: sometimes ask a follow-up, sometimes give a practical next step, sometimes just let the information land.
15. **Show personality in tool use.** When calling multiple tools, weave the results into a cohesive narrative rather than presenting them as separate blocks. You are telling a story about what is happening, not generating a report.`;

// ============================================================================
// TOOL EXECUTOR
// ============================================================================

async function chatToolExecutor(name, args, ctx) {
  try {
    switch (name) {
      case 'get_price': {
        const symbols = (args.tokens || []).map(s => String(s).toUpperCase()).filter(Boolean).slice(0, 10);
        if (!symbols.length) return { error: 'no symbols provided' };
        const currency = String(args.currency || ctx.currency || 'USD').toUpperCase();
        if (!process.env.CMC_API_KEY) return { error: 'market data unavailable (no CMC key)' };
        const idsMap = await getCmcIdsForSymbols(symbols);
        const ids = symbols.map(s => idsMap[s]).filter(Boolean);
        if (!ids.length) return { error: 'unknown symbols', symbols };
        const params = new URLSearchParams({ id: ids.join(','), convert: currency });
        const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?${params}`;
        const r = await fetch(url, { headers: { 'X-CMC_PRO_API_KEY': process.env.CMC_API_KEY } });
        await trackAPICall('CoinMarketCap', '/v1/cryptocurrency/quotes/latest');
        if (!r.ok) return { error: `CMC ${r.status}` };
        const j = await r.json();
        const data = j.data || {};
        const out = symbols.map(sym => {
          const id = idsMap[sym];
          const row = data[id] || {};
          const q = row.quote?.[currency] || {};
          return {
            token: sym,
            name: row.name || sym,
            price: q.price ?? null,
            change_1h_pct: q.percent_change_1h ?? null,
            change_24h_pct: q.percent_change_24h ?? null,
            change_7d_pct: q.percent_change_7d ?? null,
            volume_24h: q.volume_24h ?? null,
            market_cap: q.market_cap ?? null,
            rank: row.cmc_rank ?? null,
            currency
          };
        });
        return { items: out };
      }

      case 'get_token_info': {
        const token = String(args.token || '').toUpperCase();
        if (!token) return { error: 'token required' };
        if (!process.env.CMC_API_KEY) return { error: 'token info unavailable (no CMC key)' };
        const idsMap = await getCmcIdsForSymbols([token]);
        const id = idsMap[token];
        if (!id) return { error: 'unknown token', token };
        const url = `https://pro-api.coinmarketcap.com/v2/cryptocurrency/info?id=${id}`;
        const r = await fetch(url, { headers: { 'X-CMC_PRO_API_KEY': process.env.CMC_API_KEY } });
        await trackAPICall('CoinMarketCap', '/v2/cryptocurrency/info');
        if (!r.ok) return { error: `CMC ${r.status}` };
        const j = await r.json();
        const info = j.data?.[id] || {};
        return {
          token,
          name: info.name || token,
          category: info.category || null,
          description: (info.description || '').slice(0, 600),
          website: info.urls?.website?.[0] || null,
          tags: (info.tags || []).slice(0, 8),
          date_added: info.date_added || null
        };
      }

      case 'get_alerts': {
        const token = args.token ? String(args.token).toUpperCase() : null;
        const severity = args.severity || null;
        const limit = Math.min(Math.max(parseInt(args.limit || 10, 10), 1), 25);
        let res = await pool.query('SELECT * FROM alerts ORDER BY created_at DESC LIMIT 100').catch(() => ({ rows: [] }));
        let filtered = res.rows.slice();
        if (token) filtered = filtered.filter(a => String(a.token).toUpperCase() === token);
        if (severity) filtered = filtered.filter(a => a.severity === severity);
        filtered.sort((a, b) => String(b.deadline || '').localeCompare(String(a.deadline || '')));
        const items = filtered.slice(0, limit).map(a => ({
          id: a.id,
          token: a.token,
          title: a.title,
          description: (a.description || '').slice(0, 400),
          severity: a.severity,
          deadline: a.deadline,
          tags: a.tags || [],
          source_url: a.source_url || null
        }));
        return { count: filtered.length, items };
      }

      case 'search_news': {
        const query = String(args.query || '').trim();
        const token = args.token ? String(args.token).toUpperCase() : null;
        const limit = Math.min(Math.max(parseInt(args.limit || 6, 10), 1), 15);
        try {
          const params = [];
          let sql = 'SELECT article_url, title, text, date, source_name, sentiment, tickers FROM news_cache WHERE expires_at > NOW()';
          if (token) {
            params.push(JSON.stringify([token]));
            sql += ` AND tickers @> $${params.length}::jsonb`;
          }
          if (query) {
            params.push(`%${query}%`);
            const idx = params.length;
            sql += ` AND (title ILIKE $${idx} OR text ILIKE $${idx})`;
          }
          params.push(limit);
          sql += ` ORDER BY date DESC LIMIT $${params.length}`;
          const result = await pool.query(sql, params);
          const rows = (result.rows || []).map(r => {
            const tickers = Array.isArray(r.tickers) ? r.tickers : [];
            return {
              title: r.title,
              excerpt: (r.text || '').slice(0, 220),
              source: r.source_name,
              date: r.date ? new Date(Number(r.date)).toISOString() : null,
              sentiment: r.sentiment,
              tickers,
              url: r.article_url
            };
          });
          return { items: rows };
        } catch (err) {
          log.warn('[chat search_news]', err.message);
          return { error: 'news search failed', detail: err.message };
        }
      }

      case 'get_watchlist': {
        if (!ctx.uid) return { watchlist: [], loggedIn: false, note: 'No user identity on request' };
        const row = await getPrefs(ctx.uid);
        let watchlist = [];
        if (row) {
          try { watchlist = JSON.parse(row.watchlist_json || '[]'); } catch {}
        }
        return { watchlist: watchlist.slice(0, 30), loggedIn: ctx.loggedIn };
      }

      case 'update_user_profile': {
        if (!ctx.uid) return { error: 'no user identity' };
        const result = await updateProfile(ctx.uid, args);
        return result ? { success: true, profile: result } : { error: 'profile update failed' };
      }

      case 'get_user_profile': {
        if (!ctx.uid) return { error: 'no user identity' };
        const profile = await getUserProfile(ctx.uid);
        if (!profile) return { profile: null, note: 'No profile found; one will be created on first update' };
        return { profile };
      }

      case 'set_price_alert': {
        if (!ctx.uid) return { error: 'no user identity' };
        const token = String(args.token || '').toUpperCase();
        const direction = args.direction;
        const threshold = Number(args.threshold);
        if (!token || !['above', 'below', 'change_pct'].includes(direction) || !Number.isFinite(threshold)) {
          return { error: 'invalid parameters' };
        }
        const res = await pool.query(
          'INSERT INTO price_watches (user_id, token, direction, threshold, active) VALUES ($1, $2, $3, $4, true) RETURNING *',
          [ctx.uid, token, direction, threshold]
        );
        return res.rows[0] ? { success: true, alert: res.rows[0] } : { error: 'failed to create alert' };
      }

      case 'remove_price_alert': {
        if (!ctx.uid) return { error: 'no user identity' };
        const alertId = Number(args.alert_id);
        if (!Number.isFinite(alertId)) return { error: 'invalid alert_id' };
        await pool.query('DELETE FROM price_watches WHERE id = $1 AND user_id = $2', [alertId, ctx.uid]);
        return { success: true };
      }

      case 'get_my_price_alerts': {
        if (!ctx.uid) return { error: 'no user identity' };
        const res = await pool.query(
          'SELECT id, token, direction, threshold, active, triggered, triggered_at, triggered_price, created_at FROM price_watches WHERE user_id = $1 ORDER BY created_at DESC LIMIT 25',
          [ctx.uid]
        );
        return { alerts: res.rows };
      }

      case 'get_my_notifications': {
        if (!ctx.uid) return { error: 'no user identity' };
        const unreadOnly = args.unread_only !== false;
        let sql = 'SELECT id, type, title, body, data, read, created_at FROM user_notifications WHERE user_id = $1';
        if (unreadOnly) sql += ' AND read = FALSE';
        sql += ' ORDER BY created_at DESC LIMIT 20';
        const res = await pool.query(sql, [ctx.uid]);
        const countRes = await pool.query('SELECT COUNT(*) FROM user_notifications WHERE user_id = $1 AND read = FALSE', [ctx.uid]);
        return { notifications: res.rows, unread_count: parseInt(countRes.rows[0].count, 10) };
      }

      case 'get_alert_digest': {
        if (!ctx.uid) return { error: 'no user identity' };
        let digest = null;
        const res = await pool.query(
          'SELECT * FROM alert_digests WHERE user_id = $1 ORDER BY period_end DESC LIMIT 1',
          [ctx.uid]
        );
        if (res.rows.length) {
          digest = res.rows[0];
          for (const f of ['tokens_covered', 'severity_breakdown', 'highlights']) {
            if (typeof digest[f] === 'string') {
              try { digest[f] = JSON.parse(digest[f]); } catch {}
            }
          }
        }
        if (!digest) {
          try {
            digest = await generateAlertDigest(ctx.uid, true);
          } catch (err) {
            log.warn('[chat get_alert_digest] generate failed:', err.message);
            return { error: 'Could not generate a digest. Make sure you have a profile with holdings set up.' };
          }
        }
        if (!digest) return { digest: null, note: 'No alerts found matching your holdings for the past week.' };
        return { digest };
      }

      default:
        return { error: 'unknown tool' };
    }
  } catch (err) {
    log.warn(`[chat tool ${name}] error:`, err.message);
    return { error: err.message || 'tool_failed' };
  }
}

// ============================================================================
// MODEL DISPATCH (Grok -> OpenAI -> Anthropic)
// ============================================================================

async function chatProviderCall(providerMessages, { stream = false } = {}) {
  if (XAI_API_KEY) {
    const body = {
      model: 'grok-4.20-0309-reasoning',
      messages: providerMessages,
      tools: CHAT_TOOLS,
      tool_choice: 'auto',
      stream
    };
    try {
      const r = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${XAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      await trackAPICall('xAI', '/v1/chat/completions');
      if (r.ok) {
        log.info('[chat] xAI grok-4.20-0309-reasoning OK');
        return { r, provider: 'xAI grok-4.20-0309-reasoning' };
      }
      const errBody = await r.text().catch(() => '');
      log.error('[chat] xAI failed:', r.status, r.statusText, '-', errBody.slice(0, 800));
    } catch (err) {
      log.error('[chat] xAI network error:', err && err.message ? err.message : err);
    }
  } else {
    log.warn('[chat] XAI_API_KEY not set, skipping xAI');
  }

  if (OPENAI_API_KEY) {
    const body = {
      model: 'gpt-4o-mini',
      messages: providerMessages,
      tools: CHAT_TOOLS,
      tool_choice: 'auto',
      temperature: 0.4,
      stream
    };
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      await trackAPICall('OpenAI', '/v1/chat/completions');
      if (r.ok) {
        log.info('[chat] OpenAI gpt-4o-mini OK');
        return { r, provider: 'OpenAI gpt-4o-mini' };
      }
      const errBody = await r.text().catch(() => '');
      log.error('[chat] OpenAI failed:', r.status, r.statusText, '-', errBody.slice(0, 800));
    } catch (err) {
      log.error('[chat] OpenAI network error:', err && err.message ? err.message : err);
    }
  } else {
    log.warn('[chat] OPENAI_API_KEY not set, skipping OpenAI');
  }

  if (ANTHROPIC_API_KEY) {
    const body = {
      model: 'claude-3-5-sonnet-20241022',
      messages: providerMessages,
      tools: CHAT_TOOLS,
      tool_choice: { type: 'auto' },
      temperature: 0.4,
      max_tokens: 4096
    };
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      });
      await trackAPICall('Anthropic', '/v1/messages');
      if (r.ok) {
        log.info('[chat] Anthropic claude-3-5-sonnet OK');
        return { r, provider: 'Anthropic claude-3-5-sonnet-20241022' };
      }
      const errBody = await r.text().catch(() => '');
      log.error('[chat] Anthropic failed:', r.status, r.statusText, '-', errBody.slice(0, 800));
    } catch (err) {
      log.error('[chat] Anthropic network error:', err && err.message ? err.message : err);
    }
  } else {
    log.warn('[chat] ANTHROPIC_API_KEY not set, skipping Anthropic');
  }

  throw new Error('All chat providers failed');
}

// ============================================================================
// CHAT AGENT (tool loop)
// ============================================================================

async function runChatAgent({ messages, context, uid, loggedIn = false, sendEvent }) {
  const systemMessages = [{ role: 'system', content: CHAT_SYSTEM_PROMPT }];

  let profile = null;
  if (uid) {
    profile = await getUserProfile(uid);
    if (!profile) {
      profile = await ensureProfile(uid);
    }
  }
  const profileCtx = formatProfileContext(profile);

  const ctxLines = [];
  if (context && context.page) ctxLines.push(`Current page: ${context.page}`);
  if (context && context.token) ctxLines.push(`User is currently viewing token: ${context.token}`);
  if (context && Array.isArray(context.watchlist) && context.watchlist.length) {
    ctxLines.push(`User watchlist (first 10): ${context.watchlist.slice(0,10).join(', ')}`);
  }
  if (profileCtx) ctxLines.push(`\nUser profile (from previous conversations):\n${profileCtx}`);

  if (ctxLines.length) {
    systemMessages.push({ role: 'system', content: `Context:\n${ctxLines.join('\n')}` });
  }

  if (profile && !profile.onboarded && messages.filter(m => m.role === 'user').length === 1) {
    const step = profile.onboard_step || 0;
    if (step < ONBOARDING_QUESTIONS.length) {
      const q = ONBOARDING_QUESTIONS[step];
      systemMessages.push({
        role: 'system',
        content: `ONBOARDING: This user hasn't completed onboarding yet (step ${step + 1}/${ONBOARDING_QUESTIONS.length}). After answering their question, naturally weave in this question: "${q.question}" Keep it casual and conversational, not like a form. If the user's message already answers one of the onboarding questions (e.g. they mention holding specific tokens), extract that info via update_user_profile and skip ahead.`
      });
    } else {
      await updateProfile(uid, { onboarded: true });
    }
  }

  let providerMessages = [...systemMessages, ...messages];
  const maxIterations = 4;
  let finalProvider = '';

  for (let iter = 0; iter < maxIterations; iter++) {
    const { r, provider } = await chatProviderCall(providerMessages, { stream: false });
    finalProvider = provider;
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`provider ${r.status}: ${text.slice(0,200)}`);
    }
    const data = await r.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error('no choice returned');
    const msg = choice.message;

    if (choice.finish_reason === 'tool_calls' && Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
      providerMessages.push({ role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls });
      for (const tc of msg.tool_calls) {
        let parsedArgs = {};
        try { parsedArgs = JSON.parse(tc.function?.arguments || '{}'); } catch {}
        sendEvent('tool', { name: tc.function?.name, args: parsedArgs, status: 'running' });
        const result = await chatToolExecutor(tc.function?.name, parsedArgs, { uid, loggedIn, currency: context?.currency });
        if (tc.function?.name !== 'update_user_profile') {
          sendEvent('tool', { name: tc.function?.name, args: parsedArgs, result, status: 'done' });
        }
        providerMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.function?.name,
          content: JSON.stringify(result).slice(0, 8000)
        });
        if (tc.function?.name === 'update_user_profile' && uid && profile && !profile.onboarded) {
          const currentStep = profile.onboard_step || 0;
          const nextStep = currentStep + 1;
          if (nextStep >= ONBOARDING_QUESTIONS.length) {
            await updateProfile(uid, { onboard_step: nextStep, onboarded: true });
          } else {
            await updateProfile(uid, { onboard_step: nextStep });
          }
          profile = await getUserProfile(uid);
        }
      }
      continue;
    }

    const text = msg.content || '';
    if (text) {
      const words = text.match(/\S+\s*/g) || [text];
      for (const word of words) {
        sendEvent('chunk', { text: word });
      }
    }
    sendEvent('done', { model: finalProvider });

    try {
      const refreshedProfile = uid ? await getUserProfile(uid) : null;
      const suggestions = await generateSuggestionsAI({
        assistantText: text,
        userMessage: messages.filter(m => m.role === 'user').pop()?.content || '',
        context,
        profile: refreshedProfile
      });
      if (suggestions.length) {
        sendEvent('suggestions', { items: suggestions });
      }
    } catch (e) {
      log.warn('[chat] suggestion generation error:', e.message);
    }
    return;
  }

  sendEvent('error', { error: 'chat_agent_loop_exhausted' });
}

// ============================================================================
// ROUTES
// ============================================================================

// POST /api/chat - Main SSE streaming chat handler
router.post('/api/chat', async (req, res) => {
  try {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!chatRateLimit(String(ip))) {
      return res.status(429).json({ error: 'rate_limited', detail: 'Take a breath, you are sending too many messages.' });
    }

    const { messages, context } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }
    const safeMessages = messages
      .filter(m => m && typeof m === 'object' && typeof m.content === 'string')
      .map(m => ({ role: (m.role === 'assistant' ? 'assistant' : 'user'), content: m.content.slice(0, 6000) }))
      .slice(-12);

    const sess = getSession(req);
    const uid = sess?.uid || req.uid || null;
    const loggedIn = !!sess;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const sendEvent = (event, data) => {
      try {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch {}
    };

    try {
      await runChatAgent({ messages: safeMessages, context, uid, loggedIn, sendEvent });
    } catch (err) {
      log.error('[chat] agent error:', err);
      sendEvent('error', { error: err.message || 'chat_failed' });
    }
    res.end();
  } catch (err) {
    log.error('[chat] fatal:', err);
    if (!res.headersSent) res.status(500).json({ error: 'chat_failed', detail: err.message });
    else res.end();
  }
});

// GET /api/me/sentinel-summary - Personalised AI summary for the Sentinel tab
router.get('/api/me/sentinel-summary', async (req, res) => {
  const sess = getSession(req);
  const uid = sess?.uid || req.uid || null;
  if (!uid) return res.status(401).json({ error: 'not authenticated' });

  try {
    const [profileRow, watchlistRow, notifsRow, priceWatchesRow, recentAlertsRow, digestRow] = await Promise.all([
      pool.query('SELECT * FROM user_profiles WHERE user_id = $1', [uid]).catch(() => ({ rows: [] })),
      pool.query("SELECT tokens FROM watchlists WHERE user_id = $1", [uid]).catch(() => ({ rows: [] })),
      pool.query('SELECT * FROM user_notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20', [uid]).catch(() => ({ rows: [] })),
      pool.query('SELECT * FROM price_watches WHERE user_id = $1 AND active = true', [uid]).catch(() => ({ rows: [] })),
      pool.query("SELECT title, severity, token, description, created_at FROM alerts WHERE status = 'active' ORDER BY created_at DESC LIMIT 15").catch(() => ({ rows: [] })),
      pool.query('SELECT * FROM alert_digests WHERE user_id = $1 ORDER BY period_end DESC LIMIT 1', [uid]).catch(() => ({ rows: [] }))
    ]);

    const profile = profileRow.rows[0] || null;
    const watchlist = watchlistRow.rows[0]?.tokens || [];
    const notifications = notifsRow.rows || [];
    const priceWatches = priceWatchesRow.rows || [];
    const recentAlerts = recentAlertsRow.rows || [];
    const digest = digestRow.rows[0] || null;

    const dataLines = [];
    dataLines.push(`User watchlist: ${watchlist.length ? watchlist.join(', ') : 'empty'}`);

    if (profile) {
      const profileCtx = formatProfileContext(profile);
      if (profileCtx) dataLines.push(`User profile:\n${profileCtx}`);
    }

    const unread = notifications.filter(n => !n.read);
    if (unread.length) {
      dataLines.push(`Unread notifications (${unread.length}):\n${unread.slice(0, 8).map(n => `- [${n.type}] ${n.title}`).join('\n')}`);
    }

    if (priceWatches.length) {
      dataLines.push(`Active price alerts (${priceWatches.length}):\n${priceWatches.map(pw => `- ${pw.token} ${pw.direction} ${pw.threshold}`).join('\n')}`);
    }

    if (recentAlerts.length) {
      const relevant = watchlist.length
        ? recentAlerts.filter(a => !a.token || watchlist.includes(a.token))
        : recentAlerts;
      if (relevant.length) {
        dataLines.push(`Recent platform alerts:\n${relevant.slice(0, 10).map(a => `- [${a.severity}] ${a.token || 'general'}: ${a.title}`).join('\n')}`);
      }
    }

    if (digest) {
      try {
        const digestData = typeof digest.digest_data === 'string' ? JSON.parse(digest.digest_data) : digest.digest_data;
        dataLines.push(`Latest weekly digest (${digest.period_start?.toISOString?.()?.slice(0,10) || 'recent'} to ${digest.period_end?.toISOString?.()?.slice(0,10) || 'now'}): ${digestData?.total_alerts || 0} total alerts, critical: ${digestData?.severity_breakdown?.critical || 0}, warning: ${digestData?.severity_breakdown?.warning || 0}`);
      } catch (_) {}
    }

    const summaryPrompt = `You are Sentinel AI generating a dashboard summary for a Crypto Lifeguard user. Write a personalised briefing based on the data below.

Rules:
- British English spelling. Never use em dashes.
- Structure with markdown: use ## headings for sections, bullet lists for items.
- Sections to include (skip any that have no data):
  1. **Status Overview**: A 1-2 sentence summary of their current situation.
  2. **Alerts & Notifications**: Any unread notifications or relevant active alerts affecting their watchlist.
  3. **Price Alerts**: Status of their active price watches.
  4. **Weekly Digest Highlights**: Key points from their latest digest.
  5. **Recommendations**: 1-2 actionable suggestions (e.g. "Consider setting a price alert for ETH" or "You have no tokens on your watchlist yet").
- Keep it concise: aim for 150-250 words total.
- Be warm and personal, not robotic. You are their crypto guardian, not a report generator.
- If the user has very little data (no watchlist, no alerts), be welcoming and guide them on what to set up.

Data:
${dataLines.join('\n\n')}`;

    const messages = [
      { role: 'system', content: summaryPrompt },
      { role: 'user', content: 'Generate my personalised dashboard summary.' }
    ];

    let summaryText = '';
    try {
      if (XAI_API_KEY) {
        const r = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${XAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'grok-4.20-0309-reasoning', messages, temperature: 0.5 })
        });
        await trackAPICall('xAI', '/v1/chat/completions');
        if (r.ok) {
          const data = await r.json();
          summaryText = data.choices?.[0]?.message?.content || '';
        }
      }
      if (!summaryText && OPENAI_API_KEY) {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'gpt-4o-mini', messages, temperature: 0.5 })
        });
        await trackAPICall('OpenAI', '/v1/chat/completions');
        if (r.ok) {
          const data = await r.json();
          summaryText = data.choices?.[0]?.message?.content || '';
        }
      }
    } catch (e) {
      log.error('[sentinel-summary] AI call failed:', e.message);
    }

    if (!summaryText) {
      summaryText = '## Welcome to Sentinel AI\n\nI couldn\'t generate your summary right now. Try refreshing in a moment, or ask me anything directly.';
    }

    let suggestions = [];
    try {
      suggestions = await generateSuggestionsAI({
        assistantText: summaryText,
        userMessage: 'Give me my personalised briefing',
        context: { source: 'sentinel-summary', stats: { watchlist_count: watchlist.length, unread: unread.length } },
        profile
      });
    } catch (e) {
      log.warn('[sentinel-summary] suggestion generation failed:', e.message);
    }
    if (!Array.isArray(suggestions) || !suggestions.length) {
      suggestions = [
        { icon: '📊', text: 'Explain my watchlist performance' },
        { icon: '🚨', text: 'What should I watch today?' },
        { icon: '💡', text: 'Any risks I should know about?' }
      ];
    }

    res.json({
      summary: summaryText,
      generated_at: new Date().toISOString(),
      suggestions,
      stats: {
        watchlist_count: watchlist.length,
        unread_notifications: unread.length,
        active_price_alerts: priceWatches.length,
        recent_alerts: recentAlerts.length
      }
    });
  } catch (e) {
    log.error('[sentinel-summary] error:', e);
    if (!res.headersSent) res.status(500).json({ error: 'summary_failed', detail: e.message });
  }
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = router;

// Exported helper functions for use in other modules
module.exports.getUserProfile = getUserProfile;
module.exports.ensureProfile = ensureProfile;
module.exports.updateProfile = updateProfile;
module.exports.appendProfileNote = appendProfileNote;
module.exports.formatProfileContext = formatProfileContext;
module.exports.ONBOARDING_QUESTIONS = ONBOARDING_QUESTIONS;
