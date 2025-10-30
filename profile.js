// Profile page script
// Standalone profile logic

// --- Config: shared helpers --------------------------------------------------
function getApiBaseUrl(){
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
function apiUrl(path){ return `${getApiBaseUrl()}${path}`; }
function apiFetch(url, options={}){ return fetch(url, { credentials:'include', ...options }); }

const nameEl = document.getElementById('prof-name');
const emailEl = document.getElementById('prof-email');
const avatarEl = document.getElementById('prof-avatar');
const usernameEl = document.getElementById('prof-username');
const usernameInput = document.getElementById('prof-username-input');
const usernameSave = document.getElementById('prof-username-save');
const pillsEl = document.getElementById('prof-watch-pills');
const addBtn = document.getElementById('prof-add-token');
const tokenInput = document.getElementById('prof-token-input');
const showAllToggle = document.getElementById('prof-show-all');
const currencySelect = document.getElementById('prof-currency-select');
const msgEl = document.getElementById('prof-msg');
const avatarPresetsEl = document.getElementById('avatar-presets');

let me = null;
// Start with a tiny seed, then enrich from /api/alerts and user watchlist
const tokenSuggestions = new Set(['BTC','ETH','USDC','MATIC','SOL']);

// Autocomplete state
let autocompleteContainer = null;
let selectedAutocompleteIndex = -1;
let tokenDatabase = [];

// Create autocomplete container
function initAutocomplete() {
  if (!tokenInput) return;
  
  autocompleteContainer = document.createElement('div');
  autocompleteContainer.className = 'autocomplete-list';
  autocompleteContainer.style.display = 'none';
  tokenInput.parentElement.style.position = 'relative';
  tokenInput.parentElement.appendChild(autocompleteContainer);
}

// Fetch token database
async function fetchTokenDatabase() {
  try {
    const response = await apiFetch(apiUrl('/api/tokens/search'));
    if (response.ok) {
      tokenDatabase = await response.json();
    }
  } catch (e) {
    console.warn('Failed to fetch token database:', e);
  }
}

function searchTokens(query) {
  if (!query || query.length < 1) return [];
  
  const q = query.toLowerCase();
  const matches = tokenDatabase.filter(token => {
    const symbolMatch = token.symbol.toLowerCase().includes(q);
    const nameMatch = token.name.toLowerCase().includes(q);
    return symbolMatch || nameMatch;
  });
  
  // Sort: exact symbol match first, then starts with, then contains
  matches.sort((a, b) => {
    const aSymbol = a.symbol.toLowerCase();
    const bSymbol = b.symbol.toLowerCase();
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    
    if (aSymbol === q) return -1;
    if (aSymbol.startsWith(q) && !bSymbol.startsWith(q)) return -1;
    if (!aSymbol.startsWith(q) && bSymbol.startsWith(q)) return 1;
    if (aName.startsWith(q) && !bName.startsWith(q)) return -1;
    if (!aName.startsWith(q) && bName.startsWith(q)) return 1;
    
    return a.symbol.localeCompare(b.symbol);
  });
  
  return matches.slice(0, 10);
}

function highlightMatch(text, query) {
  if (!query) return text;
  const regex = new RegExp(`(${query})`, 'gi');
  return text.replace(regex, '<strong>$1</strong>');
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
  if (!upper) {
    hideAutocomplete();
    tokenInput.value = '';
    return;
  }
  
  me.watchlist = me.watchlist || [];
  if (!me.watchlist.includes(upper)) {
    me.watchlist.push(upper);
    tokenSuggestions.add(upper);
    savePrefs();
    renderPills();
  }
  
  tokenInput.value = '';
  hideAutocomplete();
  tokenInput.focus();
}

function setAvatar(profile){
  avatarEl.innerHTML = '';
  const url = (profile && profile.avatar) || '';
  if (url){
    const img = document.createElement('img');
    img.src = url; 
    img.alt = 'Avatar'; 
    img.width = 80; 
    img.height = 80; 
    img.style.borderRadius = '50%';
    img.style.objectFit = 'cover';
    avatarEl.appendChild(img);
  } else {
    const initials = (profile && profile.name || '').trim().split(/\s+/).map(s=>s[0]).slice(0,2).join('').toUpperCase() || 'U';
    const d = document.createElement('div');
    d.className = 'avatar-initials';
    d.textContent = initials;
    avatarEl.appendChild(d);
  }
}

function renderPills(){
  pillsEl.innerHTML = '';
  (me.watchlist || []).forEach(t => {
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.textContent = t;
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'pill-x';
    x.setAttribute('aria-label', `Remove ${t}`);
    x.textContent = '×';
    x.addEventListener('click', () => {
      me.watchlist = me.watchlist.filter(sym => sym !== t);
      savePrefs();
      renderPills();
    });
    pill.appendChild(x);
    pillsEl.appendChild(pill);
  });
}

function renderTokenDatalist(){
  const dl = document.getElementById('token-datalist');
  if (!dl) return;
  dl.innerHTML = '';
  Array.from(tokenSuggestions).sort().forEach(t => { const opt=document.createElement('option'); opt.value=t; dl.appendChild(opt); });
}

async function refreshTokenSuggestions(){
  try{
    // Enrich with current alerts' tokens
    const r = await apiFetch(apiUrl('/api/alerts'));
    if (r.ok){
      const alerts = await r.json();
      alerts.forEach(a => {
        const tok = String(a.token||'').toUpperCase().trim();
        if (tok && /^[A-Z0-9]{2,15}$/.test(tok)) tokenSuggestions.add(tok);
      });
    }
  }catch(e){ /* ignore network errors; fallback seed remains */ }
  // Ensure user's current watchlist symbols are also suggested
  if (me && Array.isArray(me.watchlist)) me.watchlist.forEach(t => tokenSuggestions.add(String(t||'').toUpperCase().trim()))
  renderTokenDatalist();
}

async function loadMe(){
  const r = await apiFetch(apiUrl('/api/me'));
  me = await r.json();
  if (!me.loggedIn){ window.location.href = '/'; return; }
  
  // Update profile name
  nameEl.textContent = me.profile?.name || 'Your profile';
  
  usernameEl.textContent = me.profile?.username ? `@${me.profile.username}` : '';
  emailEl.textContent = me.profile?.email || '';
  setAvatar(me.profile || {});
  showAllToggle.checked = !!me.showAll;
  
  // Set currency preference
  if (currencySelect && me.currency) {
    currencySelect.value = me.currency;
  }
  
  renderPills();
  // Update token suggestions after loading user state
  await refreshTokenSuggestions();
  // Prime username input with existing value
  if (me.profile?.username) usernameInput.value = me.profile.username;
}

function savePrefs(){
  apiFetch(apiUrl('/api/me/prefs'), {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({
      watchlist: me.watchlist || [],
      severity: me.severity || ['critical','warning','info'],
      showAll: !!me.showAll,
      dismissed: me.dismissed || [],
      currency: me.currency || 'USD'
    })
  }).then(()=>{ msgEl.textContent = 'Preferences saved.'; setTimeout(()=>msgEl.textContent='',1500); });
}

addBtn.addEventListener('click', () => {
  const val = (tokenInput.value||'').toUpperCase().trim();
  if (!val) return;
  
  selectToken(val);
});

// Autocomplete input handler
if (tokenInput) {
  tokenInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    if (query.length >= 1) {
      const matches = searchTokens(query);
      showAutocomplete(matches, query);
    } else {
      hideAutocomplete();
    }
  });
  
  tokenInput.addEventListener('keydown', (e) => {
    if (!autocompleteContainer || autocompleteContainer.style.display === 'none') {
      if (e.key === 'Enter') {
        e.preventDefault();
        addBtn.click();
      }
      return;
    }
    
    const items = autocompleteContainer.querySelectorAll('.autocomplete-item');
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedAutocompleteIndex = Math.min(selectedAutocompleteIndex + 1, items.length - 1);
      updateAutocompleteSelection();
      const selectedItem = items[selectedAutocompleteIndex];
      if (selectedItem) selectedItem.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedAutocompleteIndex = Math.max(selectedAutocompleteIndex - 1, 0);
      updateAutocompleteSelection();
      const selectedItem = items[selectedAutocompleteIndex];
      if (selectedItem) selectedItem.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedAutocompleteIndex >= 0 && selectedAutocompleteIndex < items.length) {
        const selectedItem = items[selectedAutocompleteIndex];
        const symbol = selectedItem.dataset.symbol;
        if (symbol) {
          selectToken(symbol);
        }
      } else if (tokenInput.value.trim()) {
        addBtn.click();
      }
    } else if (e.key === 'Escape') {
      hideAutocomplete();
    }
  });
  
  tokenInput.addEventListener('blur', () => {
    setTimeout(() => hideAutocomplete(), 200);
  });
}

