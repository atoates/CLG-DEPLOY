import { safeHTML } from './sanitize.js';

// --- Config ------------------------------------------------------------------
// API Base URL resolver — prefers injected BACKEND_URL, with safe production fallback
function getApiBaseUrl() {
  const injected = (typeof window !== 'undefined' && window.BACKEND_URL) ? window.BACKEND_URL : '';
  if (injected && injected !== '__BACKEND_URL__') return injected;
  return '';
}

// Helper to construct full API URL
function apiUrl(path) {
  return `${getApiBaseUrl()}${path}`;
}

// Helper to create fetch options with credentials for cross-origin requests
function apiFetch(url, options = {}) {
  return fetch(url, {
    credentials: 'include', // Always send cookies
    ...options
  });
}

// Curated base list for reliable suggestions, enriched dynamically from alerts/watchlist
const BASE_TOKENS = [
  'BTC','ETH','USDT','USDC','BNB','SOL','XRP','ADA','DOGE','TRX','TON','DOT','MATIC','AVAX','LINK','UNI',
  'ATOM','ALGO','XMR','LTC','ETC','BCH','BSV','XLM','HBAR','APT','ARB','OP','SUI','NEAR','ICP',
  'MKR','AAVE','COMP','SNX','CRV','BAL','YFI','ZEC','DASH','EOS','FIL','VET','XTZ','KSM','GLMR',
  'POL','OMNI','UXLINK','ENA','DAI'
];
const ALL_TOKENS = [...BASE_TOKENS];
const showAllToggle   = document.getElementById('toggle-show-all');

const sevButtons      = document.querySelectorAll('.sev-btn');

// --- Global UI/state bindings (restored) ------------------------------------
// Safe defaults for user/session state
let selectedTokens = [];
let sevFilter = ['critical', 'warning', 'info'];
let showAll = false;
let hiddenKeys = new Set();
let showAllTokens = false; // may be overridden by localStorage
let isLoggedIn = false;

// Alerts caches used across views
let serverAlerts = [];
let autoAlerts = [];

// Currency/config placeholders populated by /api/market/config
let CURRENCY_SYMBOL = '$';
let CURRENCY_CODE = 'USD';
let LOGOKIT_API_KEY = '';

// DOM references used later in the module
const tokenInput = document.getElementById('token-input');
const showAllTokensToggle = document.getElementById('toggle-show-all-tokens');

const alertsListEl = document.getElementById('alerts-list');
const noAlertsEl = document.getElementById('no-alerts');

const panelAlerts = document.getElementById('panel-alerts');
const panelNews = document.getElementById('panel-news');
const panelMarket = document.getElementById('panel-market');
const panelSentinel = document.getElementById('panel-sentinel');

// Tabs and ancillary controls
const tabs = document.querySelectorAll('.tab');
const sevFilterEl = document.getElementById('sev-filter');
const showAllWrap = document.getElementById('showall-wrap');
const selectedTokensEl = document.getElementById('selected-tokens');
const addTokenBtn = document.getElementById('add-token-btn');

// Market tab elements
const marketGridEl = document.getElementById('market-grid');
const marketEmptyEl = document.getElementById('market-empty');
const marketNoteEl = document.getElementById('market-note');

// Tag/source dictionaries (inlined for main app)
const ALERT_TAGS = {
  'price-change': { icon: '📊', label: 'Price Change', color: '#4ade80' },
  'migration': { icon: '🔄', label: 'Migration', color: '#60a5fa' },
  'hack': { icon: '🔓', label: 'Hack', color: '#f87171' },
  'fork': { icon: '🔱', label: 'Fork', color: '#a78bfa' },
  'scam': { icon: '⚠️', label: 'Scam', color: '#fbbf24' },
  'airdrop': { icon: '🪂', label: 'Airdrop', color: '#34d399' },
  'whale': { icon: '🐋', label: 'Whale Alert', color: '#818cf8' },
  'news': { icon: '📰', label: 'News', color: '#94a3b8' },
  'community': { icon: '👥', label: 'Community', color: '#fb923c' },
  'exploit': { icon: '⚡', label: 'Exploit', color: '#f43f5e' },
  'privacy': { icon: '🛡️', label: 'Privacy', color: '#22c55e' },
  'community-vote': { icon: '🗳️', label: 'Community Vote', color: '#8b5cf6' },
  'token-unlocks': { icon: '🔒', label: 'Token Unlocks', color: '#f59e0b' }
};

const ALERT_SOURCE_TYPES = {
  'anonymous': { icon: '🙈', label: 'Anonymous' },
  'mainstream-media': { icon: '📰', label: 'Mainstream media' },
  'trusted-source': { icon: '✅', label: 'Trusted source' },
  'social-media': { icon: '💬', label: 'Social media' },
  'dev-team': { icon: '🛠️', label: 'Dev. Team' }
};

// --- Additional state -------------------------------------------------------
let tagFilter = [];

// Market state
let marketItems = [];
let marketProvider = 'none';

/** Paginated alerts list (main feed mockup) */
const ALERTS_PAGE_SIZE = 6;
let alertsPageIndex = 0;

