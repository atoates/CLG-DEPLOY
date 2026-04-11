// Profile page script
// Standalone profile logic for Crypto Lifeguard

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

// --- DOM references ---------------------------------------------------------
const nameEl         = document.getElementById('prof-name');
const emailEl        = document.getElementById('prof-email');
const avatarEl       = document.getElementById('prof-avatar');
const usernameEl     = document.getElementById('prof-username');
const usernameInput  = document.getElementById('prof-username-input');
const usernameSave   = document.getElementById('prof-username-save');
const usernameMsg    = document.getElementById('username-msg');
const pillsEl        = document.getElementById('prof-watch-pills');
const addBtn         = document.getElementById('prof-add-token');
const tokenInput     = document.getElementById('prof-token-input');
const showAllToggle  = document.getElementById('prof-show-all');
const currencySelect = document.getElementById('prof-currency-select');
const msgEl          = document.getElementById('prof-msg');
const avatarPresetsEl = document.getElementById('avatar-presets');
const sevCritical    = document.getElementById('pref-sev-critical');
const sevWarning     = document.getElementById('pref-sev-warning');
const sevInfo        = document.getElementById('pref-sev-info');
const exportBtn      = document.getElementById('btn-export');
const logoutBtn      = document.getElementById('btn-logout');

let me = null;
let saveTimer = null;

// --- Messaging helpers ------------------------------------------------------
function showMsg(el, text, kind = 'success', ms = 2000){
  if (!el) return;
  el.textContent = text;
  el.classList.remove('is-success', 'is-error');
  el.classList.add('is-visible', kind === 'error' ? 'is-error' : 'is-success');
  if (el._hideTimer) clearTimeout(el._hideTimer);
  if (ms > 0) {
    el._hideTimer = setTimeout(() => {
      el.classList.remove('is-visible', 'is-success', 'is-error');
      el.textContent = '';
    }, ms);
  }
}

function toast(text, kind = 'success'){
  showMsg(msgEl, text, kind);
}

// --- Avatar -----------------------------------------------------------------
function setAvatar(profile){
  avatarEl.innerHTML = '';
  const url = (profile && profile.avatar) || '';
  if (url){
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Avatar';
    avatarEl.appendChild(img);
  } else {
    const name = (profile && profile.name) || '';
    const initials = name.trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase() || 'U';
    avatarEl.textContent = initials;
  }
  // Reflect the selected avatar in the picker
  if (avatarPresetsEl) {
    avatarPresetsEl.querySelectorAll('.avatar-option').forEach(btn => {
      btn.classList.toggle('is-selected', btn.dataset.url === url);
    });
  }
}

// --- Watchlist pills --------------------------------------------------------
function renderPills(){
  pillsEl.innerHTML = '';
  const list = (me && Array.isArray(me.watchlist)) ? me.watchlist : [];
  if (list.length === 0){
    const empty = document.createElement('span');
    empty.className = 'watchlist-empty';
    empty.textContent = 'No tokens selected yet.';
    pillsEl.appendChild(empty);
    return;
  }
  list.forEach(t => {
    const pill = document.createElement('span');
    pill.className = 'watch-pill';
    pill.textContent = t;
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'watch-pill__x';
    x.setAttribute('aria-label', `Remove ${t}`);
    x.textContent = '×';
    x.addEventListener('click', () => {
      me.watchlist = me.watchlist.filter(sym => sym !== t);
      renderPills();
      savePrefs('Watchlist updated.');
    });
    pill.appendChild(x);
    pillsEl.appendChild(pill);
  });
}

// --- Token autocomplete -----------------------------------------------------
let autocompleteContainer = null;
let selectedAutocompleteIndex = -1;
let tokenDatabase = [];

function initAutocomplete(){
  if (!tokenInput) return;
  autocompleteContainer = document.createElement('div');
  autocompleteContainer.className = 'autocomplete-list';
  autocompleteContainer.style.display = 'none';
  tokenInput.parentElement.appendChild(autocompleteContainer);
}