showAllToggle.addEventListener('change', () => {
  me.showAll = showAllToggle.checked;
  savePrefs();
});

// Currency selector handling
if (currencySelect) {
  currencySelect.addEventListener('change', () => {
    me.currency = currencySelect.value;
    savePrefs();
    msgEl.textContent = 'Currency preference saved. Reload the page to see changes.';
    setTimeout(() => msgEl.textContent = '', 3000);
  });
}

document.getElementById('btn-logout').addEventListener('click', () => {
  apiFetch(apiUrl('/auth/logout'), { method:'POST' }).finally(() => window.location.href = '/');
});

document.getElementById('btn-export').addEventListener('click', async () => {
  const blob = new Blob([JSON.stringify(me, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'crypto-lifeguard-profile.json';
  document.body.appendChild(a); a.click(); a.remove();
});

usernameSave.addEventListener('click', async () => {
  const u = (usernameInput.value||'').trim();
  if (!u) return;
  const r = await apiFetch(apiUrl('/api/me/username'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username: u }) });
  if (!r.ok) {
    const j = await r.json().catch(()=>({}));
    msgEl.textContent = j.error === 'taken' ? 'That username is taken.' : (j.rules || 'Invalid username.');
    setTimeout(()=>msgEl.textContent='', 2000);
    return;
  }
  const j = await r.json();
  me.profile = me.profile || {}; me.profile.username = j.username;
  usernameEl.textContent = `@${j.username}`;
  msgEl.textContent = 'Username saved.';
  setTimeout(()=>msgEl.textContent='', 1500);
});

// Avatar presets (simple defaults)
const PRESET_AVATARS = [
  'https://api.dicebear.com/9.x/identicon/svg?seed=A',
  'https://api.dicebear.com/9.x/identicon/svg?seed=B',
  'https://api.dicebear.com/9.x/identicon/svg?seed=C',
  'https://api.dicebear.com/9.x/bottts/svg?seed=Robo',
  'https://api.dicebear.com/9.x/fun-emoji/svg?seed=Joy'
];

function renderAvatarPresets(){
  if (!avatarPresetsEl) return;
  avatarPresetsEl.innerHTML = '';
  PRESET_AVATARS.forEach(url => {
    const btn = document.createElement('button');
    btn.className = 'pill'; btn.style.padding='4px 6px';
    const img = document.createElement('img'); img.src=url; img.width=24; img.height=24; img.style.borderRadius='999px';
    btn.appendChild(img);
    btn.addEventListener('click', async () => {
      try{
        const r = await apiFetch(apiUrl('/api/me/avatar'), { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ url }) });
        if (!r.ok){
          const j = await r.json().catch(()=>({}));
          msgEl.textContent = j.error === 'invalid_url' ? 'Invalid avatar URL.' : 'Failed to update avatar.';
          setTimeout(()=>msgEl.textContent='', 1800);
          return;
        }
        const j = await r.json();
        me.profile = me.profile || {}; me.profile.avatar = j.avatar || url;
        setAvatar(me.profile);
        msgEl.textContent = 'Avatar updated.'; setTimeout(()=>msgEl.textContent='',1200);
      }catch(e){
        msgEl.textContent = 'Failed to update avatar.'; setTimeout(()=>msgEl.textContent='',1500);
      }
    });
    avatarPresetsEl.appendChild(btn);
  });
}

renderAvatarPresets();
initAutocomplete();
fetchTokenDatabase();
loadMe();

// ---- Severity buttons handling ----
function renderSeverityButtons(){
  const btns = document.querySelectorAll('.sev-btn[data-sev]');
  const active = new Set((me?.severity && Array.isArray(me.severity) ? me.severity : ['critical','warning','info']).map(s=>String(s)));
  btns.forEach(b => {
    const key = b.getAttribute('data-sev');
    if (active.has(key)) b.classList.add('active');
    else b.classList.remove('active');
  });
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.sev-btn[data-sev]');
  if (!btn) return;
  const sev = btn.getAttribute('data-sev');
  const arr = Array.isArray(me?.severity) ? [...me.severity] : ['critical','warning','info'];
  const idx = arr.indexOf(sev);
  if (idx >= 0) arr.splice(idx,1); else arr.push(sev);
  // Keep a stable order
  const order = ['critical','warning','info'];
  me.severity = order.filter(s => arr.includes(s));
  renderSeverityButtons();
  savePrefs();
});

// Ensure severity buttons reflect state on first load (slight delay to allow loadMe to set me)
setTimeout(() => renderSeverityButtons(), 0);

// Token submission form removed - will be separate page later
