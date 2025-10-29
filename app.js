// --- Config ------------------------------------------------------------------
// Curated base list for reliable suggestions, enriched dynamically from alerts/watchlist
const BASE_TOKENS = [
  'BTC','ETH','USDT','USDC','BNB','SOL','XRP','ADA','DOGE','TRX','TON','DOT','MATIC','AVAX','LINK','UNI',
  'ATOM','ALGO','XMR','LTC','ETC','BCH','BSV','XLM','HBAR','APT','ARB','OP','SUI','NEAR','ICP',
  'MKR','AAVE','COMP','SNX','CRV','BAL','YFI','ZEC','DASH','EOS','FIL','VET','XTZ','KSM','GLMR',
  'POL','OMNI','UXLINK','ENA','DAI'
];
const ALL_TOKENS = [...BASE_TOKENS];
const tagFilterCard   = document.getElementById('filter-tags-card');
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
const panelSummary = document.getElementById('panel-summary');
const panelNews = document.getElementById('panel-news');
const panelMarket = document.getElementById('panel-market');

// Summary controls (buttons will be bound in DOMContentLoaded)
const summaryStampEl = document.getElementById('summary-stamp');
const summaryModelSel = document.getElementById('summary-model');

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
let tagPillsExpanded = false;

// Market state
let marketItems = [];
let marketProvider = 'none';

// Summary navigation button references (assigned in DOMContentLoaded)
let summaryPrevBtn = null;
let summaryNextBtn = null;
let summaryRefreshBtn = null;

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
  if (!selectedTokens.length){
    const hint = document.createElement('span');
    hint.className = 'muted';
    hint.textContent = 'No tokens selected yet.';
    selectedTokensEl.appendChild(hint);
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
        updateSummaryIfActive();
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
    updateSummaryIfActive();
  });
}

// Tabs wiring
function switchTab(tab){
  const name = String(tab || 'alerts');
  // Panels
  if (panelAlerts) panelAlerts.hidden = (name !== 'alerts');
  if (panelSummary) panelSummary.hidden = (name !== 'summary');
  if (panelNews) panelNews.hidden = (name !== 'news');
  if (panelMarket) panelMarket.hidden = (name !== 'market');
  // Tabs active state
  tabs.forEach(t => {
    const is = t.getAttribute('data-tab') === name;
    t.classList.toggle('active', is);
    t.setAttribute('aria-selected', String(is));
  });
  updateFilterVisibility(name);
  if (name === 'summary') renderSummary();
  if (name === 'news') loadNews();
  if (name === 'market') loadMarket();
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
}

// --- Server-backed prefs -----------------------------------------------------
function persistPrefsServerDebounced(){
  clearTimeout(persistPrefsServerDebounced._t);
  persistPrefsServerDebounced._t = setTimeout(() => {
    fetch('/api/me/prefs', {
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
    const response = await fetch('/api/environment');
    if (response.ok) {
      const data = await response.json();
      if (data.environment && data.environment !== 'production') {
        showEnvironmentBanner(data.environment);
      }
    }
  } catch (error) {
    console.log('Could not fetch environment info');
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
      console.log('No tokens selected for ticker');
      return [];
    }

    const symbolsParam = tokens.join(',');
    const response = await fetch(`/api/market/prices?symbols=${symbolsParam}&currency=${CURRENCY_CODE}`);
    
    if (!response.ok) {
      console.error('Failed to fetch ticker prices:', response.status);
      return [];
    }

    const data = await response.json();
    console.log('Fetched ticker data:', data);
    
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
    console.log('Ticker elements not found');
    return;
  }

  if (!pricesData || pricesData.length === 0) {
    console.log('No price data to display in ticker');
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
  
  console.log(`Ticker rendered with ${pricesData.length} tokens`);
}

async function updateTicker() {
  console.log('Updating price ticker...');
  const pricesData = await fetchTickerPrices();
  renderTicker(pricesData);
}

function startTicker() {
  console.log('Starting price ticker...');
  
  // Initial update
  updateTicker();
  
  // Update every 5 minutes (300000ms)
  if (tickerUpdateInterval) {
    clearInterval(tickerUpdateInterval);
  }
  tickerUpdateInterval = setInterval(updateTicker, 300000);
}

function stopTicker() {
  if (tickerUpdateInterval) {
    clearInterval(tickerUpdateInterval);
    tickerUpdateInterval = null;
  }
  
  const tickerEl = document.getElementById('price-ticker');
  if (tickerEl) {
    tickerEl.hidden = true;
  }
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
      userMenuBtn.setAttribute('aria-expanded', !isHidden);
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
  if (action === 'login') window.location.href = '/signup';
      if (action === 'settings' || action === 'profile') window.location.href = '/profile';
      if (action === 'help') window.open('https://github.com/atoates/CLG-DEPLOY', '_blank');
      if (action === 'logout') {
        fetch('/auth/logout', { method:'POST' }).finally(() => { window.location.reload(); });
      }
    });
  }

  // Summary history navigation buttons (assign to global variables, must run after DOM loads)
  summaryPrevBtn = document.getElementById('summary-prev');
  summaryNextBtn = document.getElementById('summary-next');
  summaryRefreshBtn = document.getElementById('summary-refresh');

  if (summaryPrevBtn){
    summaryPrevBtn.addEventListener('click', async ()=>{
      if (!summaryHistory.length){
        summaryHistory = await fetchRecentSummaries(10);
        summaryIndex = 0;
      }
      const nextIdx = Math.min(summaryIndex + 1, summaryHistory.length - 1);
      if (nextIdx !== summaryIndex){
        summaryIndex = nextIdx;
        const item = summaryHistory[summaryIndex];
        renderSummaryFromSaved(item);
        updateSummaryStamp(item);
        updateSummaryHistoryNav(summaryHistory, summaryIndex);
      }
    });
  }

  if (summaryNextBtn){
    summaryNextBtn.addEventListener('click', async ()=>{
      if (!summaryHistory.length){
        summaryHistory = await fetchRecentSummaries(10);
        summaryIndex = 0;
      }
      const nextIdx = Math.max(summaryIndex - 1, 0);
      if (nextIdx !== summaryIndex){
        summaryIndex = nextIdx;
        const item = summaryHistory[summaryIndex];
        renderSummaryFromSaved(item);
        updateSummaryStamp(item);
        updateSummaryHistoryNav(summaryHistory, summaryIndex);
      }
    });
  }

  if (summaryRefreshBtn){
    summaryRefreshBtn.addEventListener('click', async ()=>{
      // Force generate a fresh summary by calling generation directly
      summaryHistory = [];
      summaryIndex = -1;
      await generateNewSummary(); // Force generation regardless of login state
      // After generation, fetch and bind latest list again to enable nav
      setTimeout(async ()=>{
        const list = await fetchRecentSummaries(10);
        if (list.length){
          updateSummaryHistoryNav(list, 0);
          updateSummaryStamp(list[0]);
        }
      }, 1000);
    });
  }
});