async function fetchTokenDatabase(){
  try {
    const response = await apiFetch(apiUrl('/api/tokens/search'));
    if (response.ok) tokenDatabase = await response.json();
  } catch {}
}

function searchTokens(query){
  if (!query) return [];
  const q = query.toLowerCase();
  const matches = tokenDatabase.filter(t => {
    return t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q);
  });
  matches.sort((a, b) => {
    const aSym = a.symbol.toLowerCase(), bSym = b.symbol.toLowerCase();
    const aName = a.name.toLowerCase(), bName = b.name.toLowerCase();
    if (aSym === q) return -1;
    if (bSym === q) return 1;
    if (aSym.startsWith(q) && !bSym.startsWith(q)) return -1;
    if (!aSym.startsWith(q) && bSym.startsWith(q)) return 1;
    if (aName.startsWith(q) && !bName.startsWith(q)) return -1;
    if (!aName.startsWith(q) && bName.startsWith(q)) return 1;
    return aSym.localeCompare(bSym);
  });
  return matches.slice(0, 10);
}

function highlightMatch(text, query){
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<strong>$1</strong>');
}

function showAutocomplete(matches, query){
  if (!autocompleteContainer) return;
  if (!matches.length){
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
    item.innerHTML = highlightMatch(`${token.name} · ${token.symbol}`, query);
    item.addEventListener('click', () => selectToken(token.symbol));
    item.addEventListener('mouseenter', () => {
      selectedAutocompleteIndex = idx;
      updateAutocompleteSelection();
    });
    autocompleteContainer.appendChild(item);
  });
  autocompleteContainer.style.display = 'block';
}

function hideAutocomplete(){
  if (!autocompleteContainer) return;
  autocompleteContainer.style.display = 'none';
  selectedAutocompleteIndex = -1;
}

function updateAutocompleteSelection(){
  if (!autocompleteContainer) return;
  [...autocompleteContainer.querySelectorAll('.autocomplete-item')].forEach((item, idx) => {
    item.classList.toggle('selected', idx === selectedAutocompleteIndex);
  });
}

function selectToken(symbol){
  const upper = String(symbol || '').toUpperCase().trim();
  if (!upper) { hideAutocomplete(); tokenInput.value = ''; return; }
  me.watchlist = me.watchlist || [];
  if (!me.watchlist.includes(upper)){
    me.watchlist.push(upper);
    renderPills();
    savePrefs(`Added ${upper} to watchlist.`);
  }
  tokenInput.value = '';
  hideAutocomplete();
  tokenInput.focus();
}

// --- Load profile -----------------------------------------------------------
async function loadMe(){
  // Reuse the /api/me response pre-fetched by the auth gate if available
  if (typeof window !== 'undefined' && window.__CLG_ME__) {
    me = window.__CLG_ME__;
  } else {
    try {
      const r = await apiFetch(apiUrl('/api/me'));
      if (!r.ok) throw new Error('Failed to load profile');
      me = await r.json();
    } catch (e) {
      toast('Could not load your profile. Please try again.', 'error');
      return;
    }
  }

  if (!me.loggedIn){ window.location.replace('/signup.html'); return; }

  // Header
  nameEl.textContent = (me.profile && me.profile.name) || 'Your profile';
  usernameEl.textContent = (me.profile && me.profile.username) ? `@${me.profile.username}` : '';
  emailEl.textContent = (me.profile && me.profile.email) || '';

  // Admin badge
  if (me.isAdmin) {
    const badge = document.createElement('span');
    badge.className = 'admin-badge';
    badge.textContent = 'Admin';
    nameEl.appendChild(badge);
  }

  setAvatar(me.profile || {});

  // Severity toggles
  const sev = Array.isArray(me.severity) ? me.severity : ['critical','warning','info'];
  sevCritical.checked = sev.includes('critical');
  sevWarning.checked  = sev.includes('warning');
  sevInfo.checked     = sev.includes('info');

  // Show closed alerts
  showAllToggle.checked = !!me.showAll;

  // Currency
  if (currencySelect && me.currency) currencySelect.value = me.currency;

  // Watchlist
  renderPills();

  // Username input primed with existing value
  if (me.profile && me.profile.username) usernameInput.value = me.profile.username;
}

