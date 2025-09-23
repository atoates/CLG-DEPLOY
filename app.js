// --- Config ------------------------------------------------------------------
const ALL_TOKENS = [
  'BTC',
  'ETH',
  'USDC',
  'MATIC',
  'DOGE',
  'ADA',
  'SOL',
  'POL',
  'UNI',
  'LINK',
];

// --- Utilities ---------------------------------------------------------------
function fmtTimeLeft(msLeft) {
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
function pctFmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const s = n >= 0 ? '+' : '';
  return `${s}${n.toFixed(2)}%`;
}
function moneyFmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return (
    '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })
  );
}

// --- State -------------------------------------------------------------------
let selectedTokens = JSON.parse(
  localStorage.getItem('cl_selectedTokens') || '[]'
);
let serverAlerts = [];
let autoAlerts = [];
let marketItems = [];

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
const marketNoteEl = document.getElementById('market-note');

// --- Init --------------------------------------------------------------------
renderDatalist();
renderAll();
loadAlertsFromServer();
loadMarket(); // prefetch so Market tab is instant

// --- Datalist ----------------------------------------------------------------
function renderDatalist() {
  tokenDatalist.innerHTML = '';
  ALL_TOKENS.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t;
    tokenDatalist.appendChild(opt);
  });
}

// --- Pills -------------------------------------------------------------------
function renderPills() {
  pillsRow.innerHTML = '';
  selectedTokens.forEach((t) => {
    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.textContent = t;

    const btn = document.createElement('button');
    btn.className = 'remove';
    btn.setAttribute('aria-label', `Remove ${t}`);
    btn.textContent = '×';
    btn.addEventListener('click', () => {
      selectedTokens = selectedTokens.filter((x) => x !== t);
      persistState();
      renderAll();
      loadMarket();
      // refresh auto alerts for the new selection
      loadAutoAlerts().then(renderAlerts);
    });

    pill.appendChild(btn);
    pillsRow.appendChild(pill);
  });
}

// --- Tabs --------------------------------------------------------------------
tabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabs.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    const tab = btn.getAttribute('data-tab');
    const isAlerts = tab === 'alerts';
    const isSummary = tab === 'summary';
    const isMarket = tab === 'market';

    panelAlerts.hidden = !isAlerts;
    panelSummary.hidden = !isSummary;
    panelMarket.hidden = !isMarket;

    if (isSummary) renderSummary();
    if (isMarket) loadMarket();
  });
});

// --- Token Add ---------------------------------------------------------------
addTokenBtn.addEventListener('click', tryAddTokenFromInput);
tokenInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tryAddTokenFromInput();
});
function tryAddTokenFromInput() {
  const val = (tokenInput.value || '').toUpperCase().trim();
  if (!val) return;
  if (!ALL_TOKENS.includes(val)) {
    if (/^[A-Z0-9]{2,10}$/.test(val)) {
      ALL_TOKENS.push(val);
      renderDatalist();
    } else {
      tokenInput.value = '';
      return;
    }
  }
  if (!selectedTokens.includes(val)) {
    selectedTokens.push(val);
    persistState();
    renderAll();
    loadMarket();
    // refresh auto alerts for the new selection
    loadAutoAlerts().then(renderAlerts);
  }
  tokenInput.value = '';
  tokenInput.focus();
}
function persistState() {
  localStorage.setItem('cl_selectedTokens', JSON.stringify(selectedTokens));
}

// --- Alerts (Saved + Auto) ---------------------------------------------------
async function loadAlertsFromServer() {
  try {
    const res = await fetch('/api/alerts');
    serverAlerts = await res.json();
  } catch (e) {
    console.error('Failed to fetch /api/alerts', e);
    serverAlerts = [];
  }
  await loadAutoAlerts();
  renderAlerts();
  startTicking();
}

async function loadAutoAlerts() {
  // Only fetch auto alerts when there are selected tokens
  if (!selectedTokens.length) {
    autoAlerts = [];
    return;
  }
  const symbols = selectedTokens.join(',');
  try {
    const res = await fetch(
      `/api/market/auto-alerts?symbols=${encodeURIComponent(symbols)}`
    );
    autoAlerts = await res.json();
  } catch (e) {
    console.error('Failed to fetch /api/market/auto-alerts', e);
    autoAlerts = [];
  }
}

function getRelevantAlerts() {
  if (!selectedTokens.length) return []; // show nothing until user selects tokens
  const base = [...serverAlerts, ...autoAlerts];
  return base.filter((a) =>
    selectedTokens.includes((a.token || '').toUpperCase())
  );
}

// SORT: nearest deadline first
function sortAlertsByDeadline(list) {
  const now = Date.now();
  const toTs = (a) => new Date(a.deadline).getTime();
  const upcoming = list
    .filter((a) => toTs(a) >= now)
    .sort((a, b) => toTs(a) - toTs(b));
  const expired = list
    .filter((a) => toTs(a) < now)
    .sort((a, b) => toTs(a) - toTs(b));
  return upcoming.concat(expired);
}

