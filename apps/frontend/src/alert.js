/* ============================================================================
 * Crypto Lifeguard — Alert detail page
 * ----------------------------------------------------------------------------
 * Deep-dive view for a single alert. Shows:
 *   - Full alert card (title, severity, description, further info, source)
 *   - Live token snapshot (price, 24h/7d change, market cap, volume)
 *   - 7-day mini price chart (SVG sparkline)
 *   - Lifeguard AI generated analysis, streamed via /api/chat SSE
 *   - Other active alerts for the same token
 *   - Recent news for the same token
 * ========================================================================== */

// ---- API base resolver (matches app.js / chat.js) -------------------------
function getApiBaseUrl() {
  const injected = (typeof window !== 'undefined' && window.BACKEND_URL) ? window.BACKEND_URL : '';
  if (injected && injected !== '__BACKEND_URL__') return injected;
  try {
    const host = window.location.hostname || '';
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return 'https://clg-admin-production.up.railway.app';
    }
  } catch {}
  return '';
}
const API_BASE = getApiBaseUrl();
const apiUrl = (p) => `${API_BASE}${p}`;

// ---- DOM helpers ----------------------------------------------------------
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children || [])) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Minimal safe markdown renderer (matches chat.js so AI output looks
// consistent with the floating widget).
function renderMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+?)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>');
  html = html.replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noreferrer noopener">$2</a>');
  const lines = html.split('\n');
  const out = [];
  let inList = false;
  for (const line of lines) {
    const m = line.match(/^\s*[-*]\s+(.*)$/);
    if (m) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${m[1]}</li>`);
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      if (line.trim() === '') out.push('<br>');
      else out.push(`<p>${line}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('');
}

// ---- Formatting helpers ---------------------------------------------------
function fmtPrice(v, currency = 'USD') {
  if (v == null || !isFinite(v)) return '—';
  try {
    const digits = v >= 100 ? 2 : v >= 1 ? 3 : v >= 0.01 ? 4 : 6;
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: digits }).format(v);
  } catch {
    return `${currency} ${Number(v).toFixed(2)}`;
  }
}
function fmtBigNum(v) {
  if (v == null || !isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e12) return (v / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return (v / 1e3).toFixed(2) + 'K';
  return String(Math.round(v));
}
function fmtPct(v) {
  if (v == null || !isFinite(v)) return '—';
  const s = v >= 0 ? '+' : '';
  return `${s}${v.toFixed(1)}%`;
}
function fmtTimeLeft(ms) {
  if (!isFinite(ms)) return 'No deadline';
  const past = ms < 0;
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 86400000);
  const hours = Math.floor((abs % 86400000) / 3600000);
  const mins = Math.floor((abs % 3600000) / 60000);
  const label = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  return past ? `${label} ago` : `Due in ${label}`;
}
function fmtRelative(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const diffMs = Date.now() - d.getTime();
  const h = Math.floor(diffMs / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

// ---- Severity meta --------------------------------------------------------
const SEVERITY_META = {
  critical: { label: 'Critical', icon: '⚠️' },
  warning:  { label: 'Warning',  icon: '⚡' },
  info:     { label: 'Info',     icon: 'ℹ️' }
};

const SOURCE_TYPE_META = {
  'anonymous':        { icon: '👤', label: 'Anonymous' },
  'mainstream-media': { icon: '📰', label: 'Mainstream media' },
  'trusted-source':   { icon: '✅', label: 'Trusted source' },
  'social-media':     { icon: '💬', label: 'Social media' },
  'dev-team':         { icon: '🛠️', label: 'Dev team' }
};

// ---- Data loaders ---------------------------------------------------------
async function fetchAlert(id) {
  const r = await fetch(apiUrl(`/api/alerts/${encodeURIComponent(id)}`), { credentials: 'include' });
  if (r.status === 404) throw new Error('Alert not found');
  if (!r.ok) throw new Error(`Alert load failed (${r.status})`);
  return r.json();
}
async function fetchRelatedAlerts(token) {
  const r = await fetch(apiUrl('/api/alerts'), { credentials: 'include' });
  if (!r.ok) return [];
  const all = await r.json();
  const upper = String(token || '').toUpperCase();
  return (Array.isArray(all) ? all : []).filter(a => String(a.token || '').toUpperCase() === upper);
}
async function fetchMarketSnapshot(token, currency = 'USD') {
  try {
    const r = await fetch(apiUrl(`/api/market/snapshot?symbols=${encodeURIComponent(token)}&currency=${currency}`), { credentials: 'include' });
    if (!r.ok) return null;
    const j = await r.json();
    return (j.items && j.items[0]) || null;
  } catch { return null; }
}
async function fetchPriceHistory(token, days = 7, currency = 'USD') {
  try {
    const r = await fetch(apiUrl(`/api/price-history/${encodeURIComponent(token)}?days=${days}&currency=${currency}`), { credentials: 'include' });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}
async function fetchNews(token) {
  try {
    const r = await fetch(apiUrl('/api/news'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ tokens: [token] })
    });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j.news) ? j.news : [];
  } catch { return []; }
}