// --- Init (boot) -------------------------------------------------------------
(async function boot(){
  let currencySymbols = {}; // Store all available currency symbols
  
  // Fetch market config (currency symbol/code and LogoKit API key) before first render
  try{
    const r = await fetch('/api/market/config');
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
    const res = await fetch('/api/me');
    if (res.ok){
      const me = await res.json();
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

      // Control visibility of logout in menu
      try{
        const logoutNode = document.getElementById('menu-logout');
        if (logoutNode) logoutNode.hidden = !me.loggedIn;
      }catch(_e){}

      // If logged in, replace the Account dropdown with avatar + name button to Profile
      if (me.loggedIn) {
        const btn = document.getElementById('user-menu-btn');
        const menu = document.getElementById('user-menu');
        if (menu) menu.hidden = true;
        if (btn) {
          const clone = btn.cloneNode(false);
          clone.id = 'user-menu-btn';
          clone.setAttribute('aria-haspopup', 'false');
          clone.setAttribute('aria-expanded', 'false');
          // Build avatar + name label
          const wrap = document.createElement('span');
          wrap.style.display = 'inline-flex'; wrap.style.alignItems = 'center'; wrap.style.gap = '8px';
          const av = document.createElement('span');
          av.style.width = '22px'; av.style.height = '22px'; av.style.borderRadius = '999px'; av.style.display = 'inline-block'; av.style.overflow = 'hidden'; av.style.background = '#e2e8f0';
          const url = me.profile?.avatar || '';
          if (url){ const img=document.createElement('img'); img.src=url; img.alt=''; img.width=22; img.height=22; img.style.display='block'; av.appendChild(img); }
          else { av.textContent = (me.profile?.name||'U').trim().charAt(0).toUpperCase(); av.style.fontWeight='800'; av.style.color='#0f172a'; av.style.display='grid'; }
          const nm = document.createElement('span'); nm.textContent = (me.profile?.username ? `@${me.profile.username}` : (me.profile?.name || 'Profile'));
          wrap.appendChild(av); wrap.appendChild(nm);
          clone.appendChild(wrap);
          btn.parentNode.replaceChild(clone, btn);
          clone.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = '/profile';
          });
        }
      }
    }
  }catch(e){ console.warn('prefs load failed', e); }

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

  // Restore summary model selection
  if (summaryModelSel){
    try {
      const savedModel = localStorage.getItem('clg_summary_model');
      // Normalize 'auto' to 'openai' (auto is deprecated)
      if (savedModel === 'auto') {
        summaryModelSel.value = 'openai';
        localStorage.setItem('clg_summary_model', 'openai');
      } else if (savedModel) {
        summaryModelSel.value = savedModel;
      }
      // If no saved model, dropdown will use its default (OpenAI selected in HTML)
    } catch {}
  }

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
    const r = await fetch('/api/tokens');
    if (r.ok) {
      const data = await r.json();
      tokenMetadata = data.tokens || [];
      console.log(`Loaded ${tokenMetadata.length} tokens from ${data.provider || 'unknown'}`);
    }
  } catch (e) {
    console.error('Failed to fetch token metadata:', e);
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
    const resp = await fetch('/api/token-requests', {
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
    console.error('Token request error:', err);
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
    const r = await fetch('/api/alerts');
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
    const res = await fetch('/api/alerts');
    serverAlerts = await res.json();
    console.log('DEBUG: Loaded', serverAlerts.length, 'alerts from server');
    console.log('DEBUG: First few alerts:', serverAlerts.slice(0, 3));
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
    fetch(`/api/market/auto-alerts?symbols=${encodeURIComponent(symbols)}`)
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
  updateSummaryIfActive();
}

function updateTagButtonStates() {
  const tagButtons = document.querySelectorAll('#popup-tag-filters .tag-filter');
  tagButtons.forEach(button => {
    const tag = button.dataset.tag;
    button.classList.toggle('active', tagFilter.includes(tag));
  });
}

function toggleOption(option) {
  const checkbox = option.querySelector('.option-checkbox');
  const value = option.dataset.value;
  
  if (tagFilter.includes(value)) {
    // Remove from selection
    tagFilter = tagFilter.filter(tag => tag !== value);
    option.classList.remove('selected');
    checkbox.classList.remove('checked');
  } else {
    // Add to selection
    tagFilter.push(value);
    option.classList.add('selected');
    checkbox.classList.add('checked');
  }
  
  updateDropdownText();
  renderAlerts();
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



function removeTagFilter(tagToRemove) {
  // Remove from tagFilter array
  tagFilter = tagFilter.filter(tag => tag !== tagToRemove);
  if (tagFilter.length <= 4) tagPillsExpanded = false; // collapse when small
  
  // Update dropdown option visual state
  const dropdownOptions = document.getElementById('tag-dropdown-options');
  const option = dropdownOptions.querySelector(`[data-value="${tagToRemove}"]`);
  if (option) {
    option.classList.remove('selected');
    option.querySelector('.option-checkbox').classList.remove('checked');
  }
  
  updateDropdownText();
  renderAlerts();
}

function resetTagFilters() {
  // Clear all selections
  tagFilter = [];
  tagPillsExpanded = false;
  
  // Update tag button states in popup
  updateTagButtonStates();
  
  updateDropdownText();
  renderAlerts();
  updateSummaryIfActive();
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

function renderAlerts(){
  const list = sortAlertsByDeadline(getRelevantAlerts());
  alertsListEl.innerHTML = '';
  if (list.length === 0){
    noAlertsEl.hidden = false;
    return;
  } else {
    noAlertsEl.hidden = true;
  }

  list.forEach(a => {
    const wrap = document.createElement('div');
    wrap.className = 'alert-item severity-' + (a.severity || 'info');

    const hidden = isHidden(a);
    if (showAll && hidden) wrap.classList.add('is-hidden');

    // Compact dismiss button (cross) in top-left of the card
    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'alert-dismiss-btn';
    dismissBtn.setAttribute('aria-label', hidden ? 'Unhide alert' : 'Dismiss alert');
    dismissBtn.title = hidden ? 'Unhide alert' : 'Dismiss alert';
    dismissBtn.textContent = '×';
    dismissBtn.addEventListener('click', () => {
      // Toggle dismiss/undismiss
      if (isHidden(a)) {
        unhideAlert(a);
      } else {
        dismissAlert(a);
      }
    });
    wrap.appendChild(dismissBtn);

  // Accent strip (severity, with migration override)
  const accent = document.createElement('div');
  accent.className = 'alert-accent';
  const tagsArrForAccent = getAlertTagsArray(a);
  if (tagsArrForAccent.includes('migration')) accent.classList.add('accent-migration');
  wrap.appendChild(accent);

  // COIN LOGO/SYMBOL SECTION
    const coinSection = document.createElement('div');
    coinSection.className = 'coin-section';
    
    const coinLogo = document.createElement('div');
    coinLogo.className = 'coin-logo';
    
    const token = (a.token || '').toUpperCase();
  const logoUrl = `/api/logo/${token}`;
    
    const img = document.createElement('img');
    img.className = 'coin-img';
    img.src = logoUrl;
    img.alt = `${token} logo`;
    img.onerror = function() {
      // Fallback to monogram service on error
      this.onerror = null;
      this.src = `/api/logo/${token}`; // proxy will return monogram
    };
    
    coinLogo.appendChild(img);
    
    const coinSymbol = document.createElement('div');
    coinSymbol.className = 'coin-symbol';
    coinSymbol.textContent = token;
    
    coinSection.appendChild(coinLogo);
    coinSection.appendChild(coinSymbol);

    // SEVERITY INDICATOR
    const severityBadge = document.createElement('div');
    severityBadge.className = 'severity-badge';
    const iconImg = document.createElement('img');
    iconImg.alt = `${a.severity || 'info'} icon`;
    iconImg.className = 'severity-icon-img';
    iconImg.decoding = 'async';
    iconImg.fetchPriority = 'low';
    // Choose icon by severity
    const sev = a.severity || 'info';
    const v = '20251021c';
    iconImg.src = sev === 'critical' 
      ? `/icons/siren@64px.svg?v=${v}` 
      : (sev === 'warning' ? `/icons/flag@64px.svg?v=${v}` : `/icons/lifebuoy@64px.svg?v=${v}`);
    iconImg.onerror = function(){
      // Hide broken icon to avoid layout jank
      this.style.display = 'none';
    };
    severityBadge.appendChild(iconImg);

    // MAIN CONTENT AREA
    const contentArea = document.createElement('div');
    contentArea.className = 'alert-content-area';

    const text = document.createElement('div');
    text.className = 'alert-text';

    const title = document.createElement('div');
    title.className = 'alert-title';
    title.textContent = a.title;
    text.appendChild(title);

    const desc = document.createElement('div');
    desc.className = 'alert-desc';
    desc.textContent = a.description || '';
    text.appendChild(desc);

    const metaWrap = document.createElement('div');
    metaWrap.className = 'alert-meta';
    const metaChip = document.createElement('span');
    metaChip.className = 'deadline-chip';
    const msLeft = new Date(a.deadline).getTime() - Date.now();
    metaChip.textContent = fmtTimeLeft(msLeft);
    metaWrap.appendChild(metaChip);

    // Migration banner pill when applicable
    try {
      const tagsForPill = getAlertTagsArray(a);
      if (tagsForPill.includes('migration')){
        const mig = document.createElement('span');
        mig.className = 'alert-pill-migration';
        const icon = document.createElement('span');
        icon.className = 'icon';
        const img = document.createElement('img');
  img.src = `/icons/lifebuoy@64px.svg?v=${v}`;
        img.alt = '';
        img.className = 'icon-img';
  img.onerror = function(){ this.style.display = 'none'; };
        icon.appendChild(img);
        const label = document.createElement('span');
        label.textContent = 'Token Migration';
        mig.appendChild(icon);
        mig.appendChild(label);
        metaWrap.appendChild(mig);
      }
    } catch {}

    text.appendChild(metaWrap);

    // Read more: shows further_info and source details when expanded
    const hasMore = !!(a.further_info && a.further_info.trim()) || !!(a.source_type || a.source_url);
    if (hasMore) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'more-toggle';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = 'Read more';

      const more = document.createElement('div');
      more.className = 'more-content';
      more.hidden = true;

      // Further info block
      if (a.further_info && a.further_info.trim()){
        const moreInfo = document.createElement('div');
        moreInfo.className = 'more-info';
        moreInfo.textContent = a.further_info;
        more.appendChild(moreInfo);
      }

      // Source details block (chip + optional external link)
      if (a.source_type || a.source_url){
        const sourceRow = document.createElement('div');
        sourceRow.className = 'source-row';
        const st = ALERT_SOURCE_TYPES[a.source_type] || null;
        const chip = document.createElement('span');
        chip.className = 'source-chip';
        chip.textContent = `${st ? st.icon : '🔗'} ${st ? st.label : 'Source'}`;
        sourceRow.appendChild(chip);
        if (a.source_url){
          try{
            const u = new URL(a.source_url);
            const link = document.createElement('a');
            link.className = 'source-link';
            link.href = u.href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = 'Open link';
            sourceRow.appendChild(link);
          }catch(_e){}
        }
        more.appendChild(sourceRow);
      }

      toggle.addEventListener('click', () => {
        const nowOpen = more.hidden;
        more.hidden = !nowOpen;
        toggle.setAttribute('aria-expanded', String(nowOpen));
        toggle.textContent = nowOpen ? 'Read less' : 'Read more';
      });

      text.appendChild(toggle);
      text.appendChild(more);
    }

    contentArea.appendChild(severityBadge);
    contentArea.appendChild(text);

    // No action buttons on card per design (removed Discuss/Acknowledge)

    // TAGS SECTION
    const tagsSection = document.createElement('div');
    tagsSection.className = 'alert-tags-section';
    renderAlertTags(a, tagsSection);

    // Assemble the card
    wrap.appendChild(coinSection);
    wrap.appendChild(contentArea);
    wrap.appendChild(tagsSection);

    // live tick function
    wrap._tick = () => {
      const leftMs = new Date(a.deadline).getTime() - Date.now();
      metaChip.textContent = fmtTimeLeft(leftMs);
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

// --- AI-Powered Summary ------------------------------------------------------
// Force generate a new summary (called by Refresh button)
async function generateNewSummary(){
  const sc = document.getElementById('summary-content');
  
  // Show loading state with countdown
  sc.innerHTML = `
    <div class="loading-state">
      <div class="countdown-container">
        <div class="countdown-circle">
          <svg class="countdown-svg" viewBox="0 0 100 100">
            <circle class="countdown-track" cx="50" cy="50" r="45" fill="none" stroke="#e2e8f0" stroke-width="8"/>
            <circle class="countdown-progress" cx="50" cy="50" r="45" fill="none" stroke="#3b82f6" stroke-width="8" 
                    stroke-linecap="round" transform="rotate(-90 50 50)"/>
          </svg>
          <div class="countdown-number">30</div>
        </div>
        <p class="countdown-text">🤖 Generating AI summary...</p>
      </div>
    </div>
  `;
  
  // Start countdown animation
  let countdownSeconds = 30;
  const countdownNumber = sc.querySelector('.countdown-number');
  const countdownProgress = sc.querySelector('.countdown-progress');
  const circumference = 2 * Math.PI * 45; // radius = 45
  
  countdownProgress.style.strokeDasharray = circumference;
  countdownProgress.style.strokeDashoffset = 0;
  
  window.currentCountdownInterval = setInterval(() => {
    countdownSeconds--;
    countdownNumber.textContent = countdownSeconds;
    
    // Update progress circle
    const progress = (30 - countdownSeconds) / 30;
    const offset = circumference * (1 - progress);
    countdownProgress.style.strokeDashoffset = offset;
    
    if (countdownSeconds <= 0) {
      clearInterval(window.currentCountdownInterval);
      countdownNumber.textContent = '⏳';
      sc.querySelector('.countdown-text').textContent = '🤖 Finalizing summary...';
    }
  }, 1000);
  
  if (!selectedTokens.length && !showAllTokens) {
    sc.innerHTML = '<p class="muted">Select some tokens to see an AI-generated summary of your alerts.</p>';
    return;
  }

  try {
    // Get visible alerts (same filtering as main alerts view)
    const visibleAlerts = getVisibleAlerts();
    
    if (visibleAlerts.length === 0) {
      sc.innerHTML = '<p class="muted">No alerts match your current filters. Adjust your severity or tag filters to see a summary.</p>';
      return;
    }

    // Call AI summary API
    const response = await fetch('/api/summary/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        alerts: visibleAlerts,
        tokens: showAllTokens ? getUniqueTokensFromAlerts(visibleAlerts) : selectedTokens,
        sevFilter: sevFilter,
        tagFilter: tagFilter,
        model: getSelectedModel()
      })
    });

    if (!response.ok) {
      // If 401, user needs to log in
      if (response.status === 401) {
        if (window.currentCountdownInterval) {
          clearInterval(window.currentCountdownInterval);
        }
        // Show the login prompt
        sc.innerHTML = `
          <div style="text-align: center; padding: 40px 20px;">
            <h2 style="margin-bottom: 16px;">🤖 AI-Powered Alert Summaries</h2>
            <p style="color: #64748b; margin-bottom: 24px;">
              Get intelligent analysis of your crypto alerts with AI-generated summaries.
            </p>
            <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; margin-bottom: 24px; text-align: left; max-width: 500px; margin-left: auto; margin-right: auto;">
              <p style="margin: 0 0 12px 0;"><strong>✨ Features include:</strong></p>
              <ul style="margin: 0; padding-left: 20px; color: #475569;">
                <li>Multi-model AI analysis (OpenAI, Anthropic, xAI)</li>
                <li>Severity-based prioritization</li>
                <li>Historical summary tracking</li>
                <li>Customizable filters and preferences</li>
              </ul>
            </div>
            <a href="/auth/google" class="btn-primary" style="display: inline-block; padding: 12px 32px; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">
              Sign in with Google to Continue
            </a>
          </div>
        `;
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    // Clear countdown timer
    if (window.currentCountdownInterval) {
      clearInterval(window.currentCountdownInterval);
    }
    
    // Render the AI summary
    sc.innerHTML = '';
    
    const header = document.createElement('div');
    header.className = 'summary-header';
    
    // Format usage info
    let usageInfo = '';
    if (data.usage) {
      if (data.usage.total_tokens) {
        usageInfo = ` • ${data.usage.total_tokens} API tokens`;
      } else if (data.usage.input_tokens && data.usage.output_tokens) {
        usageInfo = ` • ${data.usage.input_tokens + data.usage.output_tokens} API tokens`;
      }
    }
    
    const ts = new Date(data.timestamp).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', year:'numeric', month:'short', day:'2-digit', timeZoneName:'short' });
    header.innerHTML = `
      <h2 class="section-title">🤖 AI Portfolio Summary</h2>
      <div class="summary-meta">
        <span>${data.alertCount} alerts • ${data.tokenCount} crypto tokens${usageInfo}</span>
        <span class="model-info">Generated by ${data.model} • ${ts}</span>
      </div>
    `;
    sc.appendChild(header);

    const summaryContent = document.createElement('div');
    summaryContent.className = 'summary-text';
    
    // Convert markdown-style formatting to HTML
    const formattedSummary = formatSummaryText(data.summary);
    summaryContent.innerHTML = formattedSummary;
    
    sc.appendChild(summaryContent);

    // Update the news tab if news data is available
    if (data.news && data.news.length > 0) {
      updateNewsTab(data.news);
    } else {
      clearNewsTab();
    }

    // Refresh summary history to enable prev/next navigation
    try {
      const recent = await fetchRecentSummaries(10);
      updateSummaryHistoryNav(recent, 0); // Set to index 0 (newest)
    } catch (histErr) {
      console.warn('Failed to refresh summary history:', histErr);
    }

  } catch (error) {
    console.error('Failed to generate AI summary:', error);
    
    // Clear countdown timer
    if (window.currentCountdownInterval) {
      clearInterval(window.currentCountdownInterval);
    }
    
    // Fallback to basic summary
    sc.innerHTML = '';
    const header = document.createElement('h2');
    header.className = 'section-title';
    header.textContent = '📊 Basic Summary';
    sc.appendChild(header);

    const fallback = generateBasicSummary();
    const content = document.createElement('div');
    content.innerHTML = fallback;
    sc.appendChild(content);

    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = 'AI summary unavailable. Check API configuration.';
    sc.appendChild(note);
  }
}

async function renderSummary(){
  const sc = document.getElementById('summary-content');
  
  // If not logged in, show login prompt instead of auto-generating
  if (!isLoggedIn) {
    sc.innerHTML = `
      <div style="text-align: center; padding: 40px 20px;">
        <h2 style="margin-bottom: 16px;">🤖 AI-Powered Alert Summaries</h2>
        <p style="color: #64748b; margin-bottom: 24px;">
          Get intelligent analysis of your crypto alerts with AI-generated summaries.
        </p>
        <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; margin-bottom: 24px; text-align: left; max-width: 500px; margin-left: auto; margin-right: auto;">
          <p style="margin: 0 0 12px 0;"><strong>✨ Features include:</strong></p>
          <ul style="margin: 0; padding-left: 20px; color: #475569;">
            <li>Multi-model AI analysis (OpenAI, Anthropic, xAI)</li>
            <li>Severity-based prioritization</li>
            <li>Historical summary tracking</li>
            <li>Customizable filters and preferences</li>
          </ul>
        </div>
        <a href="/auth/google" class="btn-primary" style="display: inline-block; padding: 12px 32px; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Sign in with Google to Continue
        </a>
      </div>
    `;
    updateSummaryHistoryNav([], -1);
    return;
  }
  
  // Try to load the most recent saved summary first (for logged-in users)
  try {
    const recent = await fetchRecentSummaries(10);
    if (recent && recent.length > 0){
      const item = recent[0];
      renderSummaryFromSaved(item);
      updateSummaryHistoryNav(recent, 0);
      updateSummaryStamp(item);
      return; // Show last generated response immediately
    }
  } catch(_) {}
  
  // If logged in and no history, show a helpful hint instead of auto-generating
  if (isLoggedIn) {
    sc.innerHTML = '<p class="muted">No saved summaries yet. Click <strong>Refresh</strong> to generate your first summary.</p>';
    updateSummaryHistoryNav([], -1);
    return;
  }
}

// --- Summary History --------------------------------------------------------
let summaryHistory = [];
let summaryIndex = -1; // 0 is latest

function updateSummaryStamp(item){
  if (!summaryStampEl) return;
  try{
    const t = item.created_at || item.timestamp;
    if (t) {
      const ts = new Date(t).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', year:'numeric', month:'short', day:'2-digit', timeZoneName:'short' });
      summaryStampEl.textContent = `Generated ${ts}`;
    }
    else summaryStampEl.textContent = '';
  }catch{ summaryStampEl.textContent = ''; }
}

function renderSummaryFromSaved(item){
  const sc = document.getElementById('summary-content');
  sc.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'summary-header';
  const tokens = Array.isArray(item.tokens) ? item.tokens : [];
  const usage = item.usage || null;
  let usageInfo = '';
  if (usage) {
    const total = usage.total_tokens || ((usage.input_tokens||0) + (usage.output_tokens||0));
    if (total) usageInfo = ` • ${total} API tokens`;
  }
  header.innerHTML = `
    <h2 class="section-title">🤖 AI Portfolio Summary</h2>
    <div class="summary-meta">
      <span>${(item.alertIds||[]).length || ''} ${((item.alertIds||[]).length===1?'alert':'alerts')}${tokens.length?` • ${tokens.length} tokens`:''}${usageInfo}</span>
      <span class="model-info">Generated by ${item.model || 'AI'}${item.created_at?` • ${new Date(item.created_at).toLocaleTimeString()}`:''}</span>
    </div>
  `;
  sc.appendChild(header);

  const body = document.createElement('div');
  body.className = 'summary-text';
  body.innerHTML = formatSummaryText(item.content || '');
  sc.appendChild(body);
}

function updateSummaryHistoryNav(list, idx){
  summaryHistory = list.slice();
  summaryIndex = idx;
  if (summaryPrevBtn) summaryPrevBtn.disabled = (idx >= list.length - 1);
  if (summaryNextBtn) summaryNextBtn.disabled = (idx <= 0);
}

async function fetchRecentSummaries(limit=10){
  try{
    const r = await fetch(`/api/summary/recent?limit=${limit}`);
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j.summaries) ? j.summaries : [];
  }catch{ return []; }
}

// Helper function to get visible alerts (same logic as main view)
function getVisibleAlerts() {
  return getRelevantAlerts();
}

// Helper to update summary if it's the active tab
function updateSummaryIfActive() {
  if (!panelSummary.hidden) {
    renderSummary();
  }
}

// --- Summary model selection -----------------------------------------------
function getSelectedModel(){
  try {
    if (summaryModelSel && summaryModelSel.value) return summaryModelSel.value;
    const saved = localStorage.getItem('clg_summary_model');
    return saved || 'openai'; // Default to OpenAI
  } catch { return 'openai'; }
}
if (summaryModelSel){
  summaryModelSel.addEventListener('change', () => {
    try { localStorage.setItem('clg_summary_model', summaryModelSel.value); } catch {}
    updateSummaryIfActive();
  });
}

// Helper function to get unique tokens from alerts
function getUniqueTokensFromAlerts(alerts) {
  return [...new Set(alerts.map(a => a.token))].sort();
}

// Format summary text (convert **bold** to <strong>, etc.)
function formatSummaryText(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>')
    .replace(/^(\d+\..*$)/gm, '<li>$1</li>')
    .replace(/^(-.*$)/gm, '<li style="list-style: none;">$1</li>');
}

// Basic fallback summary
function generateBasicSummary() {
  const visibleAlerts = getVisibleAlerts();
  const criticalCount = visibleAlerts.filter(a => a.severity === 'critical').length;
  const warningCount = visibleAlerts.filter(a => a.severity === 'warning').length;
  const infoCount = visibleAlerts.filter(a => a.severity === 'info').length;
  
  const tokens = showAllTokens ? getUniqueTokensFromAlerts(visibleAlerts) : selectedTokens;
  
  return `
    <p><strong>Alert Overview:</strong> ${visibleAlerts.length} total alerts across ${tokens.length} tokens</p>
    <p><strong>Severity Breakdown:</strong> ${criticalCount} critical, ${warningCount} warning, ${infoCount} info</p>
    <p><strong>Monitored Tokens:</strong> ${tokens.join(', ')}</p>
    <p><em>Enable AI analysis by configuring OpenAI or Anthropic API keys for detailed insights.</em></p>
  `;
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
    
    filteredNews.forEach(article => {
      const newsItem = document.createElement('div');
      newsItem.className = 'news-item';
      
      const publishedDate = new Date(article.date || article.publishedAt).toLocaleDateString();
      const tickersDisplay = article.tickers && article.tickers.length > 0 
        ? article.tickers.slice(0, 3).map(ticker => `<span class="news-ticker">${ticker}</span>`).join('')
        : (article.token ? `<span class="news-ticker">${article.token}</span>` : '');
      
      // Sentiment indicator
      const sentimentClass = article.sentiment === 'positive' ? 'sentiment-positive' : 
                            article.sentiment === 'negative' ? 'sentiment-negative' : 'sentiment-neutral';
      const sentimentIcon = article.sentiment === 'positive' ? '📈' : 
                           article.sentiment === 'negative' ? '📉' : '📊';
      
      newsItem.innerHTML = `
        <div class="news-content">
          <h4 class="news-title">
            ${article.news_url && article.news_url !== '#' ? `<a href="${article.news_url}" target="_blank" rel="noopener">${article.title}</a>` : article.title}
          </h4>
          <p class="news-description">${article.text || article.description || 'No description available'}</p>
          <div class="news-meta">
            <span class="news-source">${article.source_name || (article.source && article.source.name) || 'Unknown'}</span>
            <span class="news-date">${publishedDate}</span>
            ${article.sentiment && article.sentiment !== 'neutral' ? `<span class="news-sentiment ${sentimentClass}">${sentimentIcon} ${article.sentiment}</span>` : ''}
            ${tickersDisplay}
          </div>
        </div>
        <div class="news-actions">
          <button class="btn-create-alert" data-article='${JSON.stringify(article).replace(/'/g, "&apos;")}'>
            🚨 Create Alert
          </button>
        </div>
      `;
      newsContainer.appendChild(newsItem);
    });
    
    // Add event listeners to all "Create Alert" buttons
    newsContainer.querySelectorAll('.btn-create-alert').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const articleData = JSON.parse(e.target.getAttribute('data-article'));
        openCreateAlertModal(articleData);
      });
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
  console.log('[News Debug] loadNews() called');
  const newsContent = document.getElementById('news-content');
  if (!newsContent) {
    console.error('[News Debug] newsContent element not found!');
    return;
  }

  console.log('[News Debug] selectedTokens:', selectedTokens);
  console.log('[News Debug] showAllTokens:', showAllTokens);

  if (!selectedTokens.length && !showAllTokens) {
    console.log('[News Debug] No tokens selected, clearing news tab');
    clearNewsTab();
    return;
  }

  // Show loading state
  newsContent.innerHTML = '<div class="news-placeholder">📰 Loading recent news...</div>';

  try {
    const tokens = showAllTokens ? getUniqueTokensFromAlerts([...serverAlerts, ...autoAlerts]) : selectedTokens;
    console.log('[News Debug] Fetching news for tokens:', tokens);
    
    const response = await fetch('/api/news', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tokens })
    });

    console.log('[News Debug] Response status:', response.status);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log('[News Debug] Received data:', data);
    console.log('[News Debug] News count:', data.news ? data.news.length : 0);
    
    if (data.news && data.news.length > 0) {
      console.log('[News Debug] Calling updateNewsTab with', data.news.length, 'articles');
      updateNewsTab(data.news);
    } else {
      console.log('[News Debug] No news data, showing placeholder');
      newsContent.innerHTML = '<div class="news-placeholder">No recent news available for your selected tokens.</div>';
    }
  } catch (error) {
    console.error('[News Debug] Error loading news:', error);
    newsContent.innerHTML = '<div class="news-placeholder">Failed to load news. Please try again later.</div>';
  }
}

