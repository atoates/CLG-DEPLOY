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

// --- State -------------------------------------------------------------------
let selectedTokens = [];
let serverAlerts = [];
let autoAlerts = [];
let marketItems = [];
let sevFilter = ['critical','warning','info'];
let showAll = false;
let hiddenKeys = new Set();
let tagFilter = []; // NEW

// --- DOM ---------------------------------------------------------------------
const tokenInput = document.getElementById('token-input');
const tokenDatalist = document.getElementById('token-datalist');
const addTokenBtn = document.getElementById('add-token-btn');
const pillsRow = document.getElementById('selected-tokens');

const tabs = document.querySelectorAll('.tab');
const panelAlerts = document.getElementById('panel-alerts');
const panelSummary = document.getElementById('panel-summary');
const panelMarket = document.getElementById('panel-market');
const summaryContent = document.getElementById('summary-content');

const alertsListEl = document.getElementById('alerts-list');
const noAlertsEl = document.getElementById('no-alerts');

const marketGridEl = document.getElementById('market-grid');
const marketEmptyEl = document.getElementById('market-empty');

// NEW: filter toolbars
const sevFilterWrap = document.getElementById('sev-filter');
const showAllWrap   = document.getElementById('showall-filter');
const tagFilterWrap = document.getElementById('tag-filter');
const tagButtonsWrap= document.getElementById('tag-chips');

// --- Init --------------------------------------------------------------------
renderDatalist();
loadPrefs().then(()=>{
  renderAll();
  loadAlertsFromServer();
  loadMarket(); // prefetch so Market tab is instant
  renderTagFilter();
});

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
    const isAlerts = tab === 'alerts';
    const isSummary = tab === 'summary';
    const isMarket = tab === 'market';
    panelAlerts.hidden = !isAlerts;
    panelSummary.hidden = !isSummary;
    panelMarket.hidden = !isMarket;

    updateFilterVisibility(tab);

    if (isSummary) renderSummary();
    if (isMarket) loadMarket();
  });
});

function updateFilterVisibility(tab){
  const visible = (tab === 'alerts');
  if (sevFilterWrap) sevFilterWrap.hidden = !visible;
  if (showAllWrap)   showAllWrap.hidden   = !visible;
  if (tagFilterWrap) tagFilterWrap.hidden = !visible;
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
  }
  tokenInput.value = '';
  tokenInput.focus();
}

// --- Prefs Load/Save ---------------------------------------------------------
async function loadPrefs(){
  try{
    const res = await fetch('/api/me');
    if (!res.ok) return;
    const me = await res.json();
    selectedTokens = me.watchlist || [];
    sevFilter = me.severity || ['critical','warning','info'];
    showAll = !!me.showAll;
    hiddenKeys = new Set(me.dismissed || []);
    tagFilter = me.tags || [];
  }catch(e){ console.error('prefs load fail', e); }
}
function persistPrefsServerDebounced(){
  clearTimeout(persistPrefsServerDebounced._t);
  persistPrefsServerDebounced._t = setTimeout(async ()=>{
    try{
      await fetch('/api/me/prefs',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          watchlist: selectedTokens,
          severity: sevFilter,
          showAll,
          dismissed: [...hiddenKeys],
          tags: tagFilter
        })
      });
    }catch(e){}
  }, 500);
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
  try{
    const res = await fetch(`/api/market/auto-alerts?symbols=${encodeURIComponent(symbols)}`);
    autoAlerts = await res.json();
  }catch(e){
    console.error('auto alerts error', e);
    autoAlerts = [];
  }
}

