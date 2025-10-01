// Profile page script
import './app.js'; // ensure shared utilities/UI if needed

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

let me = null;

function setAvatar(profile){
  avatarEl.innerHTML = '';
  const url = (profile && profile.avatar) || '';
  if (url){
    const img = document.createElement('img');
    img.src = url; img.alt = 'Avatar'; img.width = 64; img.height = 64; img.style.borderRadius = '999px';
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

async function loadMe(){
  const r = await fetch('/api/me');
  me = await r.json();
  if (!me.loggedIn){ window.location.href = '/'; return; }
  nameEl.textContent = me.profile?.name || 'Your profile';
  usernameEl.textContent = me.profile?.username ? `@${me.profile.username}` : '';
  emailEl.textContent = me.profile?.email || '';
  setAvatar(me.profile || {});
  showAllToggle.checked = !!me.showAll;
  renderPills();
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
  tokenInput.value = '';
  savePrefs();
  renderPills();
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

loadMe();
