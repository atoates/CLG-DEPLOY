// create.js (module)

// --- Config: shared helpers --------------------------------------------------
function getApiBaseUrl(){
  const injected = (typeof window !== 'undefined' && window.BACKEND_URL) ? window.BACKEND_URL : '';
  if (injected) return injected;
  try {
    const host = window.location.hostname || '';
    if (host && host !== 'localhost' && host !== '127.0.0.1') return 'https://app.crypto-lifeguard.com';
  } catch {}
  return '';
}
function apiUrl(path){ return `${getApiBaseUrl()}${path}`; }
function apiFetch(url, options={}){ return fetch(url, { credentials:'include', ...options }); }

// Token suggestions consistent with the main app
const ALL_TOKENS = ['BTC','ETH','USDC','MATIC','DOGE','ADA','SOL','POL','UNI','LINK'];

const datalist = document.getElementById('token-datalist');
ALL_TOKENS.forEach(t => {
  const opt = document.createElement('option');
  opt.value = t;
  datalist.appendChild(opt);
});

const form = document.getElementById('alert-form');
const msg = document.getElementById('msg');
const submitBtn = document.getElementById('submit-btn');

const formToken = document.getElementById('form-token');
const formSeverity = document.getElementById('form-severity');
const formTitle = document.getElementById('form-title');
const formDescription = document.getElementById('form-description');
const formInfo = document.getElementById('form-info');
const formDeadline = document.getElementById('form-deadline');
const formSourceType = document.getElementById('form-source-type');
const formSourceUrl = document.getElementById('form-source-url');
const tagSelectors = document.getElementById('tag-selectors');

// Initialize tag selectors
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
  'token-unlocks': { icon: '�', label: 'Token Unlocks', color: '#f59e0b' }
};

// Create tag selectors
Object.entries(ALERT_TAGS).forEach(([tag, info]) => {
  const btn = document.createElement('button');
  btn.className = 'tag-filter';
  btn.setAttribute('data-tag', tag);
  btn.setAttribute('aria-pressed', 'false');
  btn.style.color = info.color;
  
  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.textContent = info.icon;
  
  const label = document.createElement('span');
  label.textContent = info.label;
  
  btn.appendChild(icon);
  btn.appendChild(label);
  
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    btn.classList.toggle('active');
    btn.setAttribute('aria-pressed', btn.classList.contains('active'));
  });
  
  tagSelectors.appendChild(btn);
});

// UX: focus the token field and set a sensible default deadline (now + 6h)
(function initForm(){
  try {
    formToken.focus();
  } catch {}
  const now = new Date();
  const plus6h = new Date(now.getTime() + 6 * 3600 * 1000);
  const pad = n => String(n).padStart(2,'0');
  const localVal = `${plus6h.getFullYear()}-${pad(plus6h.getMonth()+1)}-${pad(plus6h.getDate())}T${pad(plus6h.getHours())}:${pad(plus6h.getMinutes())}`;
  formDeadline.min = localVal;
  formDeadline.value = localVal;
})();

function toISOFromLocal(dtLocalStr){
  if (!dtLocalStr) return null;
  const dt = new Date(dtLocalStr);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

// Ensure alert token is in the server-side watchlist so it shows after redirect
async function addTokenToServerWatchlist(token){
  try{
    const meRes = await apiFetch(apiUrl('/api/me'));
    if (!meRes.ok) return;
    const me = await meRes.json();
    const wl = Array.isArray(me.watchlist) ? me.watchlist.slice() : [];
    if (!wl.includes(token)) wl.push(token);
    await apiFetch(apiUrl('/api/me/prefs'), {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({
        watchlist: wl,
        severity: Array.isArray(me.severity) ? me.severity : ['critical','warning','info'],
        showAll: !!me.showAll,
        dismissed: Array.isArray(me.dismissed) ? me.dismissed : []
      })
    });
  }catch(_e){}
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const token = (formToken.value || '').trim().toUpperCase();
  const severity = formSeverity.value;
  const title = (formTitle.value || '').trim();
  const description = (formDescription.value || '').trim();
  const further_info = (formInfo.value || '').trim();
  const deadlineLocal = formDeadline.value;
  const source_type = (formSourceType && formSourceType.value) || '';
  const source_url = (formSourceUrl && formSourceUrl.value || '').trim();

  if (!token || !severity || !title || !description || !deadlineLocal){
    msg.textContent = 'Please complete all fields.';
    return;
  }
  const deadlineIso = toISOFromLocal(deadlineLocal);
  if (!deadlineIso){
    msg.textContent = 'Invalid deadline.';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';
  msg.textContent = '';

  // Get selected tags
  const selectedTags = [...document.querySelectorAll('.tag-filter.active')]
    .map(el => el.getAttribute('data-tag'))
    .filter(Boolean);

  try{
    const res = await apiFetch(apiUrl('/api/alerts'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        token, 
        severity, 
        title, 
        description, 
        deadline: deadlineIso,
        tags: selectedTags,
        further_info,
        source_type,
        source_url
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    await addTokenToServerWatchlist(token);

    msg.textContent = 'Alert created ✔ Redirecting…';
    setTimeout(() => { window.location.href = '/'; }, 700);
  }catch(err){
    console.error(err);
    msg.textContent = 'Failed to save alert. Please try again.';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create alert';
  }
});