// --- Save prefs (debounced) -------------------------------------------------
function savePrefs(successText){
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const r = await apiFetch(apiUrl('/api/me/prefs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          watchlist: me.watchlist || [],
          severity: me.severity || ['critical','warning','info'],
          showAll: !!me.showAll,
          dismissed: me.dismissed || [],
          currency: me.currency || 'USD'
        })
      });
      if (!r.ok) throw new Error('Save failed');
      if (successText) toast(successText);
    } catch {
      toast('Could not save preferences.', 'error');
    }
  }, 200);
}

// --- Severity toggle handlers ----------------------------------------------
function rebuildSeverity(){
  const arr = [];
  if (sevCritical.checked) arr.push('critical');
  if (sevWarning.checked)  arr.push('warning');
  if (sevInfo.checked)     arr.push('info');
  me.severity = arr;
  savePrefs('Alert preferences saved.');
}

sevCritical.addEventListener('change', rebuildSeverity);
sevWarning.addEventListener('change', rebuildSeverity);
sevInfo.addEventListener('change', rebuildSeverity);

showAllToggle.addEventListener('change', () => {
  me.showAll = showAllToggle.checked;
  savePrefs('Alert preferences saved.');
});

// --- Currency ---------------------------------------------------------------
if (currencySelect) {
  currencySelect.addEventListener('change', () => {
    me.currency = currencySelect.value;
    savePrefs(`Currency set to ${currencySelect.value}.`);
  });
}

// --- Watchlist input --------------------------------------------------------
addBtn.addEventListener('click', () => {
  const val = (tokenInput.value || '').toUpperCase().trim();
  if (!val) return;
  selectToken(val);
});

if (tokenInput) {
  tokenInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    if (query.length >= 1) showAutocomplete(searchTokens(query), query);
    else hideAutocomplete();
  });

  tokenInput.addEventListener('keydown', (e) => {
    const open = autocompleteContainer && autocompleteContainer.style.display !== 'none';
    if (!open){
      if (e.key === 'Enter'){ e.preventDefault(); addBtn.click(); }
      return;
    }
    const items = autocompleteContainer.querySelectorAll('.autocomplete-item');
    if (e.key === 'ArrowDown'){
      e.preventDefault();
      selectedAutocompleteIndex = Math.min(selectedAutocompleteIndex + 1, items.length - 1);
      updateAutocompleteSelection();
      items[selectedAutocompleteIndex] && items[selectedAutocompleteIndex].scrollIntoView({ block:'nearest' });
    } else if (e.key === 'ArrowUp'){
      e.preventDefault();
      selectedAutocompleteIndex = Math.max(selectedAutocompleteIndex - 1, 0);
      updateAutocompleteSelection();
      items[selectedAutocompleteIndex] && items[selectedAutocompleteIndex].scrollIntoView({ block:'nearest' });
    } else if (e.key === 'Enter'){
      e.preventDefault();
      if (selectedAutocompleteIndex >= 0 && items[selectedAutocompleteIndex]){
        selectToken(items[selectedAutocompleteIndex].dataset.symbol);
      } else if (tokenInput.value.trim()){
        addBtn.click();
      }
    } else if (e.key === 'Escape'){
      hideAutocomplete();
    }
  });

  tokenInput.addEventListener('blur', () => setTimeout(hideAutocomplete, 200));
}

// --- Username ---------------------------------------------------------------
const USERNAME_RULES = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;

usernameInput.addEventListener('input', () => {
  usernameMsg.classList.remove('is-visible', 'is-success', 'is-error');
});