function getRelevantAlerts(){
  const base = [...serverAlerts, ...autoAlerts];
  if (!base.length) return [];
  let list = base;
  // filter tokens
  if (selectedTokens.length > 0){
    list = list.filter(a => selectedTokens.includes((a.token||'').toUpperCase()));
  }
  // severity
  list = list.filter(a => sevFilter.includes(a.severity||'info'));
  // tags
  list = applyTagFilter(list);
  // dismissed
  if (!showAll) list = list.filter(a => !hiddenKeys.has(a.id));
  return list;
}
function applyTagFilter(list){
  if (!tagFilter || tagFilter.length===0) return list;
  const set = new Set(tagFilter);
  return list.filter(a => {
    const tags = Array.isArray(a.tags) ? a.tags : [];
    return tags.some(t => set.has(t));
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

    text.appendChild(title);
    text.appendChild(desc);

    // NEW: tags row
    const tags = Array.isArray(a.tags) ? a.tags : [];
    if (tags.length){
      const tagsRow = document.createElement('div');
      tagsRow.className = 'alert-tags';
      tags.forEach(t => {
        const chip = document.createElement('span');
        chip.className = 'mk-chip neutral';
        chip.textContent = t;
        tagsRow.appendChild(chip);
      });
      text.appendChild(tagsRow);
    }

    left.appendChild(icon);
    left.appendChild(text);

    const metaWrap = document.createElement('div');
    metaWrap.className = 'alert-deadline';
    const msLeft = new Date(a.deadline).getTime() - Date.now();
    metaWrap.textContent = fmtTimeLeft(msLeft);

    wrap.appendChild(left);
    wrap.appendChild(metaWrap);

    wrap._tick = () => {
      const leftMs = new Date(a.deadline).getTime() - Date.now();
      metaWrap.textContent = fmtTimeLeft(leftMs);
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

// --- Weekly Summary (mock) ---------------------------------------------------
function renderSummary(){
  const tokens = selectedTokens;
  const out = [];
  if (tokens.includes('BTC')) out.push('- BTC: Network activity ticked up; devs debated a future fork proposal.');
  if (tokens.includes('ETH')) out.push('- ETH: Staking withdrawals increased; core devs signalled steady upgrade progress.');
  if (tokens.includes('MATIC')) out.push('- MATIC: Transition to POL remains on track.');
  if (tokens.includes('UNI')) out.push('- UNI: Large holder flows spotted; monitor governance.');
  if (tokens.includes('SOL')) out.push('- SOL: Validator upgrade window scheduled.');
  if (tokens.includes('USDC')) out.push('- USDC: Issuer posted routine compliance updates.');
  if (tokens.includes('LINK')) out.push('- LINK: Oracle performance optimisations rolling out.');
  if (tokens.includes('ADA')) out.push('- ADA: Community proposals discussed throughput.');
  if (tokens.includes('DOGE')) out.push('- DOGE: Client updates recommended for improved security.');
  if (tokens.includes('POL')) out.push('- POL: Ecosystem integrations expanding.');
  const sc = document.getElementById('summary-content');
  sc.innerHTML = '';
  if (out.length === 0){
    sc.innerHTML = '<p class="muted">Select some tokens to see a summary.</p>';
  } else {
    const h = document.createElement('h2'); h.className='section-title'; h.textContent='Summary (mock)';
    sc.appendChild(h);
    out.forEach(line => { const p=document.createElement('p'); p.textContent=line; sc.appendChild(p); });
  }
}

// --- Market snapshot ----------------------------------------------------------
async function loadMarket(){
  const symbols = (selectedTokens.length ? selectedTokens : ALL_TOKENS).join(',');
  try{
    const res = await fetch(`/api/market/snapshot?symbols=${encodeURIComponent(symbols)}`);
    const json = await res.json();
    marketItems = json.items || [];
    const noteEl = document.getElementById('market-note');
    if (noteEl) noteEl.textContent = json.note || 'End-of-day aggregates (free tier).';
  }catch(e){
    console.error('snapshot error', e);
    marketItems = [];
    const noteEl = document.getElementById('market-note');
    if (noteEl) noteEl.textContent = 'Data unavailable.';
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
    header.className = 'mk-title';
    header.textContent = it.token;

    const price = document.createElement('div');
    price.className = 'mk-price';
    price.textContent = moneyFmt(it.lastPrice);

    const row = document.createElement('div');
    row.className = 'mk-row';

    const d24 = document.createElement('span');
    d24.className = 'mk-chip ' + (it.dayChangePct >= 0 ? 'chg-pos' : 'chg-neg');
    d24.textContent = `24h ${pctFmt(it.dayChangePct)}`;

    row.appendChild(d24);

    card.appendChild(header);
    card.appendChild(price);
    card.appendChild(row);

    marketGridEl.appendChild(card);
  });
}

// --- Tag Filter UI -----------------------------------------------------------
async function renderTagFilter(){
  if (!tagButtonsWrap) return;
  let tagsList = [];
  try{
    const r = await fetch('/api/tags');
    const j = await r.json();
    tagsList = Array.isArray(j.tags) ? j.tags : [];
  }catch{}
  if (!tagsList.length){
    tagsList = ['Price change','Migration','Hack','Fork','Scam','Airdrop','Whale alert','News','Community','Exploit'];
  }

  tagButtonsWrap.innerHTML = '';
  // "All"
  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'chip tag-chip ' + (tagFilter.length===0 ? 'active':'');
  allBtn.textContent = 'All';
  allBtn.addEventListener('click', ()=>{
    tagFilter = [];
    persistPrefsServerDebounced();
    renderTagFilter();
    renderAlerts();
  });
  tagButtonsWrap.appendChild(allBtn);

  tagsList.forEach(t=>{
    const btn = document.createElement('button');
    btn.type='button';
    btn.className='chip tag-chip' + (tagFilter.includes(t)?' active':'');
    btn.textContent=t;
    btn.addEventListener('click', ()=>{
      const i=tagFilter.indexOf(t);
      if(i>=0) tagFilter.splice(i,1); else tagFilter.push(t);
      persistPrefsServerDebounced();
      renderTagFilter();
      renderAlerts();
    });
    tagButtonsWrap.appendChild(btn);
  });
}

// --- Render all ---------------------------------------------------------------
function renderAll(){
  renderPills();
  renderAlerts();
  renderSummary();
}