// --- Create Alert Modal from News Item ---
function openCreateAlertModal(article) {
  // Check if modal already exists, remove it
  const existingModal = document.getElementById('create-alert-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // Create modal container
  const modal = document.createElement('div');
  modal.id = 'create-alert-modal';
  modal.className = 'modal-overlay';
  
  // Determine severity based on sentiment
  let defaultSeverity = 'info';
  if (article.sentiment === 'negative') {
    defaultSeverity = 'warning';
  } else if (article.sentiment === 'positive') {
    defaultSeverity = 'info';
  }
  
  // Get the first ticker if available
  const defaultToken = (article.tickers && article.tickers.length > 0) ? article.tickers[0] : (article.token || '');
  
  // Format the description from the article
  const defaultDescription = article.text || article.description || '';
  
  // Create modal content
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>🚨 Create Alert from News</h2>
        <button class="modal-close" onclick="document.getElementById('create-alert-modal').remove()">&times;</button>
      </div>
      
      <form id="news-alert-form" class="alert-form">
        <div class="form-grid">
          <div>
            <label class="label" for="modal-token">Token</label>
            <input id="modal-token" class="input" placeholder="e.g., ETH or BTC" value="${defaultToken}" required />
          </div>

          <div>
            <label class="label" for="modal-severity">Severity</label>
            <select id="modal-severity" class="input" required>
              <option value="critical" ${defaultSeverity === 'critical' ? 'selected' : ''}>Critical (🚨)</option>
              <option value="warning" ${defaultSeverity === 'warning' ? 'selected' : ''}>Warning (⚠️)</option>
              <option value="info" ${defaultSeverity === 'info' ? 'selected' : ''}>Info (🛟)</option>
            </select>
          </div>

          <div class="col-span-2">
            <label class="label" for="modal-title">Title</label>
            <input id="modal-title" class="input" placeholder="Short, action-oriented title" value="${article.title.replace(/"/g, '&quot;')}" required />
          </div>

          <div class="col-span-2">
            <label class="label" for="modal-description">Description</label>
            <textarea id="modal-description" class="input" rows="3" placeholder="Alert description" required>${defaultDescription}</textarea>
          </div>

          <div class="col-span-2">
            <label class="label" for="modal-info">Further information (optional)</label>
            <textarea id="modal-info" class="input" rows="3" placeholder="Additional context or analysis..."></textarea>
          </div>

          <div>
            <label class="label" for="modal-deadline">Deadline</label>
            <input id="modal-deadline" class="input" type="datetime-local" required />
          </div>

          <div>
            <label class="label" for="modal-source-type">Source</label>
            <div class="row">
              <select id="modal-source-type" class="input" style="height:36px">
                <option value="">— Select type —</option>
                <option value="anonymous">🙈 Anonymous</option>
                <option value="mainstream-media" selected>📰 Mainstream media</option>
                <option value="trusted-source">✅ Trusted source</option>
                <option value="social-media">💬 Social media</option>
                <option value="dev-team">🛠️ Dev. Team</option>
              </select>
              <input id="modal-source-url" class="input" placeholder="Source URL" value="${article.news_url || ''}" />
            </div>
          </div>

          <div class="col-span-2">
            <label class="label">Tags</label>
            <div id="modal-tag-selectors" class="tag-filters" style="padding: 10px 0;">
              <!-- Tags will be populated dynamically -->
            </div>
          </div>

          <div class="form-actions col-span-2">
            <button type="button" class="btn" onclick="document.getElementById('create-alert-modal').remove()">Cancel</button>
            <button type="submit" class="btn btn-teal" id="modal-submit-btn">Create Alert</button>
          </div>
        </div>

        <p id="modal-msg" class="muted" style="margin-top:10px"></p>
      </form>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Set default deadline to 7 days from now
  const deadlineInput = document.getElementById('modal-deadline');
  const defaultDeadline = new Date();
  defaultDeadline.setDate(defaultDeadline.getDate() + 7);
  const formattedDeadline = defaultDeadline.toISOString().slice(0, 16);
  deadlineInput.value = formattedDeadline;
  
  // Populate tags
  populateModalTags(defaultSeverity);
  
  // Handle severity change to update default tags
  document.getElementById('modal-severity').addEventListener('change', (e) => {
    populateModalTags(e.target.value);
  });
  
  // Handle form submission
  document.getElementById('news-alert-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleModalAlertSubmit();
  });
  
  // Close modal when clicking outside
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