function renderAlerts() {
  const list = sortAlertsByDeadline(getRelevantAlerts());
  alertsListEl.innerHTML = '';
  if (list.length === 0) {
    noAlertsEl.hidden = false;
    return;
  } else {
    noAlertsEl.hidden = true;
  }

  list.forEach((a) => {
    const wrap = document.createElement('div');
    wrap.className = 'alert-item severity-' + (a.severity || 'info');

    const left = document.createElement('div');
    left.className = 'content';

    const icon = document.createElement('span');
    icon.className = 'alert-icon';
    icon.textContent =
      a.severity === 'critical' ? '🚨' : a.severity === 'warning' ? '⚠️' : '🛟';

    const text = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'alert-title';
    title.textContent = `${a.title} — ${(a.token || '').toUpperCase()}`;

    const desc = document.createElement('div');
    desc.className = 'alert-desc';
    desc.textContent = a.description || '';

    text.appendChild(title);
    text.appendChild(desc);

    left.appendChild(icon);
    left.appendChild(text);

    const meta = document.createElement('div');
    meta.className = 'alert-deadline';
    const msLeft = new Date(a.deadline).getTime() - Date.now();
    meta.textContent = fmtTimeLeft(msLeft);

    wrap.appendChild(left);
    wrap.appendChild(meta);

    wrap._tick = () => {
      const leftMs = new Date(a.deadline).getTime() - Date.now();
      meta.textContent = fmtTimeLeft(leftMs);
    };

    alertsListEl.appendChild(wrap);
  });
}

// live ticking
let tickTimer = null;
function startTicking() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    [...alertsListEl.children].forEach((el) => {
      if (typeof el._tick === 'function') el._tick();
    });
  }, 1000);
}

// --- Weekly Summary (mock) ---------------------------------------------------
function renderSummary() {
  const tokens = selectedTokens;
  const out = [];
  if (tokens.includes('BTC'))
    out.push(
      '- BTC: Network activity ticked up; devs debated a future fork proposal. No immediate action required.'
    );
  if (tokens.includes('ETH'))
    out.push(
      '- ETH: Staking withdrawals increased; core devs signalled steady upgrade progress.'
    );
  if (tokens.includes('MATIC'))
    out.push(
      '- MATIC: Transition to POL remains on track; migration tooling improving.'
    );
  if (tokens.includes('UNI'))
    out.push(
      '- UNI: Large holder flows spotted; monitor governance/treasury chatter.'
    );
  if (tokens.includes('SOL'))
    out.push(
      '- SOL: Validator upgrade window scheduled; ecosystem projects testing compatibility.'
    );
  if (tokens.includes('USDC'))
    out.push(
      '- USDC: Issuer posted routine compliance updates; peg remains stable.'
    );
  if (tokens.includes('LINK'))
    out.push('- LINK: Oracle performance optimisations rolling out.');
  if (tokens.includes('ADA'))
    out.push(
      '- ADA: Community proposals discussed throughput; research teams shared progress.'
    );
  if (tokens.includes('DOGE'))
    out.push(
      '- DOGE: Client updates recommended for improved security and reliability.'
    );
  if (tokens.includes('POL'))
    out.push(
      '- POL: Ecosystem integrations expanding; bridging UX under refinement.'
    );
  const sc = document.getElementById('summary-content');
  sc.innerHTML = '';
  if (out.length === 0) {
    sc.innerHTML =
      '<p class="muted">Select some tokens to see a weekly summary.</p>';
  } else {
    const h = document.createElement('h2');
    h.className = 'section-title';
    h.textContent = 'AI-Generated Weekly Summary (mock)';
    sc.appendChild(h);
    out.forEach((line) => {
      const p = document.createElement('p');
      p.textContent = line;
      sc.appendChild(p);
    });
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent =
      '(This summary is auto-generated based on trending news for your selected tokens.)';
    sc.appendChild(note);
  }
}

// --- Market snapshot (FREE TIER: EOD only) -----------------------------------
async function loadMarket() {
  if (!selectedTokens.length) {
    marketItems = [];
    if (marketNoteEl)
      marketNoteEl.textContent =
        'Add tokens to your watchlist to see market data.';
    renderMarket();
    return;
  }
  const symbols = selectedTokens.join(',');
  try {
    const res = await fetch(
      `/api/market/snapshot?symbols=${encodeURIComponent(symbols)}`
    );
    const json = await res.json();
    marketItems = json.items || [];
    if (marketNoteEl)
      marketNoteEl.textContent =
        json.note || 'End-of-day aggregates (free tier).';
  } catch (e) {
    console.error('snapshot error', e);
    marketItems = [];
    if (marketNoteEl)
      marketNoteEl.textContent = 'Data unavailable (free plan limits).';
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

  // stable order
  const list = [...marketItems].sort((a,b) => a.token.localeCompare(b.token));

  list.forEach(it => {
    const card = document.createElement('div');
    card.className = 'market-card';

    // header row: token + tiny badge
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

    // big price
    const price = document.createElement('div');
    price.className = 'mk-price';
    price.textContent = moneyFmt(it.lastPrice);

    // chips row
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
function renderAll() {
  renderPills();
  renderAlerts();
  renderSummary();
}