// ---- SSE chat stream (for the embedded AI analysis card) ------------------
async function streamChat({ messages, context, onEvent, signal }) {
  const res = await fetch(apiUrl('/api/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
    credentials: 'include',
    body: JSON.stringify({ messages, context }),
    signal
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Chat ${res.status}: ${text.slice(0, 200)}`);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error('no stream');
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = 'message';
      let dataLines = [];
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length) {
        let payload = dataLines.join('\n');
        try { payload = JSON.parse(payload); } catch {}
        onEvent(event, payload);
      }
    }
  }
}

// ---- SVG sparkline builder ------------------------------------------------
function buildSparkline(points, { width = 680, height = 180, currency = 'USD' } = {}) {
  if (!points || points.length < 2) {
    return el('div', { class: 'clg-alert-chart__empty' }, ['No price history available']);
  }
  const prices = points.map(p => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const padX = 6;
  const padY = 16;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const x = (i) => padX + (i / (points.length - 1)) * plotW;
  const y = (p) => padY + plotH - ((p - min) / range) * plotH;

  const linePoints = points.map((p, i) => `${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ');
  const areaPoints = `${x(0).toFixed(1)},${(padY + plotH).toFixed(1)} ${linePoints} ${x(points.length - 1).toFixed(1)},${(padY + plotH).toFixed(1)}`;

  const firstPrice = points[0].price;
  const lastPrice = points[points.length - 1].price;
  const up = lastPrice >= firstPrice;
  const stroke = up ? '#34d399' : '#f87171';
  const fillStart = up ? 'rgba(52, 211, 153, 0.35)' : 'rgba(248, 113, 113, 0.35)';
  const fillEnd = up ? 'rgba(52, 211, 153, 0.0)' : 'rgba(248, 113, 113, 0.0)';

  const grad = `
    <defs>
      <linearGradient id="clg-spark-grad" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="${fillStart}" />
        <stop offset="100%" stop-color="${fillEnd}" />
      </linearGradient>
    </defs>
  `;

  const svgContent = `
    ${grad}
    <polygon points="${areaPoints}" fill="url(#clg-spark-grad)" />
    <polyline points="${linePoints}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="${x(points.length - 1).toFixed(1)}" cy="${y(lastPrice).toFixed(1)}" r="3.5" fill="${stroke}" stroke="#0b1628" stroke-width="1.5" />
  `;
  const svg = el('div', {
    class: 'clg-alert-chart__svg-wrap',
    html: `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="7 day price history">${svgContent}</svg>`
  });

  const axis = el('div', { class: 'clg-alert-chart__axis' }, [
    el('span', {}, [fmtPrice(min, currency)]),
    el('span', {}, [fmtPrice(max, currency)])
  ]);

  return el('div', { class: 'clg-alert-chart' }, [svg, axis]);
}

// ---- Renderers -------------------------------------------------------------
function renderHeroCard(alert) {
  const sev = SEVERITY_META[alert.severity] || SEVERITY_META.info;
  const deadlineMs = alert.deadline ? (new Date(alert.deadline).getTime() - Date.now()) : NaN;
  const deadlineText = isFinite(deadlineMs) ? fmtTimeLeft(deadlineMs) : 'No deadline';

  const logo = el('div', { class: 'clg-alert-hero__logo' }, [
    el('img', {
      src: apiUrl(`/api/logo/${encodeURIComponent(alert.token || '')}`),
      alt: `${alert.token || ''} logo`,
      loading: 'lazy',
      onerror: function () { this.style.display = 'none'; }
    })
  ]);

  const sevPill = el('span', { class: `clg-alert-hero__sev sev-${alert.severity || 'info'}` }, [
    el('span', {}, [sev.icon]),
    el('span', {}, [sev.label])
  ]);

  const tokenPill = el('span', { class: 'clg-alert-hero__token' }, [alert.token || 'TOKEN']);
  const deadlinePill = el('span', { class: `clg-alert-hero__deadline ${deadlineMs < 0 ? 'is-past' : ''}` }, [deadlineText]);

  const meta = el('div', { class: 'clg-alert-hero__meta' }, [tokenPill, sevPill, deadlinePill]);

  const title = el('h1', { class: 'clg-alert-hero__title' }, [alert.title || 'Alert']);
  const desc = alert.description
    ? el('p', { class: 'clg-alert-hero__desc' }, [alert.description])
    : null;

  const tags = Array.isArray(alert.tags) ? alert.tags : [];
  const tagsRow = tags.length
    ? el('div', { class: 'clg-alert-hero__tags' }, tags.map(t => el('span', { class: 'clg-alert-hero__tag' }, [t])))
    : null;

  const bodyBlocks = [];
  if (alert.further_info && alert.further_info.trim()) {
    bodyBlocks.push(el('div', { class: 'clg-alert-hero__further' }, [
      el('h3', {}, ['Background']),
      el('p', {}, [alert.further_info])
    ]));
  }

  if (alert.source_url || alert.source_type) {
    const src = SOURCE_TYPE_META[alert.source_type] || { icon: '🔗', label: 'Source' };
    const srcChildren = [
      el('span', { class: 'clg-alert-hero__source-chip' }, [`${src.icon} ${src.label}`])
    ];
    if (alert.source_url) {
      try {
        const u = new URL(alert.source_url);
        srcChildren.push(el('a', {
          class: 'clg-alert-hero__source-link',
          href: u.href,
          target: '_blank',
          rel: 'noopener noreferrer'
        }, ['Open source ↗']));
      } catch {}
    }
    bodyBlocks.push(el('div', { class: 'clg-alert-hero__source' }, srcChildren));
  }

  const hero = el('section', { class: `clg-alert-hero sev-${alert.severity || 'info'}` }, [
    el('div', { class: 'clg-alert-hero__accent' }),
    el('div', { class: 'clg-alert-hero__inner' }, [
      el('div', { class: 'clg-alert-hero__top' }, [logo, el('div', { class: 'clg-alert-hero__heading' }, [meta, title, desc].filter(Boolean))]),
      tagsRow,
      ...bodyBlocks
    ].filter(Boolean))
  ]);

  return hero;
}

function renderMarketCard(token, snapshot) {
  const priceBig = el('div', { class: 'clg-alert-market__price' }, [fmtPrice(snapshot?.lastPrice, 'USD')]);
  const change = snapshot?.dayChangePct;
  const changeClass = change == null ? '' : (change >= 0 ? 'is-up' : 'is-down');
  const changeEl = el('div', { class: `clg-alert-market__change ${changeClass}` }, [
    el('span', {}, [fmtPct(change)]),
    el('span', { class: 'clg-alert-market__change-label' }, ['24h'])
  ]);

  const stats = [
    { label: 'Market cap', value: snapshot?.marketCap != null ? `$${fmtBigNum(snapshot.marketCap)}` : '—' },
    { label: '24h volume', value: snapshot?.volume24h != null ? `$${fmtBigNum(snapshot.volume24h)}` : '—' },
    { label: '7d change', value: fmtPct(snapshot?.change7dPct) },
    { label: '30d change', value: fmtPct(snapshot?.change30dPct) }
  ];

  const statsGrid = el('div', { class: 'clg-alert-market__stats' },
    stats.map(s => el('div', { class: 'clg-alert-market__stat' }, [
      el('div', { class: 'clg-alert-market__stat-label' }, [s.label]),
      el('div', { class: 'clg-alert-market__stat-value' }, [s.value])
    ]))
  );

  return el('section', { class: 'clg-alert-card clg-alert-market' }, [
    el('div', { class: 'clg-alert-card__header' }, [
      el('h2', {}, [`${token} market`]),
      el('span', { class: 'clg-alert-card__badge' }, ['Live'])
    ]),
    el('div', { class: 'clg-alert-market__top' }, [priceBig, changeEl]),
    statsGrid,
    el('div', { class: 'clg-alert-chart-wrap', id: 'clg-alert-chart-wrap' }, [
      el('div', { class: 'clg-alert-chart__loading' }, ['Loading 7 day price history…'])
    ])
  ]);
}

function renderAiCard() {
  return el('section', { class: 'clg-alert-card clg-alert-ai' }, [
    el('div', { class: 'clg-alert-card__header' }, [
      el('h2', {}, [
        el('span', { class: 'clg-alert-ai__sparkle' }, ['✨']),
        'Lifeguard AI analysis'
      ]),
      el('span', { class: 'clg-alert-card__badge clg-alert-card__badge--ai', id: 'clg-alert-ai-badge' }, ['Loading…'])
    ]),
    el('div', { class: 'clg-alert-ai__body', id: 'clg-alert-ai-body' }, [
      el('div', { class: 'clg-alert-ai__typing' }, [
        el('span', {}, []), el('span', {}, []), el('span', {}, [])
      ])
    ]),
    el('div', { class: 'clg-alert-ai__footer' }, [
      el('div', { class: 'clg-alert-ai__meta' }, [
        el('span', { class: 'clg-alert-ai__disclaimer' }, ['AI-generated. Not financial advice.']),
        el('span', { class: 'clg-alert-ai__timestamp', id: 'clg-alert-ai-timestamp' }, [''])
      ]),
      el('div', { class: 'clg-alert-ai__controls' }, [
        el('span', { class: 'clg-alert-ai__model', id: 'clg-alert-ai-model' }, ['']),
        el('button', {
          type: 'button',
          class: 'clg-alert-ai__refresh',
          id: 'clg-alert-ai-refresh',
          title: 'Regenerate this analysis'
        }, [
          el('span', { class: 'clg-alert-ai__refresh-icon', 'aria-hidden': 'true' }, ['↻']),
          el('span', { class: 'clg-alert-ai__refresh-label' }, ['Refresh'])
        ])
      ])
    ])
  ]);
}

function renderRelatedAlertsCard(currentId, related) {
  const others = related.filter(a => a.id !== currentId);
  if (!others.length) {
    return el('section', { class: 'clg-alert-card' }, [
      el('div', { class: 'clg-alert-card__header' }, [el('h2', {}, ['Other alerts for this token'])]),
      el('div', { class: 'clg-alert-empty' }, ['No other active alerts for this token.'])
    ]);
  }
  const list = el('div', { class: 'clg-alert-related' },
    others.slice(0, 6).map(a => {
      const sev = SEVERITY_META[a.severity] || SEVERITY_META.info;
      const deadlineMs = a.deadline ? (new Date(a.deadline).getTime() - Date.now()) : NaN;
      return el('a', {
        class: `clg-alert-related__item sev-${a.severity || 'info'}`,
        href: `/alert.html?id=${encodeURIComponent(a.id)}`
      }, [
        el('div', { class: 'clg-alert-related__sev' }, [sev.icon]),
        el('div', { class: 'clg-alert-related__body' }, [
          el('div', { class: 'clg-alert-related__title' }, [a.title || '']),
          el('div', { class: 'clg-alert-related__desc' }, [a.description || ''])
        ]),
        el('div', { class: 'clg-alert-related__deadline' }, [isFinite(deadlineMs) ? fmtTimeLeft(deadlineMs) : ''])
      ]);
    })
  );
  return el('section', { class: 'clg-alert-card' }, [
    el('div', { class: 'clg-alert-card__header' }, [el('h2', {}, [`Other alerts for ${others[0]?.token || 'this token'}`])]),
    list
  ]);
}

function renderNewsCard(token) {
  return el('section', { class: 'clg-alert-card clg-alert-news' }, [
    el('div', { class: 'clg-alert-card__header' }, [
      el('h2', {}, [`Recent news for ${token}`]),
      el('span', { class: 'clg-alert-card__badge' }, ['News Scout'])
    ]),
    el('div', { class: 'clg-alert-news__list', id: 'clg-alert-news-list' }, [
      el('div', { class: 'clg-alert-empty' }, ['Looking for recent headlines…'])
    ])
  ]);
}

function renderNewsList(items) {
  const holder = document.getElementById('clg-alert-news-list');
  if (!holder) return;
  holder.innerHTML = '';
  if (!items || !items.length) {
    holder.appendChild(el('div', { class: 'clg-alert-empty' }, ['No recent news found for this token.']));
    return;
  }
  items.slice(0, 6).forEach(n => {
    const item = el('a', {
      class: 'clg-alert-news__item',
      href: n.news_url || '#',
      target: '_blank',
      rel: 'noopener noreferrer'
    }, [
      n.image_url ? el('img', { class: 'clg-alert-news__img', src: n.image_url, alt: '', loading: 'lazy' }) : null,
      el('div', { class: 'clg-alert-news__text' }, [
        el('div', { class: 'clg-alert-news__title' }, [n.title || 'Untitled']),
        el('div', { class: 'clg-alert-news__meta' }, [
          n.source_name ? el('span', {}, [n.source_name]) : null,
          n.date ? el('span', {}, [fmtRelative(n.date)]) : null,
          n.sentiment ? el('span', { class: `clg-alert-news__sentiment is-${String(n.sentiment).toLowerCase()}` }, [n.sentiment]) : null
        ].filter(Boolean)),
        n.text ? el('div', { class: 'clg-alert-news__snippet' }, [String(n.text).slice(0, 220) + (n.text.length > 220 ? '…' : '')]) : null
      ].filter(Boolean))
    ].filter(Boolean));
    holder.appendChild(item);
  });
}

// ---- Lifeguard AI analysis loader (cache-first) ---------------------------
//
// The AI analysis for each alert is cached server-side in the alert_summaries
// table. We fetch the most recent row on page load, type-animate it into the
// card, and show the real generation timestamp. A Refresh button lets any
// viewer ask the server to regenerate, which inserts a new row (history is
// preserved per model in the database).

// Module-level state for the current alert's summary controls.
let currentAlertForSummary = null;
let summaryAnimationToken = 0;

function fmtGeneratedAt(epochSeconds) {
  if (!epochSeconds || !isFinite(epochSeconds)) return '';
  const d = new Date(Number(epochSeconds) * 1000);
  if (isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  try {
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return d.toDateString();
  }
}

function fmtModelLabel(model) {
  if (!model) return '';
  const s = String(model);
  // Turn "openai:gpt-4o-mini" into "OpenAI gpt-4o-mini"
  if (s.includes(':')) {
    const [provider, ...rest] = s.split(':');
    const providerPretty = provider === 'openai' ? 'OpenAI'
      : provider === 'anthropic' ? 'Anthropic'
      : provider === 'xai' ? 'xAI'
      : provider;
    return `${providerPretty} ${rest.join(':')}`.trim();
  }
  return s;
}

// Type-animate markdown-rendered content into an element. Returns a promise
// that resolves when the animation completes or is cancelled (cancellation
// happens when a new animation starts on the same element).
function typeAnimateMarkdown(targetEl, fullText, { charsPerTick = 4, tickMs = 14 } = {}) {
  if (!targetEl) return Promise.resolve();
  const myToken = ++summaryAnimationToken;
  const text = String(fullText || '');
  return new Promise((resolve) => {
    let i = 0;
    targetEl.innerHTML = '';
    function tick() {
      if (myToken !== summaryAnimationToken) { resolve(); return; }
      i = Math.min(text.length, i + charsPerTick);
      targetEl.innerHTML = renderMarkdown(text.slice(0, i));
      if (i >= text.length) { resolve(); return; }
      setTimeout(tick, tickMs);
    }
    tick();
  });
}

function setAiBadge(text, state) {
  const badge = document.getElementById('clg-alert-ai-badge');
  if (!badge) return;
  badge.textContent = text;
  badge.classList.remove('is-done', 'is-error', 'is-loading');
  if (state) badge.classList.add(`is-${state}`);
}

function setAiFooter({ model, generatedAt }) {
  const modelEl = document.getElementById('clg-alert-ai-model');
  const tsEl = document.getElementById('clg-alert-ai-timestamp');
  if (modelEl) modelEl.textContent = fmtModelLabel(model);
  if (tsEl) {
    if (generatedAt) {
      const iso = new Date(Number(generatedAt) * 1000).toISOString();
      tsEl.textContent = `Generated ${fmtGeneratedAt(generatedAt)}`;
      tsEl.setAttribute('title', iso);
    } else {
      tsEl.textContent = '';
      tsEl.removeAttribute('title');
    }
  }
}

function setRefreshBusy(busy) {
  const btn = document.getElementById('clg-alert-ai-refresh');
  if (!btn) return;
  btn.disabled = !!busy;
  btn.classList.toggle('is-busy', !!busy);
  const label = btn.querySelector('.clg-alert-ai__refresh-label');
  if (label) label.textContent = busy ? 'Refreshing…' : 'Refresh';
}

async function displaySummary(summary, { animate }) {
  const bodyEl = document.getElementById('clg-alert-ai-body');
  if (!bodyEl || !summary) return;
  const text = String(summary.content || '');
  setAiFooter({ model: summary.model, generatedAt: summary.generated_at });
  setAiBadge('Ready', 'done');
  if (animate) {
    await typeAnimateMarkdown(bodyEl, text);
  } else {
    summaryAnimationToken++;
    bodyEl.innerHTML = renderMarkdown(text);
  }
}

async function refreshSummary() {
  if (!currentAlertForSummary) return;
  const alert = currentAlertForSummary;
  const bodyEl = document.getElementById('clg-alert-ai-body');
  if (!bodyEl) return;

  setRefreshBusy(true);
  setAiBadge('Generating…', 'loading');

  // Show the typing dots while we wait for the server to regenerate.
  summaryAnimationToken++;
  bodyEl.innerHTML = '';
  const typing = el('div', { class: 'clg-alert-ai__typing' }, [
    el('span', {}, []), el('span', {}, []), el('span', {}, [])
  ]);
  bodyEl.appendChild(typing);

  try {
    const r = await fetch(apiUrl(`/api/alerts/${encodeURIComponent(alert.id)}/summary/refresh`), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      if (r.status === 429 && data.retry_after_ms) {
        const secs = Math.ceil(data.retry_after_ms / 1000);
        throw new Error(`Please wait ${secs}s before refreshing again.`);
      }
      throw new Error(data.details || data.error || `Server error ${r.status}`);
    }
    const data = await r.json();
    if (!data.summary) throw new Error('No summary returned');
    await displaySummary(data.summary, { animate: true });
  } catch (err) {
    setAiBadge('Error', 'error');
    bodyEl.innerHTML = `<p class="clg-alert-ai__error">⚠️ ${escapeHtml(err?.message || 'Refresh failed')}</p>`;
  } finally {
    setRefreshBusy(false);
  }
}

async function loadAiAnalysis(alert) {
  currentAlertForSummary = alert;
  const bodyEl = document.getElementById('clg-alert-ai-body');
  if (!bodyEl) return;

  // Wire up the refresh button once the card is in the DOM.
  const refreshBtn = document.getElementById('clg-alert-ai-refresh');
  if (refreshBtn && !refreshBtn.dataset.bound) {
    refreshBtn.dataset.bound = '1';
    refreshBtn.addEventListener('click', (e) => {
      e.preventDefault();
      refreshSummary();
    });
  }

  setAiBadge('Loading…', 'loading');

  try {
    const r = await fetch(apiUrl(`/api/alerts/${encodeURIComponent(alert.id)}/summary`), {
      credentials: 'include'
    });
    if (!r.ok) throw new Error(`Server error ${r.status}`);
    const data = await r.json();

    if (data && data.summary) {
      // Cached hit: type-animate it as if it were being generated live, but
      // the footer shows the real generation timestamp so it's honest.
      await displaySummary(data.summary, { animate: true });
      return;
    }

    // Cache miss: generate the very first summary for this alert.
    await refreshSummary();
  } catch (err) {
    setAiBadge('Error', 'error');
    bodyEl.innerHTML = `<p class="clg-alert-ai__error">⚠️ ${escapeHtml(err?.message || 'AI analysis failed to load')}</p>`;
  }
}

// ---- Error state ----------------------------------------------------------
function renderError(message) {
  const root = document.getElementById('alert-detail-root');
  if (!root) return;
  root.innerHTML = '';
  root.appendChild(el('div', { class: 'clg-alert-error' }, [
    el('div', { class: 'clg-alert-error__icon' }, ['⚠️']),
    el('h2', {}, ['Alert not available']),
    el('p', {}, [message || 'We could not load this alert.']),
    el('a', { href: '/', class: 'clg-alert-error__back' }, ['← Back to alerts'])
  ]));
}

// ---- Main boot -------------------------------------------------------------
async function boot() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const root = document.getElementById('alert-detail-root');
  if (!root) return;

  if (!id) {
    renderError('No alert id was provided in the URL.');
    return;
  }

  let alert;
  try {
    alert = await fetchAlert(id);
  } catch (err) {
    renderError(err.message || 'Alert load failed');
    return;
  }

  const token = String(alert.token || '').toUpperCase();

  // Build the layout skeleton with the hero and the right-hand column filled
  // in with cards that populate as their data arrives.
  root.innerHTML = '';

  const grid = el('div', { class: 'clg-alert-grid' }, [
    el('div', { class: 'clg-alert-grid__main' }, [
      renderHeroCard(alert),
      renderAiCard()
    ]),
    el('div', { class: 'clg-alert-grid__side' }, [
      renderMarketCard(token, null),
      renderRelatedAlertsCard(alert.id, []),
      renderNewsCard(token)
    ])
  ]);
  root.appendChild(grid);

  // Expose token to the chat widget so follow-up questions carry context.
  try {
    window.CLG_CHAT_CONTEXT = { ...(window.CLG_CHAT_CONTEXT || {}), page: 'alert-detail', token, alertId: alert.id };
  } catch {}

  // Kick off all downstream loads in parallel.
  const marketPromise = fetchMarketSnapshot(token).then(async (snapshot) => {
    if (!snapshot) return null;
    // Replace the market card with a populated one
    const oldMarket = document.querySelector('.clg-alert-market');
    if (oldMarket) {
      const next = renderMarketCard(token, snapshot);
      oldMarket.replaceWith(next);
    }
    return snapshot;
  });

  const historyPromise = fetchPriceHistory(token, 7).then((hist) => {
    const wrap = document.getElementById('clg-alert-chart-wrap');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!hist || !Array.isArray(hist.points) || hist.points.length < 2) {
      wrap.appendChild(el('div', { class: 'clg-alert-chart__empty' }, ['Price history unavailable']));
      return;
    }
    wrap.appendChild(buildSparkline(hist.points, { currency: hist.currency || 'USD' }));
  });

  const relatedPromise = fetchRelatedAlerts(token).then((all) => {
    const old = document.querySelector('.clg-alert-grid__side .clg-alert-card:nth-child(2)');
    const next = renderRelatedAlertsCard(alert.id, all);
    if (old) old.replaceWith(next);
  });

  const newsPromise = fetchNews(token).then((items) => {
    renderNewsList(items);
  });

  // AI analysis uses the cache-first loader and does not depend on the live
  // market snapshot — price context is no longer part of the cached prompt
  // (so the cached summary stays valid across viewers and over time).
  loadAiAnalysis(alert);

  // Fire-and-forget the rest
  Promise.allSettled([marketPromise, historyPromise, relatedPromise, newsPromise]);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