function populateModalTags(severity) {
  const tagContainer = document.getElementById('modal-tag-selectors');
  if (!tagContainer) return;
  
  const allTags = [
    'price-change', 'migration', 'hack', 'fork', 'scam',
    'airdrop', 'whale', 'news', 'community', 'exploit', 'privacy',
    'community-vote', 'token-unlocks'
  ];
  
  // Get default tags for severity
  const defaultTags = severity === 'critical' ? ['hack', 'exploit'] :
                     severity === 'warning' ? ['community', 'migration'] :
                     ['community', 'news'];
  
  tagContainer.innerHTML = allTags.map(tag => `
    <label class="tag-checkbox">
      <input type="checkbox" name="tags" value="${tag}" ${defaultTags.includes(tag) ? 'checked' : ''} />
      <span>${tag}</span>
    </label>
  `).join('');
}

async function handleModalAlertSubmit() {
  const msgEl = document.getElementById('modal-msg');
  const submitBtn = document.getElementById('modal-submit-btn');
  
  const token = document.getElementById('modal-token').value.trim();
  const severity = document.getElementById('modal-severity').value;
  const title = document.getElementById('modal-title').value.trim();
  const description = document.getElementById('modal-description').value.trim();
  const further_info = document.getElementById('modal-info').value.trim();
  const deadline = document.getElementById('modal-deadline').value;
  const source_type = document.getElementById('modal-source-type').value;
  const source_url = document.getElementById('modal-source-url').value.trim();
  
  // Get selected tags
  const tagCheckboxes = document.querySelectorAll('#modal-tag-selectors input[name="tags"]:checked');
  const tags = Array.from(tagCheckboxes).map(cb => cb.value);
  
  if (!token || !title || !deadline) {
    msgEl.textContent = '❌ Token, title, and deadline are required.';
    msgEl.style.color = '#ef4444';
    return;
  }
  
  submitBtn.disabled = true;
  msgEl.textContent = '⏳ Creating alert...';
  msgEl.style.color = '#64748b';
  
  try {
    const response = await fetch('/api/alerts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('adminToken') || ''}`
      },
      body: JSON.stringify({
        token,
        severity,
        title,
        description,
        further_info,
        deadline,
        source_type,
        source_url,
        tags
      })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    
    const newAlert = await response.json();
    
    msgEl.textContent = '✅ Alert created successfully!';
    msgEl.style.color = '#10b981';
    
    // Close modal after 1.5 seconds and reload alerts
    setTimeout(() => {
      document.getElementById('create-alert-modal').remove();
      // Reload alerts to show the new one
      loadAlerts();
    }, 1500);
    
  } catch (error) {
    console.error('Error creating alert:', error);
    msgEl.textContent = `❌ ${error.message}`;
    msgEl.style.color = '#ef4444';
    submitBtn.disabled = false;
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
    const res = await fetch(`/api/market/snapshot?symbols=${encodeURIComponent(symbols)}&currency=${CURRENCY_CODE}`);
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
    card.className = 'market-card';

    const header = document.createElement('div');
    header.className = 'mk-header';

    const badge = document.createElement('div');
    badge.className = 'mk-badge';
    
    // Use LogoKit Crypto Logo API for token icons
    const icon = document.createElement('img');
  icon.src = `/api/logo/${it.token}`;
    icon.alt = `${it.token} logo`;
    icon.className = 'mk-icon';
    icon.onerror = function() {
      // Fallback to text if image fails to load
      this.style.display = 'none';
      const textSpan = document.createElement('span');
      textSpan.textContent = (it.token || '?').slice(0, 3);
      textSpan.className = 'mk-icon-text';
      badge.appendChild(textSpan);
    };
    badge.appendChild(icon);

    const name = document.createElement('div');
    name.className = 'mk-title';
    name.textContent = it.token;

    header.appendChild(badge);
    header.appendChild(name);

    const price = document.createElement('div');
    price.className = 'mk-price';
    price.textContent = moneyFmt(it.lastPrice);

    // Primary percentage changes row
    const primaryChips = document.createElement('div');
    primaryChips.className = 'mk-row';

    // 24h change (main)
    const changeVal = typeof it.dayChangePct === 'number' ? it.dayChangePct : null;
    const changeChip = document.createElement('span');
    changeChip.className = 'mk-chip mk-chip-primary ' + (changeVal === null ? 'neutral' : (changeVal >= 0 ? 'chg-pos' : 'chg-neg'));
    const label = marketProvider === 'cmc' ? '24h' : 'EOD';
    changeChip.textContent = `${label} ${pctFmt(changeVal)}`;
    primaryChips.appendChild(changeChip);

    // 1h change
    if (typeof it.change1hPct === 'number'){
      const h1 = document.createElement('span');
      h1.className = 'mk-chip ' + (it.change1hPct >= 0 ? 'chg-pos' : 'chg-neg');
      h1.textContent = `1h ${pctFmt(it.change1hPct)}`;
      primaryChips.appendChild(h1);
    }

    // 7d change
    if (typeof it.change7dPct === 'number'){
      const d7 = document.createElement('span');
      d7.className = 'mk-chip ' + (it.change7dPct >= 0 ? 'chg-pos' : 'chg-neg');
      d7.textContent = `7d ${pctFmt(it.change7dPct)}`;
      primaryChips.appendChild(d7);
    }

    // Secondary info row (volume, market cap)
    const secondaryRow = document.createElement('div');
    secondaryRow.className = 'mk-row mk-secondary';

    if (typeof it.volume24h === 'number'){
      const vol = document.createElement('span');
      vol.className = 'mk-info';
      vol.textContent = `Vol: ${volumeFmt(it.volume24h)}`;
      secondaryRow.appendChild(vol);
    }

    if (typeof it.marketCap === 'number'){
      const mcap = document.createElement('span');
      mcap.className = 'mk-info';
      mcap.textContent = `MCap: ${volumeFmt(it.marketCap)}`;
      secondaryRow.appendChild(mcap);
    }

    if (typeof it.change30mPct === 'number'){
      const m30 = document.createElement('span');
      m30.className = 'mk-chip ' + (it.change30mPct >= 0 ? 'chg-pos' : 'chg-neg');
      m30.textContent = `30m ${pctFmt(it.change30mPct)}`;
      primaryChips.appendChild(m30);
    }

    if (it.error){
      const err = document.createElement('div');
      err.className = 'mk-err muted';
      err.textContent = 'Data unavailable';
      card.appendChild(err);
    }

    card.appendChild(header);
    card.appendChild(price);
    card.appendChild(primaryChips);
    if (secondaryRow.children.length > 0) {
      card.appendChild(secondaryRow);
    }

    marketGridEl.appendChild(card);
  });
}

// --- Render all ---------------------------------------------------------------
function renderAll(){
  renderPills();
  renderAlerts();
  renderSummary();
}

// --- Expose functions to window for HTML event handlers ---
window.closeTokenRequestModal = closeTokenRequestModal;
window.submitTokenRequest = submitTokenRequest;
