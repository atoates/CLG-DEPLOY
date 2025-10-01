// --- Config ------------------------------------------------------------------
const ALL_TOKENS = ['BTC','ETH','USDC','MATIC','DOGE','ADA','SOL','POL','UNI','LINK'];

// --- Utilities ---------------------------------------------------------------
function fmtTimeLeft(msLeft){
  if (msLeft <= 0) return 'Expired';
  const totalSeconds = Math.floor(msLeft / 1000);
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m ${s}s left`;
}
function pctFmt(n){
  if (n === null || n === undefined || isNaN(n)) return '—';
  const s = n >= 0 ? '+' : '';
  return `${s}${n.toFixed(2)}%`;
}
function moneyFmt(n){
  if (n === null || n === undefined || isNaN(n)) return '—';
  return '$' + Number(n).toLocaleString(undefined, {maximumFractionDigits: 2});
}
function alertKey(a){
  return [
    (a.token || '').toUpperCase(),
    a.title || '',
    a.deadline || '',
    a.severity || 'info'
  ].join('|');
}

// --- Import tag definitions ------------------------------------------------
import { ALERT_TAGS } from './alerts-tags.js';

// --- State (will be hydrated from /api/me) -----------------------------------
let selectedTokens = [];                                 // watchlist
let showAll       = false;                               // include dismissed
let sevFilter     = ['critical','warning','info'];       // active severities
let tagFilter     = [];                                  // active tag filters
let hiddenKeys    = new Set();                           // dismissed set

let serverAlerts = [];
let autoAlerts   = [];
let marketItems  = [];

// --- DOM ---------------------------------------------------------------------
const tokenInput      = document.getElementById('token-input');
const tokenDatalist   = document.getElementById('token-datalist');
const addTokenBtn     = document.getElementById('add-token-btn');
const pillsRow        = document.getElementById('selected-tokens');

const tabs            = document.querySelectorAll('.tab');
const panelAlerts     = document.getElementById('panel-alerts');
const panelSummary    = document.getElementById('panel-summary');
const panelMarket     = document.getElementById('panel-market');

const alertsListEl    = document.getElementById('alerts-list');
const noAlertsEl      = document.getElementById('no-alerts');

const marketGridEl    = document.getElementById('market-grid');
const marketEmptyEl   = document.getElementById('market-empty');
const marketNoteEl    = document.getElementById('market-note');

const sevFilterWrap   = document.getElementById('sev-filter');
const showAllWrap     = document.getElementById('showall-wrap');
const showAllToggle   = document.getElementById('toggle-show-all');

const sevButtons      = document.querySelectorAll('.sev-btn');

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

// --- Init (boot) -------------------------------------------------------------
(async function boot(){
  // Load user preferences from server (cookie-based anon ID)
  try{
    const res = await fetch('/api/me');
    if (res.ok){
      const me = await res.json();
      selectedTokens = Array.isArray(me.watchlist) ? me.watchlist : [];
      sevFilter      = Array.isArray(me.severity) ? me.severity : ['critical','warning','info'];
      showAll        = !!me.showAll;
      hiddenKeys     = new Set(Array.isArray(me.dismissed) ? me.dismissed : []);
    }
  }catch(e){ console.warn('prefs load failed', e); }

  // Sync UI controls to prefs
  if (showAllToggle) showAllToggle.checked = showAll;
  syncSevUi();
  
  // Initialize tag filters
  initializeTagFilters();

  // Render + load data
  renderDatalist();
  renderAll();
  loadAlertsFromServer();
  loadMarket();
  updateFilterVisibility('alerts'); // default tab
})();

// --- Datalist ----------------------------------------------------------------
function renderDatalist(){
  tokenDatalist.innerHTML = '';
  ALL_TOKENS.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    tokenDatalist.appendChild(opt);
  });
}

// --- Pills -------------------------------------------------------------------
function renderPills(){
  pillsRow.innerHTML = '';
  selectedTokens.forEach(t => {
    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.textContent = t;

    const btn = document.createElement('button');
    btn.className = 'remove';
    btn.setAttribute('aria-label', `Remove ${t}`);
    btn.textContent = '×';
    btn.addEventListener('click', () => {
      selectedTokens = selectedTokens.filter(x => x !== t);
      persistPrefsServerDebounced();
      renderAll();
      loadMarket();
      loadAutoAlerts().then(renderAlerts);
    });

    pill.appendChild(btn);
    pillsRow.appendChild(pill);
  });
}

// --- Tabs --------------------------------------------------------------------
tabs.forEach(btn => {
  btn.addEventListener('click', () => {
    tabs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const tab = btn.getAttribute('data-tab');
    const isAlerts  = tab === 'alerts';
    const isSummary = tab === 'summary';
    const isMarket  = tab === 'market';

    panelAlerts.hidden  = !isAlerts;
    panelSummary.hidden = !isSummary;
    panelMarket.hidden  = !isMarket;

    updateFilterVisibility(tab);

    if (isSummary) renderSummary();
    if (isMarket)  loadMarket();
  });
});

function updateFilterVisibility(tab){
  const visible = (tab === 'alerts');
  if (sevFilterWrap) sevFilterWrap.hidden = !visible;
  if (showAllWrap)   showAllWrap.hidden   = !visible;
}

// --- Token Add ---------------------------------------------------------------
addTokenBtn.addEventListener('click', tryAddTokenFromInput);
tokenInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tryAddTokenFromInput();
});
function tryAddTokenFromInput(){
  const val = (tokenInput.value || '').toUpperCase().trim();
  if (!val) return;
  if (!ALL_TOKENS.includes(val)){
    if (/^[A-Z0-9]{2,10}$/.test(val)) { ALL_TOKENS.push(val); renderDatalist(); }
    else { tokenInput.value = ''; return; }
  }
  if (!selectedTokens.includes(val)){
    selectedTokens.push(val);
    persistPrefsServerDebounced();
    renderAll();
    loadMarket();
    loadAutoAlerts().then(renderAlerts);
  }
  tokenInput.value = '';
  tokenInput.focus();
}

// --- Show all toggle ---------------------------------------------------------
if (showAllToggle) {
  showAllToggle.addEventListener('change', () => {
    showAll = showAllToggle.checked;
    persistPrefsServerDebounced();
    renderAlerts();
  });
}

// --- Severity selector buttons ----------------------------------------------
function syncSevUi(){
  sevButtons.forEach(btn => {
    const sev = btn.dataset.sev;
    const on = sevFilter.includes(sev);
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  });
}
sevButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const sev = btn.dataset.sev;
    const idx = sevFilter.indexOf(sev);
    if (idx >= 0) sevFilter.splice(idx, 1);
    else sevFilter.push(sev);
    syncSevUi();
    persistPrefsServerDebounced();
    renderAlerts();
  });
});

// --- Hidden alerts helpers ---------------------------------------------------
function persistHidden(){
  // keep local shadow if you want, but server is the source of truth now
  persistPrefsServerDebounced();
}
function isHidden(a){ return hiddenKeys.has(alertKey(a)); }
function dismissAlert(a){
  hiddenKeys.add(alertKey(a));
  persistHidden();
  renderAlerts();
}
function unhideAlert(a){
  hiddenKeys.delete(alertKey(a));
  persistHidden();
  renderAlerts();
}

// --- Alerts (Saved + Auto) ---------------------------------------------------
async function loadAlertsFromServer(){
  try{
    const res = await fetch('/api/alerts');
    serverAlerts = await res.json();
  }catch(e){
    console.error('Failed to fetch /api/alerts', e);
    serverAlerts = [];
  }
  await loadAutoAlerts();
  renderAlerts();
  startTicking();
}

async function loadAutoAlerts(){
  autoAlerts = [];
  if (selectedTokens.length === 0) return;

  const symbols = selectedTokens.join(',');

  const tasks = [
    // existing market-derived alerts
    fetch(`/api/market/auto-alerts?symbols=${encodeURIComponent(symbols)}`)
      .then(r => r.ok ? r.json() : [])
      .catch(() => []),

    // NEW: CryptoPanic-derived alerts
    fetch(`/api/news/cryptopanic-alerts?symbols=${encodeURIComponent(symbols)}&size=50`)
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
  ];

  try{
    const [mk, cp] = await Promise.all(tasks);
    autoAlerts = []
      .concat(Array.isArray(mk) ? mk : [])
      .concat(Array.isArray(cp) ? cp : []);
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
  const tagFiltersEl = document.getElementById('tag-filters');
  tagFiltersEl.innerHTML = '';
  
  Object.entries(ALERT_TAGS).forEach(([tag, info]) => {
    const btn = document.createElement('button');
    btn.className = 'tag-filter';
    btn.setAttribute('data-tag', tag);
    btn.setAttribute('aria-pressed', 'false');
    btn.style.borderColor = info.color;
    
    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = info.icon;
    
    const label = document.createElement('span');
    label.textContent = info.label;
    
    btn.appendChild(icon);
    btn.appendChild(label);
    
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      btn.setAttribute('aria-pressed', btn.classList.contains('active'));
      
      const tag = btn.getAttribute('data-tag');
      const idx = tagFilter.indexOf(tag);
      if (idx >= 0) tagFilter.splice(idx, 1);
      else tagFilter.push(tag);
      
      renderAlerts();
    });
    
    tagFiltersEl.appendChild(btn);
  });
}

// Apply tag filter
function applyTagFilter(list) {
  if (!tagFilter.length) return list;
  return list.filter(alert => {
    if (!alert.tags || !alert.tags.length) return false;
    return tagFilter.some(tag => alert.tags.includes(tag));
  });
}

function getRelevantAlerts(){
  if (selectedTokens.length === 0) return [];
  const base = [...serverAlerts, ...autoAlerts].filter(a =>
    selectedTokens.includes((a.token || '').toUpperCase())
  );

  let list = applySeverityFilter(base);
  list = applyTagFilter(list);

  // Hide dismissed unless Show all is ON
  if (!showAll) list = list.filter(a => !isHidden(a));

  return list;
}

// Add tag display to alerts
function renderAlertTags(alert, parentEl) {
  if (!alert.tags || !alert.tags.length) return;
  
  const tagsWrap = document.createElement('div');
  tagsWrap.className = 'alert-tags';
  
  alert.tags.forEach(tag => {
    const info = ALERT_TAGS[tag];
    if (!info) return;
    
    const tagEl = document.createElement('span');
    tagEl.className = 'alert-tag';
    tagEl.style.background = info.color + '15'; // 15 = 10% opacity
    tagEl.style.color = info.color;
    
    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = info.icon;
    
    const label = document.createElement('span');
    label.textContent = info.label;
    
    tagEl.appendChild(icon);
    tagEl.appendChild(label);
    tagsWrap.appendChild(tagEl);
  });
  
  parentEl.appendChild(tagsWrap);
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

    // LEFT: icon + text
    const left = document.createElement('div');
    left.className = 'content';

    const icon = document.createElement('span');
    icon.className = 'alert-icon';
    icon.textContent = a.severity === 'critical' ? '🚨' : (a.severity === 'warning' ? '⚠️' : '🛟');

    const text = document.createElement('div');

    const title = document.createElement('div');
    title.className = 'alert-title';
    title.textContent = `${a.title} — ${(a.token || '').toUpperCase()}`;

    const desc = document.createElement('div');
    desc.className = 'alert-desc';
    desc.textContent = a.description || '';

    const metaWrap = document.createElement('div');
    metaWrap.className = 'alert-meta';
    const metaChip = document.createElement('span');
    metaChip.className = 'deadline-chip';
    const msLeft = new Date(a.deadline).getTime() - Date.now();
    metaChip.textContent = fmtTimeLeft(msLeft);
    metaWrap.appendChild(metaChip);

    text.appendChild(title);
    text.appendChild(desc);
    text.appendChild(metaWrap);
    
    // Add tags display
    renderAlertTags(a, text);

    left.appendChild(icon);
    left.appendChild(text);

    // RIGHT: divided dismiss column (title + checkbox)
    const right = document.createElement('div');
    right.className = 'dismiss-col';

    const label = document.createElement('div');
    label.className = 'dismiss-title';
    label.textContent = 'Dismiss';

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'chk-dismiss';
    chk.checked = hidden;
    chk.title = hidden ? 'Unhide alert' : 'Dismiss alert';
    chk.setAttribute('aria-label', chk.title);

    chk.addEventListener('change', () => {
      if (chk.checked) dismissAlert(a); else unhideAlert(a);
    });

    right.appendChild(label);
    right.appendChild(chk);

    wrap.appendChild(left);
    wrap.appendChild(right);

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

// --- Summary (mock) ----------------------------------------------------------
function renderSummary(){
  const tokens = selectedTokens;
  const out = [];
  if (tokens.includes('BTC')) out.push('- BTC: Network activity ticked up; devs debated a future fork proposal. No immediate action required.');
  if (tokens.includes('ETH')) out.push('- ETH: Staking withdrawals increased; core devs signalled steady upgrade progress.');
  if (tokens.includes('MATIC')) out.push('- MATIC: Transition to POL remains on track; migration tooling improving.');
  if (tokens.includes('UNI')) out.push('- UNI: Large holder flows spotted; monitor governance/treasury chatter.');
  if (tokens.includes('SOL')) out.push('- SOL: Validator upgrade window scheduled; ecosystem projects testing compatibility.');
  if (tokens.includes('USDC')) out.push('- USDC: Issuer posted routine compliance updates; peg remains stable.');
  if (tokens.includes('LINK')) out.push('- LINK: Oracle performance optimisations rolling out.');
  if (tokens.includes('ADA')) out.push('- ADA: Community proposals discussed throughput; research teams shared progress.');
  if (tokens.includes('DOGE')) out.push('- DOGE: Client updates recommended for improved security and reliability.');
  if (tokens.includes('POL')) out.push('- POL: Ecosystem integrations expanding; bridging UX under refinement.');
  const sc = document.getElementById('summary-content');
  sc.innerHTML = '';
  if (out.length === 0){
    sc.innerHTML = '<p class="muted">Select some tokens to see a summary.</p>';
  } else {
    const h = document.createElement('h2'); h.className='section-title'; h.textContent='AI-Generated Summary (mock)';
    sc.appendChild(h);
    out.forEach(line => { const p=document.createElement('p'); p.textContent=line; sc.appendChild(p); });
    const note=document.createElement('p'); note.className='muted'; note.textContent='(This summary is auto-generated based on trending news for your selected tokens.)'; sc.appendChild(note);
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
    const res = await fetch(`/api/market/snapshot?symbols=${encodeURIComponent(symbols)}`);
    const json = await res.json();
    marketItems = json.items || [];
    if (marketNoteEl) marketNoteEl.textContent = json.note || 'End-of-day aggregates (free tier).';
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
    badge.textContent = (it.token || '?').slice(0,3);

    const name = document.createElement('div');
    name.className = 'mk-title';
    name.textContent = it.token;

    header.appendChild(badge);
    header.appendChild(name);

    const price = document.createElement('div');
    price.className = 'mk-price';
    price.textContent = moneyFmt(it.lastPrice);

    const chips = document.createElement('div');
    chips.className = 'mk-row';

    const eodVal = typeof it.dayChangePct === 'number' ? it.dayChangePct : null;
    const eod = document.createElement('span');
    eod.className = 'mk-chip ' + (eodVal === null ? 'neutral' : (eodVal >= 0 ? 'chg-pos' : 'chg-neg'));
    eod.textContent = `EOD ${pctFmt(eodVal)}`;
    chips.appendChild(eod);

    if (typeof it.change30mPct === 'number'){
      const m30 = document.createElement('span');
      m30.className = 'mk-chip ' + (it.change30mPct >= 0 ? 'chg-pos' : 'chg-neg');
      m30.textContent = `30m ${pctFmt(it.change30mPct)}`;
      chips.appendChild(m30);
    }

    if (it.error){
      const err = document.createElement('div');
      err.className = 'mk-err muted';
      err.textContent = 'Data unavailable';
      card.appendChild(err);
    }

    card.appendChild(header);
    card.appendChild(price);
    card.appendChild(chips);

    marketGridEl.appendChild(card);
  });
}

// --- Render all ---------------------------------------------------------------
function renderAll(){
  renderPills();
  renderAlerts();
  renderSummary();
}
