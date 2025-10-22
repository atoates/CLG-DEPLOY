// Profile page script
// Standalone profile logic

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
const msgEl = document.getElementById('prof-msg');
const avatarPresetsEl = document.getElementById('avatar-presets');

// Token submission elements
const submitTokenSymbol = document.getElementById('submit-token-symbol');
const submitTokenName = document.getElementById('submit-token-name');
const submitTokenReason = document.getElementById('submit-token-reason');
const submitTokenWebsite = document.getElementById('submit-token-website');
const submitTokenMarketCap = document.getElementById('submit-token-market-cap');
const btnSubmitToken = document.getElementById('btn-submit-token');
const btnClearSubmission = document.getElementById('btn-clear-submission');
const submissionMsg = document.getElementById('submission-msg');

let me = null;
// Start with a tiny seed, then enrich from /api/alerts and user watchlist
const tokenSuggestions = new Set(['BTC','ETH','USDC','MATIC','SOL']);

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
    const pill = document.createElement('div');
    pill.className = 'pill small';
    pill.textContent = t;
    const btn = document.createElement('button');
    btn.className = 'remove'; btn.textContent = '×'; btn.setAttribute('aria-label', `Remove ${t}`);
    btn.addEventListener('click', () => {
      me.watchlist = me.watchlist.filter(x => x !== t);
      savePrefs();
      renderPills();
    });
    pill.appendChild(btn);
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
    const r = await fetch('/api/alerts');
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
  const r = await fetch('/api/me');
  me = await r.json();
  if (!me.loggedIn){ window.location.href = '/'; return; }
  
  // Update profile name with admin badge if applicable
  nameEl.innerHTML = '';
  const nameText = document.createTextNode(me.profile?.name || 'Your profile');
  nameEl.appendChild(nameText);
  
  if (me.isAdmin) {
    const badge = document.createElement('span');
    badge.className = 'admin-badge';
    badge.innerHTML = '⚡ Admin';
    nameEl.appendChild(badge);
  }
  
  usernameEl.textContent = me.profile?.username ? `@${me.profile.username}` : '';
  emailEl.textContent = me.profile?.email || '';
  setAvatar(me.profile || {});
  showAllToggle.checked = !!me.showAll;
  renderPills();
  // Update token suggestions after loading user state
  await refreshTokenSuggestions();
  // Prime username input with existing value
  if (me.profile?.username) usernameInput.value = me.profile.username;
}

function savePrefs(){
  fetch('/api/me/prefs', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({
      watchlist: me.watchlist || [],
      severity: me.severity || ['critical','warning','info'],
      showAll: !!me.showAll,
      dismissed: me.dismissed || []
    })
  }).then(()=>{ msgEl.textContent = 'Preferences saved.'; setTimeout(()=>msgEl.textContent='',1500); });
}

addBtn.addEventListener('click', () => {
  const val = (tokenInput.value||'').toUpperCase().trim();
  if (!val) return;
  me.watchlist = me.watchlist || [];
  if (!me.watchlist.includes(val)) me.watchlist.push(val);
  // Keep suggestions up to date as users add tokens
  tokenSuggestions.add(val);
  tokenInput.value = '';
  savePrefs();
  renderPills();
  renderTokenDatalist();
});

showAllToggle.addEventListener('change', () => {
  me.showAll = showAllToggle.checked;
  savePrefs();
});

document.getElementById('btn-logout').addEventListener('click', () => {
  fetch('/auth/logout', { method:'POST' }).finally(() => window.location.href = '/');
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
  const r = await fetch('/api/me/username', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username: u }) });
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
        const r = await fetch('/api/me/avatar', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ url }) });
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

// --- Token Submission Functionality ---

// Auto-uppercase token symbol input
if (submitTokenSymbol) {
  submitTokenSymbol.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
  });
}

// Clear submission form
if (btnClearSubmission) {
  btnClearSubmission.addEventListener('click', () => {
    if (submitTokenSymbol) submitTokenSymbol.value = '';
    if (submitTokenName) submitTokenName.value = '';
    if (submitTokenReason) submitTokenReason.value = '';
    if (submitTokenWebsite) submitTokenWebsite.value = '';
    if (submitTokenMarketCap) submitTokenMarketCap.value = '';
    if (submissionMsg) submissionMsg.textContent = '';
  });
}

// Submit token request
if (btnSubmitToken) {
  btnSubmitToken.addEventListener('click', async () => {
    // Validate required fields
    const symbol = (submitTokenSymbol?.value || '').trim().toUpperCase();
    const name = (submitTokenName?.value || '').trim();
    const reason = (submitTokenReason?.value || '').trim();
    
    if (!symbol || !name || !reason) {
      if (submissionMsg) {
        submissionMsg.textContent = 'Please fill in all required fields (marked with *)';
        submissionMsg.style.color = '#dc2626';
        setTimeout(() => {
          submissionMsg.textContent = '';
          submissionMsg.style.color = '';
        }, 3000);
      }
      return;
    }
    
    // Validate token symbol format
    if (!/^[A-Z0-9]{1,10}$/.test(symbol)) {
      if (submissionMsg) {
        submissionMsg.textContent = 'Token symbol must be 1-10 characters, letters and numbers only';
        submissionMsg.style.color = '#dc2626';
        setTimeout(() => {
          submissionMsg.textContent = '';
          submissionMsg.style.color = '';
        }, 3000);
      }
      return;
    }
    
    // Prepare submission data
    const submissionData = {
      symbol,
      name,
      reason,
      website: (submitTokenWebsite?.value || '').trim(),
      marketCap: submitTokenMarketCap?.value || '',
      submittedAt: new Date().toISOString()
    };
    
    // Disable button and show loading
    btnSubmitToken.disabled = true;
    btnSubmitToken.textContent = 'Submitting...';
    
    try {
      const response = await fetch('/api/token-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(submissionData)
      });
      
      if (response.ok) {
        const result = await response.json();
        if (submissionMsg) {
          submissionMsg.textContent = '✅ Token request submitted successfully! We\'ll review it and get back to you.';
          submissionMsg.style.color = '#059669';
        }
        
        // Clear form after successful submission
        setTimeout(() => {
          if (btnClearSubmission) btnClearSubmission.click();
        }, 1000);
        
      } else {
        const error = await response.json().catch(() => ({}));
        if (submissionMsg) {
          submissionMsg.textContent = `❌ ${error.message || 'Failed to submit request. Please try again.'}`;
          submissionMsg.style.color = '#dc2626';
        }
      }
    } catch (error) {
      if (submissionMsg) {
        submissionMsg.textContent = '❌ Network error. Please check your connection and try again.';
        submissionMsg.style.color = '#dc2626';
      }
    } finally {
      // Reset button
      btnSubmitToken.disabled = false;
      btnSubmitToken.textContent = 'Submit Request';
      
      // Clear message after delay
      setTimeout(() => {
        if (submissionMsg) {
          submissionMsg.textContent = '';
          submissionMsg.style.color = '';
        }
      }, 5000);
    }
  });
}