// --- Helpers ---------------------------------------------------------------
function fmtTimeLeft(ms){
  if (!Number.isFinite(ms)) return '';
  const past = ms < 0;
  const abs = Math.abs(ms);
  const sec = Math.round(abs / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (!d && m) parts.push(`${m}m`);
  if (!parts.length) parts.push('now');
  return past ? `Expired ${parts.join(' ')} ago` : `Due in ${parts.join(' ')}`;
}

function moneyFmt(n){
  if (typeof n !== 'number' || !Number.isFinite(n)) return `${CURRENCY_SYMBOL}—`;
  try{
    return new Intl.NumberFormat(undefined, { style:'currency', currency: CURRENCY_CODE, maximumFractionDigits: 2 }).format(n);
  }catch{
    return `${CURRENCY_SYMBOL}${n.toFixed(2)}`;
  }
}

function pctFmt(n){
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function volumeFmt(n){
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n/1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `${(n/1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `${(n/1e6).toFixed(2)}M`;
  if (abs >= 1e3)  return `${(n/1e3).toFixed(2)}K`;
  return `${n.toFixed(0)}`;
}

function alertKey(a){
  return a.id || `${(a.token||'').toUpperCase()}::${a.title||''}::${a.deadline||''}`;
}
function isHidden(a){
  return hiddenKeys.has(alertKey(a));
}
function dismissAlert(a){
  hiddenKeys.add(alertKey(a));
  persistPrefsServerDebounced();
  renderAlerts();
}
function unhideAlert(a){
  hiddenKeys.delete(alertKey(a));
  persistPrefsServerDebounced();
  renderAlerts();
}

// Pills for selected tokens
function renderPills(){
  if (!selectedTokensEl) return;
  selectedTokensEl.innerHTML = '';
  const statusEl = document.getElementById('watchlist-status');
  if (statusEl) {
    statusEl.textContent = selectedTokens.length
      ? `${selectedTokens.length} on watchlist`
      : 'No tokens selected';
  }
  if (!selectedTokens.length){
    return;
  }
  selectedTokens.forEach(sym => {
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.textContent = sym;
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'pill-x';
    x.setAttribute('aria-label', `Remove ${sym}`);
    x.textContent = '×';
    x.addEventListener('click', () => {
      selectedTokens = selectedTokens.filter(s => s !== sym);
      persistPrefsServerDebounced();
      renderPills();
      renderAlerts();
      loadMarket();
      loadNews();
      updateTicker(); // Update ticker when tokens are removed
    });
    pill.appendChild(x);
    selectedTokensEl.appendChild(pill);
  });
}

// Severity filter UI binding + sync
let _sevBound = false;
function syncSevUi(){
  sevButtons.forEach(btn => {
    const sev = btn.getAttribute('data-sev');
    const active = sevFilter.includes(sev);
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  if (!_sevBound){
    _sevBound = true;
    sevButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const sev = btn.getAttribute('data-sev');
        if (!sev) return;
        if (sevFilter.includes(sev)) {
          sevFilter = sevFilter.filter(s => s !== sev);
        } else {
          sevFilter = [...new Set([...sevFilter, sev])];
        }
        // Ensure at least one severity remains selected
        if (!sevFilter.length) sevFilter = ['critical','warning','info'];
        syncSevUi();
        persistPrefsServerDebounced();
        renderAlerts();
      });
    });
  }
}

// Top-row toggles
if (addTokenBtn){
  addTokenBtn.addEventListener('click', () => {
    const val = (tokenInput?.value || '').trim();
    if (val) selectToken(val);
  });
}
if (showAllToggle){
  showAllToggle.addEventListener('change', () => {
    showAll = !!showAllToggle.checked;
    persistPrefsServerDebounced();
    renderAlerts();
  });
}

// Tabs wiring
function switchTab(tab){
  const name = String(tab || 'alerts');
  // Panels
  if (panelAlerts) panelAlerts.hidden = (name !== 'alerts');
  if (panelNews) panelNews.hidden = (name !== 'news');
  if (panelMarket) panelMarket.hidden = (name !== 'market');
  if (panelSentinel) panelSentinel.hidden = (name !== 'sentinel');
  // Tabs active state
  tabs.forEach(t => {
    const is = t.getAttribute('data-tab') === name;
    t.classList.toggle('active', is);
    t.setAttribute('aria-selected', String(is));
  });
  updateFilterVisibility(name);
  if (name === 'news') loadNews();
  if (name === 'market') loadMarket();
  if (name === 'sentinel') loadSentinelSummary();
  // Refresh chat context for the Sentinel AI widget so starter prompts adapt
  try {
    const existing = window.CLG_CHAT_CONTEXT || {};
    window.CLG_CHAT_CONTEXT = { ...existing, page: name };
  } catch (_) {}
}

function initTabs(){
  if (!tabs || !tabs.length) return;
  tabs.forEach(t => {
    t.addEventListener('click', (e) => {
      e.preventDefault();
      const name = t.getAttribute('data-tab');
      switchTab(name);
    });
  });
}

function updateFilterVisibility(activeTab){
  const alertsView = (activeTab === 'alerts');
  if (sevFilterEl) sevFilterEl.style.display = alertsView ? '' : 'none';
  if (showAllWrap) showAllWrap.style.display = alertsView ? '' : 'none';
  // Hide the token selector and toggles row for the Sentinel tab (it has its own context)
  const tokensRow = document.querySelector('.tokens-and-toggles-row');
  const tokenSelector = document.querySelector('.token-selector-dropdown');
  if (tokensRow) tokensRow.style.display = (activeTab === 'sentinel') ? 'none' : '';
  if (tokenSelector) tokenSelector.style.display = (activeTab === 'sentinel') ? 'none' : '';
}

// --- Server-backed prefs -----------------------------------------------------
function persistPrefsServerDebounced(){
  clearTimeout(persistPrefsServerDebounced._t);
  persistPrefsServerDebounced._t = setTimeout(() => {
    apiFetch(apiUrl('/api/me/prefs'), {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({
        watchlist: selectedTokens,
        severity: sevFilter,
        showAll,
        dismissed: [...hiddenKeys]
      })
    }).catch(()=>{});
  }, 250);
}

// --- Environment Detection ---------------------------------------------------
async function checkEnvironment() {
  try {
    const response = await apiFetch(apiUrl('/api/environment'));
    if (response.ok) {
      const data = await response.json();
      if (data.environment && data.environment !== 'production') {
        showEnvironmentBanner(data.environment);
      }
    }
  } catch (error) {
    /* silently ignore */
  }
}

function showEnvironmentBanner(env) {
  const banner = document.getElementById('env-banner');
  if (banner) {
    banner.hidden = false;
    document.body.classList.add('has-env-banner');
    
    // Update banner text based on environment
    const envText = banner.querySelector('.env-text');
    if (envText) {
      if (env === 'staging' || env === 'test') {
        envText.textContent = '🧪 TEST ENVIRONMENT';
      } else if (env === 'development') {
        envText.textContent = '💻 DEVELOPMENT';
      } else {
        envText.textContent = `⚠️ ${env.toUpperCase()}`;
      }
    }
  }
}

// --- Price Ticker ------------------------------------------------------------
let tickerUpdateInterval = null;

async function fetchTickerPrices() {
  try {
    // Ensure minimum of 5 tokens - use top 5 if user has selected fewer
    const TOP_5_TOKENS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'];
    let tokens;
    
    if (selectedTokens.length >= 5) {
      // User has 5+ tokens selected, use their selection
      tokens = selectedTokens;
    } else if (selectedTokens.length > 0) {
      // User has 1-4 tokens, fill with top tokens to reach 5
      const needed = 5 - selectedTokens.length;
      const fillTokens = TOP_5_TOKENS.filter(t => !selectedTokens.includes(t)).slice(0, needed);
      tokens = [...selectedTokens, ...fillTokens];
    } else {
      // No tokens selected, show top 5
      tokens = TOP_5_TOKENS;
    }
    
    if (tokens.length === 0) {
      return [];
    }

    const symbolsParam = tokens.join(',');
    const response = await apiFetch(apiUrl(`/api/market/prices?symbols=${symbolsParam}&currency=${CURRENCY_CODE}`));
    
    if (!response.ok) {
      console.error('Failed to fetch ticker prices:', response.status);
      return [];
    }

    const data = await response.json();
    return data.prices || [];
  } catch (error) {
    console.error('Error fetching ticker prices:', error);
    return [];
  }
}

function formatTickerPrice(price) {
  if (price >= 1000) return `${CURRENCY_SYMBOL}${price.toLocaleString(undefined, {maximumFractionDigits: 0})}`;
  if (price >= 1) return `${CURRENCY_SYMBOL}${price.toLocaleString(undefined, {maximumFractionDigits: 2})}`;
  if (price >= 0.01) return `${CURRENCY_SYMBOL}${price.toLocaleString(undefined, {maximumFractionDigits: 4})}`;
  return `${CURRENCY_SYMBOL}${price.toLocaleString(undefined, {maximumFractionDigits: 6})}`;
}

function renderTicker(pricesData) {
  const tickerEl = document.getElementById('price-ticker');
  const tickerContent = tickerEl?.querySelector('.ticker-content');
  const tickerDuplicate = tickerEl?.querySelector('.ticker-duplicate');
  
  if (!tickerEl || !tickerContent || !tickerDuplicate) {
    return;
  }

  if (!pricesData || pricesData.length === 0) {
    tickerEl.hidden = true;
    return;
  }

  // Build ticker items HTML
  const tickerHTML = pricesData.map(token => {
    const changeClass = token.change24h > 0 ? 'positive' : token.change24h < 0 ? 'negative' : 'neutral';
    const changeSymbol = token.change24h > 0 ? '▲' : token.change24h < 0 ? '▼' : '•';
    const changeText = `${changeSymbol} ${Math.abs(token.change24h).toFixed(2)}%`;
    
    return `
      <div class="ticker-item">
        <span class="ticker-symbol">${token.symbol}</span>
        <span class="ticker-price">${formatTickerPrice(token.price)}</span>
        <span class="ticker-change ${changeClass}">${changeText}</span>
      </div>
    `;
  }).join('');

  // Set content for both the main and duplicate (for seamless loop)
  tickerContent.innerHTML = tickerHTML;
  tickerDuplicate.innerHTML = tickerHTML;
  
  // Show ticker
  tickerEl.hidden = false;
}

async function updateTicker() {
  const pricesData = await fetchTickerPrices();
  renderTicker(pricesData);
}

function startTicker() {
  // Initial update
  updateTicker();
  
  // Update every 5 minutes (300000ms)
  if (tickerUpdateInterval) {
    clearInterval(tickerUpdateInterval);
  }
  tickerUpdateInterval = setInterval(updateTicker, 300000);
}

// --- User menu dropdown ------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // Check environment and show banner if not production
  checkEnvironment();

  const userMenuBtn = document.getElementById('user-menu-btn');
  const userMenu = document.getElementById('user-menu');
  const logoutItem = document.getElementById('menu-logout');

  if (userMenuBtn && userMenu) {
    userMenuBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isHidden = userMenu.hidden;
      userMenu.hidden = !isHidden;
      userMenuBtn.setAttribute('aria-expanded', String(isHidden));
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (!userMenu.contains(e.target) && !userMenuBtn.contains(e.target)) {
        userMenu.hidden = true;
        userMenuBtn.setAttribute('aria-expanded', 'false');
      }
    });

    // Handle menu item clicks
    userMenu.addEventListener('click', (e) => {
      const target = e.target.closest('.menu-item');
      if (!target) return;
      
      const action = target.getAttribute('data-action');
      if (!action) return;
      
      userMenu.hidden = true;
      userMenuBtn.setAttribute('aria-expanded', 'false');
      
      // Real actions
  if (action === 'login') window.location.href = '/signup.html';
      if (action === 'settings' || action === 'profile') window.location.href = '/profile.html';
      if (action === 'help') window.open('https://github.com/atoates/CLG-DEPLOY', '_blank');
      if (action === 'logout') {
        apiFetch(apiUrl('/auth/logout'), { method:'POST' }).finally(() => { window.location.reload(); });
      }
    });
  }

  // Summary tab was removed — Sentinel AI chat widget now covers this use case.
});

// --- Init (boot) -------------------------------------------------------------
(async function boot(){
  let currencySymbols = {}; // Store all available currency symbols
  
  // Fetch market config (currency symbol/code and LogoKit API key) before first render
  try{
    const r = await apiFetch(apiUrl('/api/market/config'));
    if (r.ok){
      const j = await r.json();
      if (j && j.symbol) CURRENCY_SYMBOL = String(j.symbol);
      if (j && j.currency) CURRENCY_CODE = String(j.currency);
      if (j && j.logokitApiKey) {
        LOGOKIT_API_KEY = String(j.logokitApiKey);
        window.logokitApiKey = LOGOKIT_API_KEY; // Expose to window for easy access
      }
      if (j && j.currencySymbols) {
        currencySymbols = j.currencySymbols;
      }
    }
  }catch(_e){}

  // Load user preferences from server (cookie-based anon ID)
  try{
    // Reuse the /api/me response pre-fetched by the auth gate if available
    let me = (typeof window !== 'undefined' && window.__CLG_ME__) ? window.__CLG_ME__ : null;
    if (!me) {
      const res = await apiFetch(apiUrl('/api/me'));
      if (res.ok) me = await res.json();
    }
    // Belt-and-braces: if somehow app.js loaded without auth, bounce
    if (me && me.loggedIn === false) {
      window.location.replace('/signup.html');
      return;
    }
    if (me){
      selectedTokens = Array.isArray(me.watchlist) ? me.watchlist : [];
      sevFilter      = Array.isArray(me.severity) ? me.severity : ['critical','warning','info'];
      showAll        = !!me.showAll;
      hiddenKeys     = new Set(Array.isArray(me.dismissed) ? me.dismissed : []);
      isLoggedIn     = !!me.loggedIn;
      
      // Override currency with user preference if set
      if (me.currency && currencySymbols[me.currency]) {
        CURRENCY_CODE = me.currency;
        CURRENCY_SYMBOL = currencySymbols[me.currency];
      }

      // Control visibility of menu items based on login state
      try{
        const logoutNode = document.getElementById('menu-logout');
        if (logoutNode) logoutNode.hidden = !me.loggedIn;
        const loginNode  = document.querySelector('#user-menu [data-action="login"]');
        if (loginNode)  loginNode.hidden  =  !!me.loggedIn;
        // Rename "Settings" → "Profile" when logged in for clarity
        const settingsNode = document.querySelector('#user-menu [data-action="settings"]');
        if (settingsNode) settingsNode.textContent = me.loggedIn ? 'Profile' : 'Settings';
      }catch(_e){}

      const nameEl = document.getElementById('user-name-el');
      const avEl = document.getElementById('user-avatar-el');
      const pillBtn = document.getElementById('user-menu-btn');
      const menu = document.getElementById('user-menu');
      if (avEl) {
        avEl.innerHTML = '';
        avEl.classList.toggle('user-avatar--filled', !!me.loggedIn);
        if (me.loggedIn) {
          const url = me.profile?.avatar || '';
          if (url) {
            const img = document.createElement('img');
            img.src = url;
            img.alt = '';
            img.width = 32;
            img.height = 32;
            avEl.appendChild(img);
          } else {
            avEl.textContent = (me.profile?.name || 'U').trim().charAt(0).toUpperCase();
          }
        }
      }
      if (nameEl) {
        nameEl.textContent = me.loggedIn
          ? (me.profile?.username || me.profile?.name || 'Profile')
          : 'Account';
      }
      if (pillBtn) {
        pillBtn.setAttribute('aria-haspopup', 'true');
        pillBtn.setAttribute('aria-expanded', 'false');
      }
      if (menu) menu.hidden = true;
    }
  }catch(e){}

  // Sync UI controls to prefs
  if (showAllToggle) showAllToggle.checked = showAll;
  // Restore top-row 'Show all' preference from localStorage (no server persistence)
  try { showAllTokens = (localStorage.getItem('showAllTokens') === '1'); } catch(_e) {}
  
  // Default to showing all tokens if no watchlist is configured
  if (selectedTokens.length === 0 && localStorage.getItem('showAllTokens') === null) {
    showAllTokens = true;
    try { localStorage.setItem('showAllTokens', '1'); } catch(_e) {}
  }
  
  if (showAllTokensToggle) showAllTokensToggle.checked = !!showAllTokens;
  syncSevUi();

  // Render + load data
  renderDatalist();
  renderAll();
  // Load alerts and enrich token suggestions from them
  await loadAlertsFromServer();
  await enrichTokensFromAlerts();
  // Fetch token metadata for autocomplete
  await fetchTokenMetadata();
  initTokenAutocomplete();
  initTabs();
  loadMarket();
  updateFilterVisibility('alerts'); // default tab
  
  // Start price ticker
  startTicker();
  // Wire the top-row 'Show all' toggle to control watchlist ignoring (local only)
  if (showAllTokensToggle){
    showAllTokensToggle.addEventListener('change', () => {
      showAllTokens = !!showAllTokensToggle.checked;
      try { localStorage.setItem('showAllTokens', showAllTokens ? '1' : '0'); } catch(_e) {}
      renderAll();
    });
  }
})();

// --- Token Autocomplete ------------------------------------------------------
let tokenMetadata = []; // Array of {symbol: "BTC", name: "Bitcoin"}
let autocompleteContainer = null;
let selectedAutocompleteIndex = -1;

async function fetchTokenMetadata() {
  try {
    const r = await apiFetch(apiUrl('/api/tokens'));
    if (r.ok) {
      const data = await r.json();
      tokenMetadata = data.tokens || [];
    }
  } catch (e) {
    // Fallback to existing ALL_TOKENS
    tokenMetadata = ALL_TOKENS.map(symbol => ({ symbol, name: symbol }));
  }
}

function createAutocompleteContainer() {
  if (autocompleteContainer) return;
  
  autocompleteContainer = document.createElement('div');
  autocompleteContainer.className = 'token-autocomplete';
  autocompleteContainer.style.display = 'none';
  
  // Insert after token input
  if (tokenInput && tokenInput.parentNode) {
    tokenInput.parentNode.style.position = 'relative';
    tokenInput.parentNode.appendChild(autocompleteContainer);
  }
}

function filterTokens(query) {
  if (!query || query.length < 1) return [];
  
  const q = query.toLowerCase().trim();
  
  return tokenMetadata
    .filter(token => {
      const symbolMatch = token.symbol.toLowerCase().includes(q);
      const nameMatch = token.name.toLowerCase().includes(q);
      return symbolMatch || nameMatch;
    })
    .slice(0, 50) // Limit to 50 results
    .sort((a, b) => {
      // Prioritize exact matches at start
      const aSymbolStart = a.symbol.toLowerCase().startsWith(q);
      const bSymbolStart = b.symbol.toLowerCase().startsWith(q);
      if (aSymbolStart && !bSymbolStart) return -1;
      if (!aSymbolStart && bSymbolStart) return 1;
      
      const aNameStart = a.name.toLowerCase().startsWith(q);
      const bNameStart = b.name.toLowerCase().startsWith(q);
      if (aNameStart && !bNameStart) return -1;
      if (!aNameStart && bNameStart) return 1;
      
      // Then alphabetically by symbol
      return a.symbol.localeCompare(b.symbol);
    });
}

function highlightMatch(text, query) {
  if (!query) return text;
  
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return text;
  
  const before = text.slice(0, index);
  const match = text.slice(index, index + query.length);
  const after = text.slice(index + query.length);
  
  return `${before}<strong>${match}</strong>${after}`;
}

function showAutocomplete(matches, query) {
  if (!autocompleteContainer) return;
  
  if (!matches.length && !query.trim()) {
    autocompleteContainer.style.display = 'none';
    return;
  }
  
  autocompleteContainer.innerHTML = '';
  selectedAutocompleteIndex = -1;
  
  matches.forEach((token, idx) => {
    const item = document.createElement('div');
    item.className = 'autocomplete-item';
    item.dataset.index = idx;
    item.dataset.symbol = token.symbol;
    
    const displayText = `${token.name} | ${token.symbol}`;
    item.innerHTML = highlightMatch(displayText, query);
    
    item.addEventListener('click', () => {
      selectToken(token.symbol);
    });
    
    item.addEventListener('mouseenter', () => {
      selectedAutocompleteIndex = idx;
      updateAutocompleteSelection();
    });
    
    autocompleteContainer.appendChild(item);
  });
  
  // Add "Request new token" option if there's a query
  if (query.trim().length >= 2) {
    const requestItem = document.createElement('div');
    requestItem.className = 'autocomplete-item autocomplete-request';
    requestItem.dataset.index = matches.length;
    requestItem.dataset.action = 'request';
    
    requestItem.innerHTML = `
      <span class="request-icon">➕</span>
      <span class="request-text">Request "${query.toUpperCase()}" to be added</span>
    `;
    
    requestItem.addEventListener('click', () => {
      openTokenRequestModal(query);
    });
    
    requestItem.addEventListener('mouseenter', () => {
      selectedAutocompleteIndex = matches.length;
      updateAutocompleteSelection();
    });
    
    autocompleteContainer.appendChild(requestItem);
  }
  
  autocompleteContainer.style.display = 'block';
}

function hideAutocomplete() {
  if (autocompleteContainer) {
    autocompleteContainer.style.display = 'none';
    selectedAutocompleteIndex = -1;
  }
}

function updateAutocompleteSelection() {
  if (!autocompleteContainer) return;
  
  const items = autocompleteContainer.querySelectorAll('.autocomplete-item');
  items.forEach((item, idx) => {
    if (idx === selectedAutocompleteIndex) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });
}

function selectToken(symbol) {
  const upper = symbol.toUpperCase().trim();
  if (!upper || selectedTokens.includes(upper)) {
    hideAutocomplete();
    tokenInput.value = '';
    return;
  }
  
  selectedTokens.push(upper);
  persistPrefsServerDebounced();
  renderAll();
  loadMarket();
  loadAutoAlerts().then(renderAlerts);
  updateTicker(); // Update ticker when tokens change
  
  tokenInput.value = '';
  hideAutocomplete();
  tokenInput.focus();
}

function openTokenRequestModal(query) {
  const modal = document.getElementById('token-request-modal');
  if (!modal) return;
  
  hideAutocomplete();
  tokenInput.value = '';
  
  // Pre-fill the symbol from the search query
  const symbolInput = document.getElementById('request-symbol');
  const nameInput = document.getElementById('request-name');
  const reasonInput = document.getElementById('request-reason');
  const websiteInput = document.getElementById('request-website');
  
  if (symbolInput) symbolInput.value = query.toUpperCase().trim();
  if (nameInput) nameInput.value = '';
  if (reasonInput) reasonInput.value = '';
  if (websiteInput) websiteInput.value = '';
  
  modal.style.display = 'flex';
  if (nameInput) nameInput.focus();
}

function closeTokenRequestModal() {
  const modal = document.getElementById('token-request-modal');
  if (!modal) return;
  modal.style.display = 'none';
}

async function submitTokenRequest(e) {
  e.preventDefault();
  
  const symbol = document.getElementById('request-symbol').value.toUpperCase().trim();
  const name = document.getElementById('request-name').value.trim();
  const reason = document.getElementById('request-reason').value.trim();
  const website = document.getElementById('request-website').value.trim();
  
  if (!symbol || !name || !reason) {
    alert('Please fill out all required fields (Symbol, Name, and Reason).');
    return;
  }
  
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';
  
  try {
    const resp = await apiFetch(apiUrl('/api/token-requests'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, name, reason, website })
    });
    
    const data = await resp.json();
    
    if (resp.ok) {
      alert(`✅ Token request submitted successfully!\n\nThank you for requesting ${symbol}. We'll review it soon.`);
      closeTokenRequestModal();
    } else if (resp.status === 429) {
      alert(`⚠️ ${data.error || 'This token has already been requested.'}`);
    } else if (resp.status === 400) {
      alert(`❌ ${data.error || 'Invalid request. Please check your inputs.'}`);
    } else {
      throw new Error(data.error || 'Failed to submit request');
    }
  } catch (err) {
    alert(`❌ Failed to submit token request: ${err.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
}

function initTokenAutocomplete() {
  if (!tokenInput) return;
  
  createAutocompleteContainer();
  
  // Remove datalist attribute if present
  tokenInput.removeAttribute('list');
  
  // Input event for filtering
  tokenInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    if (query.length < 1) {
      hideAutocomplete();
      return;
    }
    
    const matches = filterTokens(query);
    showAutocomplete(matches, query);
  });
  
  // Keyboard navigation
  tokenInput.addEventListener('keydown', (e) => {
    if (!autocompleteContainer || autocompleteContainer.style.display === 'none') {
      if (e.key === 'Enter') {
        // Try to add current value as-is
        const val = tokenInput.value.toUpperCase().trim();
        if (val) selectToken(val);
      }
      return;
    }
    
    const items = autocompleteContainer.querySelectorAll('.autocomplete-item');
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedAutocompleteIndex = Math.min(selectedAutocompleteIndex + 1, items.length - 1);
      updateAutocompleteSelection();
      
      // Scroll into view
      if (items[selectedAutocompleteIndex]) {
        items[selectedAutocompleteIndex].scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedAutocompleteIndex = Math.max(selectedAutocompleteIndex - 1, -1);
      updateAutocompleteSelection();
      
      if (selectedAutocompleteIndex >= 0 && items[selectedAutocompleteIndex]) {
        items[selectedAutocompleteIndex].scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedAutocompleteIndex >= 0 && items[selectedAutocompleteIndex]) {
        const symbol = items[selectedAutocompleteIndex].dataset.symbol;
        selectToken(symbol);
      } else {
        // Select first match
        if (items.length > 0) {
          const symbol = items[0].dataset.symbol;
          selectToken(symbol);
        }
      }
    } else if (e.key === 'Escape') {
      hideAutocomplete();
      tokenInput.blur();
    }
  });
  
  // Hide on blur (with delay to allow click events)
  tokenInput.addEventListener('blur', () => {
    setTimeout(() => hideAutocomplete(), 200);
  });
  
  // Show all on focus if empty
  tokenInput.addEventListener('focus', () => {
    if (tokenInput.value.trim().length === 0) {
      const topTokens = tokenMetadata.slice(0, 50);
      showAutocomplete(topTokens, '');
    }
  });
}

// Legacy function for compatibility
function renderDatalist() {
  // No longer needed - using custom autocomplete
}

// Add-all control: adds entire suggestions list to watchlist
// (Removed Add all; using Show all alerts toggle instead)

async function enrichTokensFromAlerts(){
  try{
    const r = await apiFetch(apiUrl('/api/alerts'));
    if (r.ok){
      const items = await r.json();
      const set = new Set(BASE_TOKENS.map(s=>String(s).toUpperCase()));
      items.forEach(a => {
        const tok = String(a.token||'').toUpperCase().trim();
        if (tok && /^[A-Z0-9]{2,15}$/.test(tok)) set.add(tok);
      });
      // Merge enriched tokens into autocomplete metadata (non-destructive)
      const merged = Array.from(set).sort().map(symbol => ({ symbol, name: symbol }));
      if (!Array.isArray(tokenMetadata) || tokenMetadata.length < merged.length){
        tokenMetadata = merged;
      }
    }
  }catch(_e){}
}
// --- Alerts (Saved + Auto) ---------------------------------------------------
async function loadAlertsFromServer(){
  try{
    const res = await apiFetch(apiUrl('/api/alerts'));
    serverAlerts = await res.json();
  }catch(e){
    console.error('Failed to fetch /api/alerts', e);
    serverAlerts = [];
  }
  await loadAutoAlerts();
  initializeTagFilters(); // Initialize tag filters after alerts are loaded
  renderAlerts();
  startTicking();
}

async function loadAutoAlerts(){
  autoAlerts = [];
  if (selectedTokens.length === 0) return;

  const symbols = selectedTokens.join(',');

  const tasks = [
    // Market-derived alerts
    apiFetch(apiUrl(`/api/market/auto-alerts?symbols=${encodeURIComponent(symbols)}`))
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
  ];

  try{
    const [mk] = await Promise.all(tasks);
    autoAlerts = Array.isArray(mk) ? mk : [];
  }catch{
    autoAlerts = [];
  }
}

function applySeverityFilter(list){
  if (!sevFilter || sevFilter.length === 0) return [];
  return list.filter(a => sevFilter.includes((a.severity || 'info')));
}

// Initialize tag filters
function initializeTagFilters() {
  const dropdownTrigger = document.getElementById('tag-dropdown-trigger');
  const dropdownOptions = document.getElementById('tag-dropdown-options');
  const resetTagsBtn = document.getElementById('reset-tags');
  
  // Also handle the new popup clear button (if the old reset-tags doesn't exist)
  const popupClearBtn = resetTagsBtn || document.querySelector('.btn-clear-tags-popup');
  
  // Get all unique tags from combined alerts (serverAlerts + autoAlerts)
  const allTags = new Set();
  const combinedAlerts = [...serverAlerts, ...autoAlerts];
  combinedAlerts.forEach(alert => {
    const tags = getAlertTagsArray(alert);
    tags.forEach(tag => allTags.add(tag));
  });
  
  // Also add all predefined tags from ALERT_TAGS so they're always available
  Object.keys(ALERT_TAGS).forEach(tag => allTags.add(tag));
  
  // Create tag filter buttons in the popup
  const popupTagFilters = document.getElementById('popup-tag-filters');
  popupTagFilters.innerHTML = '';
  
  Array.from(allTags).sort().forEach(tag => {
    const tagButton = document.createElement('button');
    tagButton.className = 'tag-filter';
    tagButton.dataset.tag = tag;
    
    const tagInfo = ALERT_TAGS[tag];
    const icon = tagInfo ? tagInfo.icon : '🏷️';
    const label = tagInfo ? tagInfo.label : tag;
    
    tagButton.innerHTML = `<span class="icon">${icon}</span><span>${label}</span>`;
    
    // Add click handler for tag selection
    tagButton.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      toggleTagFilter(tag);
    });
    
    popupTagFilters.appendChild(tagButton);
  });
  
  // Bind event listeners once
  if (!dropdownOptions.dataset.bound) {
    // Handle dropdown toggle
    dropdownTrigger.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleDropdown();
    });
    
    // Handle option selection
    dropdownOptions.addEventListener('click', function(e) {
      e.stopPropagation();
      // Don't handle clicks here since tag buttons have their own handlers
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.custom-dropdown')) {
        closeDropdown();
      }
    });
    
    
    dropdownOptions.dataset.bound = '1';
  }
  
  // Handle reset/clear button (use the popup button now)
  if (popupClearBtn) {
    popupClearBtn.addEventListener('click', resetTagFilters);
  }
  
  // Initialize display
  updateTagButtonStates();
  updateDropdownText();
}

function toggleDropdown() {
  const dropdownTrigger = document.getElementById('tag-dropdown-trigger');
  const dropdownOptions = document.getElementById('tag-dropdown-options');
  
  const isOpen = dropdownOptions.classList.contains('open');
  
  if (isOpen) {
    closeDropdown();
  } else {
    dropdownOptions.classList.add('open');
    dropdownTrigger.classList.add('active');
  }
}

function closeDropdown() {
  const dropdownTrigger = document.getElementById('tag-dropdown-trigger');
  const dropdownOptions = document.getElementById('tag-dropdown-options');
  
  dropdownOptions.classList.remove('open');
  dropdownTrigger.classList.remove('active');
}

function toggleTagFilter(tag) {
  if (tagFilter.includes(tag)) {
    // Remove from selection
    tagFilter = tagFilter.filter(t => t !== tag);
  } else {
    // Add to selection
    tagFilter.push(tag);
  }
  
  // Update visual state of tag buttons in popup
  updateTagButtonStates();
  updateDropdownText();
  renderAlerts();
}

function updateTagButtonStates() {
  const tagButtons = document.querySelectorAll('#popup-tag-filters .tag-filter');
  tagButtons.forEach(button => {
    const tag = button.dataset.tag;
    button.classList.toggle('active', tagFilter.includes(tag));
  });
}

function updateDropdownText() {
  const dropdownText = document.querySelector('.dropdown-text');
  
  if (!dropdownText) return; // Element doesn't exist in main app, only in admin
  
  if (tagFilter.length === 0) {
    dropdownText.textContent = 'Select tags...';
  } else if (tagFilter.length === 1) {
    dropdownText.textContent = tagFilter[0];
  } else {
    dropdownText.textContent = `${tagFilter.length} tags selected`;
  }
}



function resetTagFilters() {
  tagFilter = [];

  // Update tag button states in popup
  updateTagButtonStates();

  updateDropdownText();
  renderAlerts();
}

// Apply tag filter
function applyTagFilter(list) {
  if (!tagFilter.length) return list;
  return list.filter(alert => {
    const tags = getAlertTagsArray(alert);
    if (!tags.length) return false;
    return tagFilter.some(tag => tags.includes(tag));
  });
}

function getRelevantAlerts(){
  const all = [...serverAlerts, ...autoAlerts];
  const base = showAllTokens ? all : all.filter(a => selectedTokens.includes((a.token || '').toUpperCase()))

  let list = applySeverityFilter(base);
  list = applyTagFilter(list);

  // Hide dismissed unless Show all is ON
  if (!showAll) list = list.filter(a => !isHidden(a));

  return list;
}

// Add tag display to alerts
// Helper: normalize an alert's tags to an array of strings
function getAlertTagsArray(alert){
  try{
    if (Array.isArray(alert.tags)) return alert.tags;
    if (typeof alert.tags === 'string' && alert.tags.trim()){
      const parsed = JSON.parse(alert.tags);
      if (Array.isArray(parsed)) return parsed;
    }
  }catch(_e){}
  // fallback by severity
  const sev = alert.severity || 'info';
  if (sev === 'critical') return ['hack','exploit'];
  if (sev === 'warning') return ['community','migration'];
  return ['community','news'];
}

function renderAlertTags(alert, container) {
  // Normalize tags: handle JSON string, array, or missing -> severity-based default
  const tags = getAlertTagsArray(alert);

  // Render tags
  tags.forEach(tag => {
    const info = ALERT_TAGS[tag];
    if (!info) return;
    const tagEl = document.createElement('span');
    tagEl.className = 'alert-tag';
    tagEl.style.backgroundColor = info.color + '15'; // Light background
    tagEl.style.borderColor = info.color + '40';
    tagEl.style.color = info.color;
    const icon = document.createElement('span');
    icon.className = 'tag-icon';
    icon.textContent = info.icon;
    const label = document.createElement('span');
    label.textContent = info.label;
    tagEl.appendChild(icon);
    tagEl.appendChild(label);
    container.appendChild(tagEl);
  });
}

// SORT: nearest deadline first
function sortAlertsByDeadline(list){
  const now = Date.now();
  const toTs = a => new Date(a.deadline).getTime();
  const upcoming = list.filter(a => toTs(a) >= now).sort((a,b) => toTs(a) - toTs(b));
  const expired  = list.filter(a => toTs(a) <  now).sort((a,b) => toTs(a) - toTs(b));
  return upcoming.concat(expired);
}

function renderAlertsPagination(total, pageSize) {
  const nav = document.getElementById('alerts-pagination');
  if (!nav) return;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) {
    nav.hidden = true;
    nav.innerHTML = '';
    return;
  }
  nav.hidden = false;
  nav.innerHTML = '';
  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'pagination-btn';
  prev.setAttribute('aria-label', 'Previous page');
  prev.textContent = '←';
  prev.disabled = alertsPageIndex <= 0;
  prev.addEventListener('click', () => {
    if (alertsPageIndex > 0) {
      alertsPageIndex--;
      renderAlerts();
    }
  });
  nav.appendChild(prev);
  const maxIdx = pages - 1;
  const windowSize = 8;
  let start = Math.max(0, alertsPageIndex - Math.floor(windowSize / 2));
  let end = Math.min(maxIdx + 1, start + windowSize);
  if (end - start < windowSize) start = Math.max(0, end - windowSize);
  for (let i = start; i < end; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pagination-num' + (i === alertsPageIndex ? ' is-current' : '');
    b.textContent = String(i + 1);
    b.addEventListener('click', () => {
      alertsPageIndex = i;
      renderAlerts();
    });
    nav.appendChild(b);
  }
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'pagination-btn';
  next.setAttribute('aria-label', 'Next page');
  next.textContent = '→';
  next.disabled = alertsPageIndex >= maxIdx;
  next.addEventListener('click', () => {
    if (alertsPageIndex < maxIdx) {
      alertsPageIndex++;
      renderAlerts();
    }
  });
  nav.appendChild(next);
}

function renderAlerts(){
  const fullList = sortAlertsByDeadline(getRelevantAlerts());
  const total = fullList.length;
  const pageSize = ALERTS_PAGE_SIZE;
  const maxPageIdx = Math.max(0, Math.ceil(total / pageSize) - 1);
  if (alertsPageIndex > maxPageIdx) alertsPageIndex = maxPageIdx;
  const list = fullList.slice(alertsPageIndex * pageSize, alertsPageIndex * pageSize + pageSize);

  renderAlertsPagination(total, pageSize);

  alertsListEl.innerHTML = '';
  if (fullList.length === 0){
    noAlertsEl.hidden = false;
    const nav = document.getElementById('alerts-pagination');
    if (nav) { nav.hidden = true; nav.innerHTML = ''; }
    return;
  }
  noAlertsEl.hidden = true;

  const v = '20251021c';

  list.forEach(a => {
    const wrap = document.createElement('div');
    wrap.className = 'alert-item alert-item--feed severity-' + (a.severity || 'info');

    const hidden = isHidden(a);
    if (showAll && hidden) wrap.classList.add('is-hidden');

    const tagsArrForAccent = getAlertTagsArray(a);

    const accentSide = document.createElement('div');
    accentSide.className = 'alert-accent-side';
    if (tagsArrForAccent.includes('migration')) accentSide.classList.add('accent-migration');

    const row = document.createElement('div');
    row.className = 'alert-item-row';

    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'alert-dismiss-btn';
    dismissBtn.setAttribute('aria-label', hidden ? 'Unhide alert' : 'Dismiss alert');
    dismissBtn.title = hidden ? 'Unhide alert' : 'Dismiss alert';
    dismissBtn.textContent = '×';
    dismissBtn.addEventListener('click', () => {
      if (isHidden(a)) unhideAlert(a);
      else dismissAlert(a);
    });

    const coinSection = document.createElement('div');
    coinSection.className = 'coin-section';
    const coinLogo = document.createElement('div');
    coinLogo.className = 'coin-logo';
    const token = (a.token || '').toUpperCase();
    const logoUrl = apiUrl(`/api/logo/${token}`);
    const img = document.createElement('img');
    img.className = 'coin-img';
    img.src = logoUrl;
    img.alt = `${token} logo`;
    img.onerror = function() {
      this.onerror = null;
      this.src = apiUrl(`/api/logo/${token}`);
    };
    coinLogo.appendChild(img);
    coinSection.appendChild(coinLogo);

    const stack = document.createElement('div');
    stack.className = 'alert-content-stack';

    // -- Top meta row: token pill + source badge (inline) ---------------------
    const tokenRow = document.createElement('div');
    tokenRow.className = 'alert-token-row';

    const tokenName = document.createElement('span');
    tokenName.className = 'alert-token-name';
    tokenName.textContent = token || 'Token';
    tokenRow.appendChild(tokenName);

    // Source-type badge (e.g. "Trusted source", "Dev. Team") -- subtle inline
    if (a.source_type) {
      const st = ALERT_SOURCE_TYPES[a.source_type] || null;
      if (st) {
        const srcBadge = document.createElement('span');
        srcBadge.className = 'alert-source-badge';
        srcBadge.textContent = `${st.icon}\u00A0${st.label}`;
        srcBadge.title = st.label;
        tokenRow.appendChild(srcBadge);
      }
    }

    const title = document.createElement('div');
    title.className = 'alert-title';
    title.textContent = a.title;
    // External source link: small icon tucked beside the title
    if (a.source_url) {
      try {
        const u = new URL(a.source_url);
        const extLink = document.createElement('a');
        extLink.className = 'alert-ext-link';
        extLink.href = u.href;
        extLink.target = '_blank';
        extLink.rel = 'noopener noreferrer';
        extLink.title = u.hostname.replace(/^www\./, '');
        extLink.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
        title.appendChild(extLink);
      } catch (_e) {}
    }

    const desc = document.createElement('div');
    desc.className = 'alert-desc';
    desc.textContent = a.description || '';

    const metaWrap = document.createElement('div');
    metaWrap.className = 'alert-meta';
    try {
      if (tagsArrForAccent.includes('migration')){
        const mig = document.createElement('span');
        mig.className = 'alert-pill-migration';
        const icon = document.createElement('span');
        icon.className = 'icon';
        const mimg = document.createElement('img');
        mimg.src = `/icons/lifebuoy@64px.svg?v=${v}`;
        mimg.alt = '';
        mimg.className = 'icon-img';
        mimg.onerror = function(){ this.style.display = 'none'; };
        icon.appendChild(mimg);
        const label = document.createElement('span');
        label.textContent = 'Token Migration';
        mig.appendChild(icon);
        mig.appendChild(label);
        metaWrap.appendChild(mig);
      }
    } catch {}

    const footer = document.createElement('div');
    footer.className = 'alert-card-footer';
    const tagLabels = getAlertTagsArray(a);
    const seenTags = new Set();
    tagLabels.forEach((tg) => {
      const info = ALERT_TAGS[tg];
      if (!info || seenTags.has(tg)) return;
      seenTags.add(tg);
      const chip = document.createElement('span');
      chip.className = 'alert-footer-tag';
      chip.textContent = info.label;
      footer.appendChild(chip);
    });

    const aside = document.createElement('aside');
    aside.className = 'alert-aside';
    const metaChip = document.createElement('span');
    metaChip.className = 'deadline-chip deadline-chip--aside';
    const msLeft = new Date(a.deadline).getTime() - Date.now();
    metaChip.textContent = fmtTimeLeft(msLeft);
    aside.appendChild(metaChip);
    aside.appendChild(dismissBtn);

    stack.appendChild(tokenRow);
    stack.appendChild(title);
    stack.appendChild(desc);
    if (metaWrap.childNodes.length) stack.appendChild(metaWrap);
    stack.appendChild(footer);

    row.appendChild(coinSection);
    row.appendChild(stack);
    row.appendChild(aside);

    wrap.appendChild(accentSide);
    wrap.appendChild(row);

    // Make the whole card a clickable surface that opens the detail page,
    // without hijacking clicks on buttons/links inside it (external link,
    // Dismiss button, etc.).
    wrap.classList.add('alert-item--clickable');
    wrap.setAttribute('role', 'link');
    wrap.setAttribute('tabindex', '0');
    wrap.setAttribute('aria-label', `Open details for ${a.title}`);
    const goToDetail = (e) => {
      // Ignore clicks that hit an interactive element inside the card
      const t = e.target;
      if (t && t.closest && t.closest('button, a, input, textarea')) return;
      window.location.href = `/alert.html?id=${encodeURIComponent(a.id)}`;
    };
    wrap.addEventListener('click', goToDetail);
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.location.href = `/alert.html?id=${encodeURIComponent(a.id)}`;
      }
    });

    wrap._tick = () => {
      metaChip.textContent = fmtTimeLeft(new Date(a.deadline).getTime() - Date.now());
    };

    alertsListEl.appendChild(wrap);
  });
}

// live ticking
let tickTimer = null;
function startTicking(){
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    [...alertsListEl.children].forEach(el => {
      if (typeof el._tick === 'function') el._tick();
    });
  }, 1000);
}

// Helper function to get unique tokens from alerts
function getUniqueTokensFromAlerts(alerts) {
  return [...new Set(alerts.map(a => a.token))].sort();
}

// Small HTML escape helper (used by news tab templating)
function escapeHtml(str){
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Relative time helper (e.g. "3h ago", "2d ago")
function relativeTimeFrom(date){
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return '';
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.round(day / 365);
  return `${yr}y ago`;
}

// --- News Tab Functions ---
function updateNewsTab(newsData) {
  const newsContent = document.getElementById('news-content');
  if (!newsContent) return;
  
  newsContent.innerHTML = '';
  
  if (!newsData || newsData.length === 0) {
    newsContent.innerHTML = '<div class="news-placeholder">No recent news available for your selected tokens.</div>';
    return;
  }
  
  // Create header with filter
  const newsHeaderRow = document.createElement('div');
  newsHeaderRow.className = 'news-header-row';
  
  const newsHeader = document.createElement('h3');
  newsHeader.className = 'news-header';
  newsHeader.textContent = '📰 Your tokens in the News';
  newsHeaderRow.appendChild(newsHeader);
  
  // Get user's selected tokens for the dropdown filter
  const userTokens = showAllTokens ? getUniqueTokensFromAlerts([...serverAlerts, ...autoAlerts]) : selectedTokens;
  const availableTokens = userTokens.filter(token => 
    newsData.some(article => 
      (article.tickers && article.tickers.includes(token)) || article.token === token
    )
  ).sort();
  
  // Add token filter dropdown
  const filterContainer = document.createElement('div');
  filterContainer.className = 'news-filter-container';
  
  const filterSelect = document.createElement('select');
  filterSelect.className = 'news-token-filter';
  filterSelect.innerHTML = `
    <option value="all">All tokens</option>
    ${availableTokens.map(token => `<option value="${token}">${token}</option>`).join('')}
  `;
  filterContainer.appendChild(filterSelect);
  newsHeaderRow.appendChild(filterContainer);
  
  newsContent.appendChild(newsHeaderRow);
  
  const newsContainer = document.createElement('div');
  newsContainer.className = 'news-container';
  
  // Function to render news articles based on filter
  const renderNews = (filterToken = 'all') => {
    newsContainer.innerHTML = '';
    
    const filteredNews = filterToken === 'all' ? newsData : newsData.filter(article => {
      if (article.tickers && article.tickers.length > 0) {
        return article.tickers.includes(filterToken);
      }
      return article.token === filterToken;
    });
    
    if (filteredNews.length === 0) {
      newsContainer.innerHTML = '<div class="news-placeholder">No articles match this filter.</div>';
      return;
    }

    filteredNews.forEach(article => {
      const newsItem = document.createElement('article');
      const sentiment = article.sentiment || 'neutral';
      newsItem.className = `news-item sentiment-${sentiment}`;
      newsItem.dataset.sentiment = sentiment;

      const dateObj = new Date(article.date || article.publishedAt);
      const publishedDate = isNaN(dateObj) ? '' : dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const relativeDate = isNaN(dateObj) ? '' : relativeTimeFrom(dateObj);

      const tickers = (article.tickers && article.tickers.length > 0)
        ? article.tickers.slice(0, 4)
        : (article.token ? [article.token] : []);
      const tickersDisplay = tickers.map(ticker => `<span class="news-ticker">${escapeHtml(ticker)}</span>`).join('');

      const sentimentLabel = sentiment.charAt(0).toUpperCase() + sentiment.slice(1);
      const sentimentIcon = sentiment === 'positive' ? '▲' : sentiment === 'negative' ? '▼' : '■';

      const source = article.source_name || (article.source && article.source.name) || 'Unknown';
      const title = article.title || 'Untitled';
      const description = article.text || article.description || '';
      const hasLink = article.news_url && article.news_url !== '#';

      const imageHtml = article.image_url
        ? `<div class="news-thumb"><img src="${escapeHtml(article.image_url)}" alt="" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`
        : '';

      newsItem.innerHTML = `
        <div class="news-accent"></div>
        ${imageHtml}
        <div class="news-body">
          <div class="news-topline">
            <span class="news-source-pill">${escapeHtml(source)}</span>
            <span class="news-sentiment-pill sentiment-${sentiment}"><span class="news-sent-icon">${sentimentIcon}</span>${escapeHtml(sentimentLabel)}</span>
            ${tickersDisplay ? `<div class="news-tickers">${tickersDisplay}</div>` : ''}
          </div>
          <h4 class="news-title">
            ${hasLink ? `<a href="${escapeHtml(article.news_url)}" target="_blank" rel="noopener">${escapeHtml(title)}</a>` : escapeHtml(title)}
          </h4>
          ${description ? `<p class="news-description">${escapeHtml(description)}</p>` : ''}
          <div class="news-meta">
            ${relativeDate ? `<span class="news-date" title="${escapeHtml(publishedDate)}">${escapeHtml(relativeDate)}</span>` : (publishedDate ? `<span class="news-date">${escapeHtml(publishedDate)}</span>` : '')}
            ${hasLink ? `<a class="news-readmore" href="${escapeHtml(article.news_url)}" target="_blank" rel="noopener">Read article →</a>` : ''}
          </div>
        </div>
      `;
      newsContainer.appendChild(newsItem);
    });
  };
  
  // Initial render
  renderNews();
  
  // Add filter event listener
  filterSelect.addEventListener('change', (e) => {
    renderNews(e.target.value);
  });
  
  newsContent.appendChild(newsContainer);
}

function clearNewsTab() {
  const newsContent = document.getElementById('news-content');
  if (newsContent) {
    newsContent.innerHTML = '<div class="news-placeholder">Select some tokens in your watchlist to see recent news.</div>';
  }
}

// --- News loading -----------------------------------------------------------
async function loadNews() {
  const newsContent = document.getElementById('news-content');
  if (!newsContent) return;

  if (!selectedTokens.length && !showAllTokens) {
    clearNewsTab();
    return;
  }

  newsContent.innerHTML = '<div class="news-placeholder">📰 Loading recent news...</div>';

  try {
    const tokens = showAllTokens ? getUniqueTokensFromAlerts([...serverAlerts, ...autoAlerts]) : selectedTokens;
    
    const response = await apiFetch(apiUrl('/api/news'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tokens })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (data.news && data.news.length > 0) {
      updateNewsTab(data.news);
    } else {
      newsContent.innerHTML = '<div class="news-placeholder">No recent news available for your selected tokens.</div>';
    }
  } catch (error) {
    newsContent.innerHTML = '<div class="news-placeholder">Failed to load news. Please try again later.</div>';
  }
}

// --- Market snapshot (FREE TIER: EOD only) -----------------------------------
async function loadMarket(){
  if (!selectedTokens.length){
    marketItems = [];
    if (marketNoteEl) marketNoteEl.textContent = 'Add tokens to your watchlist to see market data.';
    renderMarket();
    return;
  }
  const symbols = selectedTokens.join(',');
  try{
    const res = await apiFetch(apiUrl(`/api/market/snapshot?symbols=${encodeURIComponent(symbols)}&currency=${CURRENCY_CODE}`));
    const json = await res.json();
    marketItems = json.items || [];
    marketProvider = json.provider || 'none';
    if (marketNoteEl) marketNoteEl.textContent = json.note || 'Market data unavailable.';
  }catch(e){
    console.error('snapshot error', e);
    marketItems = [];
    if (marketNoteEl) marketNoteEl.textContent = 'Data unavailable (free plan limits).';
  }
  renderMarket();
}

function renderMarket(){
  marketGridEl.innerHTML = '';
  if (!marketItems.length){
    marketEmptyEl.hidden = false;
    return;
  } else {
    marketEmptyEl.hidden = true;
  }

  const list = [...marketItems].sort((a,b) => a.token.localeCompare(b.token));
  list.forEach(it => {
    const card = document.createElement('div');
    const changeVal = typeof it.dayChangePct === 'number' ? it.dayChangePct : null;
    const direction = changeVal === null ? 'neutral' : (changeVal >= 0 ? 'up' : 'down');
    card.className = `market-card market-card--${direction}`;

    // Accent stripe (coloured by direction)
    const accent = document.createElement('div');
    accent.className = 'mk-accent';
    card.appendChild(accent);

    const header = document.createElement('div');
    header.className = 'mk-header';

    const badge = document.createElement('div');
    badge.className = 'mk-badge';

    // Use backend API for token logos
    const icon = document.createElement('img');
    icon.src = apiUrl(`/api/logo/${it.token}`);
    icon.alt = `${it.token} logo`;
    icon.className = 'mk-icon';
    icon.onerror = function() {
      this.style.display = 'none';
      const textSpan = document.createElement('span');
      textSpan.textContent = (it.token || '?').slice(0, 3);
      textSpan.className = 'mk-icon-text';
      badge.appendChild(textSpan);
    };
    badge.appendChild(icon);

    const nameWrap = document.createElement('div');
    nameWrap.className = 'mk-titlewrap';
    const name = document.createElement('div');
    name.className = 'mk-title';
    name.textContent = it.token;
    const sub = document.createElement('div');
    sub.className = 'mk-subtitle';
    sub.textContent = it.name || it.token;
    nameWrap.appendChild(name);
    nameWrap.appendChild(sub);

    header.appendChild(badge);
    header.appendChild(nameWrap);

    // Primary indicator pill in header
    if (changeVal !== null) {
      const arrow = document.createElement('span');
      arrow.className = `mk-arrow mk-arrow--${direction}`;
      arrow.innerHTML = direction === 'up' ? '↑' : '↓';
      header.appendChild(arrow);
    }

    const priceWrap = document.createElement('div');
    priceWrap.className = 'mk-pricewrap';

    const price = document.createElement('div');
    price.className = 'mk-price';
    price.textContent = moneyFmt(it.lastPrice);
    priceWrap.appendChild(price);

    // Headline change (large)
    const headline = document.createElement('div');
    const label = marketProvider === 'cmc' ? '24h' : 'EOD';
    headline.className = `mk-headline mk-headline--${direction}`;
    headline.innerHTML = changeVal === null
      ? `<span class="mk-headline-val">—</span><span class="mk-headline-label">${label}</span>`
      : `<span class="mk-headline-val">${changeVal >= 0 ? '+' : ''}${pctFmt(changeVal)}</span><span class="mk-headline-label">${label}</span>`;
    priceWrap.appendChild(headline);

    // Secondary changes row (1h, 7d, 30m)
    const primaryChips = document.createElement('div');
    primaryChips.className = 'mk-row';

    const pushChip = (lbl, val) => {
      if (typeof val !== 'number') return;
      const chip = document.createElement('span');
      const cls = val >= 0 ? 'chg-pos' : 'chg-neg';
      chip.className = `mk-chip ${cls}`;
      chip.innerHTML = `<span class="mk-chip-label">${lbl}</span><span class="mk-chip-val">${val >= 0 ? '+' : ''}${pctFmt(val)}</span>`;
      primaryChips.appendChild(chip);
    };

    pushChip('1h', it.change1hPct);
    pushChip('7d', it.change7dPct);
    pushChip('30m', it.change30mPct);

    // Secondary info row (volume, market cap)
    const secondaryRow = document.createElement('div');
    secondaryRow.className = 'mk-row mk-secondary';

    if (typeof it.volume24h === 'number'){
      const vol = document.createElement('span');
      vol.className = 'mk-info';
      vol.innerHTML = `<span class="mk-info-label">Vol</span><span class="mk-info-val">${volumeFmt(it.volume24h)}</span>`;
      secondaryRow.appendChild(vol);
    }

    if (typeof it.marketCap === 'number'){
      const mcap = document.createElement('span');
      mcap.className = 'mk-info';
      mcap.innerHTML = `<span class="mk-info-label">MCap</span><span class="mk-info-val">${volumeFmt(it.marketCap)}</span>`;
      secondaryRow.appendChild(mcap);
    }

    card.appendChild(header);
    card.appendChild(priceWrap);
    if (primaryChips.children.length > 0) card.appendChild(primaryChips);
    if (secondaryRow.children.length > 0) card.appendChild(secondaryRow);

    if (it.error){
      const err = document.createElement('div');
      err.className = 'mk-err muted';
      err.textContent = 'Data unavailable';
      card.appendChild(err);
    }

    marketGridEl.appendChild(card);
  });
}

// --- Sentinel AI Summary Tab --------------------------------------------------
let _sentinelCache = null;     // { summary, generated_at, stats }
let _sentinelLoading = false;

function sentinelMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+?)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>');
  const lines = html.split('\n');
  const out = [];
  let listType = null;
  for (const line of lines) {
    if (/^\s*[-*_]{3,}\s*$/.test(line)) {
      if (listType) { out.push(`</${listType}>`); listType = null; }
      out.push('<hr class="sentinel-hr">');
      continue;
    }
    const hm = line.match(/^(#{1,3})\s+(.*)$/);
    if (hm) {
      if (listType) { out.push(`</${listType}>`); listType = null; }
      const lvl = Math.min(hm[1].length + 2, 6);
      out.push(`<h${lvl} class="sentinel-heading">${hm[2]}</h${lvl}>`);
      continue;
    }
    const bm = line.match(/^\s*[-*]\s+(.*)$/);
    if (bm) {
      if (listType === 'ol') { out.push('</ol>'); listType = null; }
      if (!listType) { out.push('<ul>'); listType = 'ul'; }
      out.push(`<li>${bm[1]}</li>`);
      continue;
    }
    const nm = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (nm) {
      if (listType === 'ul') { out.push('</ul>'); listType = null; }
      if (!listType) { out.push('<ol>'); listType = 'ol'; }
      out.push(`<li>${nm[1]}</li>`);
      continue;
    }
    if (listType) { out.push(`</${listType}>`); listType = null; }
    if (line.trim() === '') { out.push('<br>'); continue; }
    out.push(`<p>${line}</p>`);
  }
  if (listType) out.push(`</${listType}>`);
  return safeHTML(out.join(''));
}

function renderSentinelStats(stats) {
  const el = document.getElementById('sentinel-stats');
  if (!el || !stats) { if (el) el.innerHTML = ''; return; }
  const items = [
    { icon: '⭐', label: 'Watchlist', value: stats.watchlist_count || 0 },
    { icon: '🔔', label: 'Unread', value: stats.unread_notifications || 0 },
    { icon: '🎯', label: 'Price alerts', value: stats.active_price_alerts || 0 },
    { icon: '🛡️', label: 'Active alerts', value: stats.recent_alerts || 0 }
  ];
  el.innerHTML = items.map(i =>
    `<div class="sentinel-stat"><span class="sentinel-stat__icon">${i.icon}</span><span class="sentinel-stat__value">${i.value}</span><span class="sentinel-stat__label">${i.label}</span></div>`
  ).join('');
}

function renderSentinelTimestamp(isoStr) {
  const el = document.getElementById('sentinel-last-refresh');
  if (!el) return;
  if (!isoStr) { el.textContent = 'Your personalised crypto briefing'; return; }
  try {
    const d = new Date(isoStr);
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    el.textContent = `Last refreshed ${date} at ${time}`;
  } catch (_) {
    el.textContent = 'Updated just now';
  }
}

// --- Sentinel tab: unified conversational AI --------------------------------
const sentinelChatState = { messages: [], isStreaming: false, activeCtrl: null, pillsGenId: 0 };

function sentinelScrollToBottom() {
  const wrap = document.getElementById('sentinel-chat-messages');
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

function sentinelAppendMessage(role, text) {
  const wrap = document.getElementById('sentinel-chat-messages');
  if (!wrap) return null;
  const bubble = document.createElement('div');
  bubble.className = `sentinel-msg sentinel-msg--${role}`;
  const body = document.createElement('div');
  body.className = 'sentinel-msg__body';
  if (role === 'user') body.textContent = text;
  else body.innerHTML = sentinelMarkdown(text || '');
  bubble.appendChild(body);
  wrap.appendChild(bubble);
  sentinelScrollToBottom();
  return { bubble, body };
}

function sentinelAppendTyping() {
  const wrap = document.getElementById('sentinel-chat-messages');
  if (!wrap) return null;
  const el = document.createElement('div');
  el.className = 'sentinel-msg sentinel-msg--assistant sentinel-msg--typing';
  el.innerHTML = '<div class="sentinel-msg__body"><span class="sentinel-typing-label">Thinking</span><span class="sentinel-typing"><span></span><span></span><span></span></span></div>';
  wrap.appendChild(el);
  sentinelScrollToBottom();
  return el;
}

function clearAllPills() {
  document.querySelectorAll('.sentinel-pills').forEach(el => el.remove());
}

function renderPillsAfter(bubbleEl, suggestions) {
  if (!bubbleEl || !Array.isArray(suggestions) || !suggestions.length) return;
  clearAllPills();
  const container = document.createElement('div');
  container.className = 'sentinel-pills';
  suggestions.slice(0, 4).forEach(s => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sentinel-pill';
    btn.innerHTML = `<span class="sentinel-pill__icon">${s.icon || '💬'}</span><span class="sentinel-pill__text"></span>`;
    btn.querySelector('.sentinel-pill__text').textContent = s.text;
    btn.addEventListener('click', () => {
      if (sentinelChatState.isStreaming) return;
      clearAllPills();
      sendSentinelMessage(s.text);
    });
    container.appendChild(btn);
  });
  bubbleEl.insertAdjacentElement('afterend', container);
  sentinelScrollToBottom();
}

async function loadSentinelSummary(forceRefresh = false) {
  if (_sentinelLoading) return;
  const wrap = document.getElementById('sentinel-chat-messages');
  const refreshBtn = document.getElementById('sentinel-refresh-btn');
  if (!wrap) return;

  // If we have a cache and not forcing, just make sure it's rendered (no-op if already rendered)
  if (!forceRefresh && _sentinelCache && wrap.children.length > 0) return;

  _sentinelLoading = true;
  if (refreshBtn) { refreshBtn.disabled = true; refreshBtn.classList.add('is-loading'); }

  // Reset conversation on refresh
  clearAllPills();
  wrap.innerHTML = '';
  sentinelChatState.messages = [];

  // Loading placeholder message
  const loadingBubble = document.createElement('div');
  loadingBubble.className = 'sentinel-msg sentinel-msg--assistant sentinel-msg--loading-summary';
  loadingBubble.innerHTML = '<div class="sentinel-msg__body"><span class="sentinel-typing-label">Analysing your portfolio</span><span class="sentinel-typing"><span></span><span></span><span></span></span></div>';
  wrap.appendChild(loadingBubble);

  try {
    const res = await apiFetch(apiUrl('/api/me/sentinel-summary'));
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    _sentinelCache = data;
    loadingBubble.remove();

    const { bubble, body } = sentinelAppendMessage('assistant', data.summary || '');
    sentinelChatState.messages.push({ role: 'assistant', content: data.summary || '' });
    renderSentinelStats(data.stats);
    renderSentinelTimestamp(data.generated_at);
    renderPillsAfter(bubble, data.suggestions || []);
  } catch (e) {
    console.error('[sentinel] summary load failed:', e);
    loadingBubble.remove();
    const { bubble } = sentinelAppendMessage('assistant', "I couldn't pull your briefing together just now. You can still ask me anything directly, or tap retry.");
    const retry = document.createElement('div');
    retry.className = 'sentinel-pills';
    retry.innerHTML = '<button type="button" class="sentinel-pill"><span class="sentinel-pill__icon">↻</span><span class="sentinel-pill__text">Try again</span></button>';
    retry.querySelector('button').addEventListener('click', () => loadSentinelSummary(true));
    bubble.insertAdjacentElement('afterend', retry);
  } finally {
    _sentinelLoading = false;
    if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.classList.remove('is-loading'); }
  }
}

async function sendSentinelMessage(text) {
  if (!text || sentinelChatState.isStreaming) return;
  sentinelChatState.isStreaming = true;
  clearAllPills();
  sentinelAppendMessage('user', text);
  sentinelChatState.messages.push({ role: 'user', content: text });

  const typingEl = sentinelAppendTyping();
  const sendBtn = document.getElementById('sentinel-chat-send');
  if (sendBtn) sendBtn.disabled = true;

  const ctrl = new AbortController();
  sentinelChatState.activeCtrl = ctrl;
  let assistantBubble = null;
  let assistantBody = null;
  let fullText = '';
  let gotSuggestions = null;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
      credentials: 'include',
      body: JSON.stringify({ messages: sentinelChatState.messages, context: { source: 'sentinel-tab' } }),
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`Chat ${res.status}`);
    const reader = res.body.getReader();
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
        const dataLines = [];
        for (const line of chunk.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        }
        if (!dataLines.length) continue;
        let payload = dataLines.join('\n');
        try { payload = JSON.parse(payload); } catch {}

        if (event === 'chunk') {
          if (!assistantBody) {
            if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
            const m = sentinelAppendMessage('assistant', '');
            assistantBubble = m.bubble; assistantBody = m.body;
          }
          const txt = typeof payload === 'string' ? payload : (payload.text || payload.content || '');
          fullText += txt;
          assistantBody.innerHTML = sentinelMarkdown(fullText);
          sentinelScrollToBottom();
        } else if (event === 'suggestions') {
          if (Array.isArray(payload)) gotSuggestions = payload;
          else if (payload && Array.isArray(payload.items)) gotSuggestions = payload.items;
          else if (payload && Array.isArray(payload.suggestions)) gotSuggestions = payload.suggestions;
        } else if (event === 'done') {
          if (fullText) sentinelChatState.messages.push({ role: 'assistant', content: fullText });
        } else if (event === 'error') {
          if (!assistantBody) {
            if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
            const m = sentinelAppendMessage('assistant', '');
            assistantBubble = m.bubble; assistantBody = m.body;
          }
          assistantBody.innerHTML = '<em>Something went wrong. Please try again.</em>';
        }
      }
    }
    if (assistantBubble && gotSuggestions) renderPillsAfter(assistantBubble, gotSuggestions);
  } catch (e) {
    if (e.name !== 'AbortError') {
      console.error('[sentinel-chat]', e);
      if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
      if (!assistantBody) sentinelAppendMessage('assistant', "_Couldn't reach Sentinel. Please try again._");
    }
  } finally {
    if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
    sentinelChatState.isStreaming = false;
    sentinelChatState.activeCtrl = null;
    if (sendBtn) sendBtn.disabled = false;
  }
}

// Wire up refresh + composer
document.addEventListener('DOMContentLoaded', () => {
  const refreshBtn = document.getElementById('sentinel-refresh-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', () => loadSentinelSummary(true));

  const input = document.getElementById('sentinel-chat-input');
  const sendBtn = document.getElementById('sentinel-chat-send');
  if (!input || !sendBtn) return;

  const submit = () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';
    sendSentinelMessage(text);
  };

  sendBtn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  });
});

window.loadSentinelSummary = loadSentinelSummary;

// --- Render all ---------------------------------------------------------------
function renderAll(){
  renderPills();
  renderAlerts();
}

// --- Expose functions to window for HTML event handlers ---
window.closeTokenRequestModal = closeTokenRequestModal;
window.submitTokenRequest = submitTokenRequest;