usernameSave.addEventListener('click', async () => {
  const u = (usernameInput.value || '').trim();
  if (!u){
    showMsg(usernameMsg, 'Please enter a username.', 'error');
    return;
  }
  if (!USERNAME_RULES.test(u)){
    showMsg(usernameMsg, '3–20 chars, letters, numbers or _ and must start with a letter.', 'error', 3500);
    return;
  }
  usernameSave.disabled = true;
  try {
    const r = await apiFetch(apiUrl('/api/me/username'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u })
    });
    if (!r.ok){
      const j = await r.json().catch(() => ({}));
      const text = j.error === 'taken' ? 'That username is taken.' : (j.rules || 'Invalid username.');
      showMsg(usernameMsg, text, 'error', 3000);
      return;
    }
    const j = await r.json();
    me.profile = me.profile || {};
    me.profile.username = j.username;
    usernameEl.textContent = `@${j.username}`;
    showMsg(usernameMsg, 'Username saved.', 'success', 2000);
  } catch {
    showMsg(usernameMsg, 'Could not save username. Try again.', 'error');
  } finally {
    usernameSave.disabled = false;
  }
});

// --- Export & Logout --------------------------------------------------------
exportBtn.addEventListener('click', () => {
  if (!me) { toast('Nothing to export yet.', 'error'); return; }
  const blob = new Blob([JSON.stringify(me, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'crypto-lifeguard-profile.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('Data exported.');
});

logoutBtn.addEventListener('click', () => {
  apiFetch(apiUrl('/auth/logout'), { method: 'POST' })
    .finally(() => { window.location.href = '/'; });
});

// --- Avatar presets ---------------------------------------------------------
const PRESET_AVATARS = [
  'https://api.dicebear.com/9.x/identicon/svg?seed=Alpha',
  'https://api.dicebear.com/9.x/identicon/svg?seed=Beta',
  'https://api.dicebear.com/9.x/identicon/svg?seed=Gamma',
  'https://api.dicebear.com/9.x/bottts/svg?seed=Robo',
  'https://api.dicebear.com/9.x/fun-emoji/svg?seed=Joy'
];

function renderAvatarPresets(){
  if (!avatarPresetsEl) return;
  avatarPresetsEl.innerHTML = '';
  PRESET_AVATARS.forEach(url => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'avatar-option';
    btn.dataset.url = url;
    btn.setAttribute('aria-label', 'Select avatar');
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.width = 56;
    img.height = 56;
    btn.appendChild(img);

    btn.addEventListener('click', async () => {
      try {
        const r = await apiFetch(apiUrl('/api/me/avatar'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        if (!r.ok){
          const j = await r.json().catch(() => ({}));
          toast(j.error === 'invalid_url' ? 'Invalid avatar URL.' : 'Failed to update avatar.', 'error');
          return;
        }
        const j = await r.json();
        me.profile = me.profile || {};
        me.profile.avatar = j.avatar || url;
        setAvatar(me.profile);
        toast('Avatar updated.');
      } catch {
        toast('Failed to update avatar.', 'error');
      }
    });

    avatarPresetsEl.appendChild(btn);
  });
}

// --- OAuth redirect handling -------------------------------------------------
async function handleAuthToken(){
  const urlParams = new URLSearchParams(window.location.search);
  const authToken = urlParams.get('auth_token');
  if (!authToken) return;
  try {
    const response = await apiFetch(apiUrl('/auth/exchange-token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: authToken })
    });
    if (response.ok){
      window.history.replaceState({}, document.title, '/profile.html');
    } else {
      console.error('Token exchange failed');
    }
  } catch (error) {
    console.error('Token exchange error:', error);
  }
}

// --- Bootstrap --------------------------------------------------------------
renderAvatarPresets();
initAutocomplete();
fetchTokenDatabase();
handleAuthToken().then(() => loadMe());
