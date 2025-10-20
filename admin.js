// Admin dashboard logic (requires ADMIN_TOKEN)
const listEl = document.getElementById('list');
const form = document.getElementById('editor');
const msgEl = document.getElementById('msg');
const btnNew = document.getElementById('btn-new');
const searchInput = document.getElementById('search-input');
const tokenInput = document.getElementById('admin-token-input');
const btnSaveToken = document.getElementById('btn-save-token');
const tokenStatus = document.getElementById('token-status');
const btnDelete = document.getElementById('btn-delete');
const infoEl = document.getElementById('admin-info');
const btnBackupNow = document.getElementById('btn-backup-now');
const btnRefreshBackups = document.getElementById('btn-refresh-backups');
const backupListEl = document.getElementById('backup-list');
const btnExportUsers = document.getElementById('btn-export-users');
const btnExportAudit = document.getElementById('btn-export-audit');
const btnExportAlerts = document.getElementById('btn-export-alerts');
const tabs = document.querySelectorAll('.admin-tab');
const alertsPane = document.getElementById('alerts-pane');
const usersPane = document.getElementById('users-pane');
const toolsPane = document.getElementById('tools-pane');
const uploadPane = document.getElementById('upload-pane');

// Users tab elements
const usersListEl = document.getElementById('users-list');
const usersStatsEl = document.getElementById('users-stats');
const btnRefreshUsers = document.getElementById('btn-refresh-users');
const usersSearchInput = document.getElementById('users-search-input');

const fToken = document.getElementById('f-token');
const fTitle = document.getElementById('f-title');
const fDesc = document.getElementById('f-desc');
const fDeadlineLocal = document.getElementById('f-deadline-local');
const fInfo = document.getElementById('f-info');
const fSourceType = document.getElementById('f-source-type');
const fSourceUrl = document.getElementById('f-source-url');
const tagsPills = document.getElementById('tags-pills');
// Admin tag dropdown elements
const adminTagTrigger = document.getElementById('admin-tag-dropdown-trigger');
const adminTagOptions = document.getElementById('admin-tag-dropdown-options');
const adminTagText = document.getElementById('admin-tag-dropdown-text');
const adminSelected = document.getElementById('admin-selected-tags');
const tagInput = document.getElementById('tag-input');
const sevSeg = document.getElementById('sev-seg');

let current = null;
let alerts = [];
let filtered = [];
let currentSev = 'info';

// Users state
let users = [];
let filteredUsers = [];

let ADMIN_TOKEN = localStorage.getItem('ADMIN_TOKEN') || '';
tokenInput.value = ADMIN_TOKEN;
tokenStatus.textContent = ADMIN_TOKEN ? 'Token set' : 'No token';
btnSaveToken.addEventListener('click', () => {
  ADMIN_TOKEN = tokenInput.value.trim();
  if (ADMIN_TOKEN) localStorage.setItem('ADMIN_TOKEN', ADMIN_TOKEN);
  else localStorage.removeItem('ADMIN_TOKEN');
  tokenStatus.textContent = ADMIN_TOKEN ? 'Token set' : 'No token';
  showMsg(ADMIN_TOKEN ? 'Saved token' : 'Cleared token');
});

function authHeaders(){
  return ADMIN_TOKEN ? { 'Authorization': 'Bearer ' + ADMIN_TOKEN } : {};
}

function showMsg(s){ msgEl.textContent = s; setTimeout(()=>msgEl.textContent='', 1800); }

async function refreshList(){
  const r = await fetch('/api/alerts');
  alerts = await r.json();
  filtered = alerts;
  renderList();
  // Build admin tag options once data is available
  try{
    if (typeof buildAdminTagOptions === 'function') buildAdminTagOptions();
  }catch(_e){}
}

function renderList(){
  listEl.innerHTML = '';
  const list = filtered;
  list.forEach(a => {
    const d = document.createElement('div');
    d.className = 'admin-item';
    const sevClass = a.severity === 'critical' ? 'sev-critical' : (a.severity === 'warning' ? 'sev-warning' : 'sev-info');
    d.innerHTML = `
      <span class="token-badge">${(a.token||'').toUpperCase()}</span>
      <div>
        <div class="title-line">${a.title||''}</div>
        <div class="meta-line">${a.severity} • ${new Date(a.deadline).toLocaleString()}</div>
      </div>
      <span class="sev-chip ${sevClass}">${a.severity}</span>
    `;
    d.addEventListener('click', () => select(a));
    if (current && current.id === a.id) d.classList.add('active');
    listEl.appendChild(d);
  });
}

function select(a){
  current = a;
  document.querySelectorAll('.admin-item').forEach(el=>el.classList.remove('active'));
  const idx = alerts.findIndex(x=>x.id===a.id);
  if (idx>=0) listEl.children[idx].classList.add('active');

  fToken.value = a.token || '';
  fTitle.value = a.title || '';
  fDesc.value = a.description || '';
  if (fInfo) fInfo.value = a.further_info || '';
  if (fSourceType) fSourceType.value = a.source_type || '';
  if (fSourceUrl) fSourceUrl.value = a.source_url || '';
  // deadline -> datetime-local (in local tz)
  try{
    const dt = new Date(a.deadline);
    const pad = n => String(n).padStart(2,'0');
    const local = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    fDeadlineLocal.value = local;
  }catch{ fDeadlineLocal.value = ''; }
  // tags -> pills
  renderTags(Array.isArray(a.tags) ? a.tags : []);
  // severity segmented
  currentSev = a.severity || 'info';
  syncSevSeg();
}

btnNew.addEventListener('click', async () => {
  // Minimal create calls the existing POST /api/alerts (no admin required in server; we’ll include token anyway)
  const payload = {
    token: 'BTC', title: 'New alert', description: '', severity: 'info',
    deadline: new Date(Date.now()+24*3600*1000).toISOString(), tags: [],
    further_info: '', source_type: '', source_url: ''
  };
  const r = await fetch('/api/alerts', {
    method:'POST', headers:{ 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify(payload)
  });
  if (!r.ok){ showMsg('Create failed'); return; }
  const j = await r.json();
  alerts.unshift(j); renderList(); select(j); showMsg('Created');
});

function gatherTags(){
  return Array.from(tagsPills.querySelectorAll('.tag-pill')).map(p => p.dataset.tag).filter(Boolean);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault(); if (!current) return;
  const sev = currentSev || 'info';
  const payload = {
    token: fToken.value.trim().toUpperCase(),
    title: fTitle.value.trim(),
    description: fDesc.value.trim(),
    severity: sev,
    deadline: toISO(fDeadlineLocal.value.trim()),
    tags: gatherTags(),
    further_info: fInfo ? fInfo.value.trim() : '',
    source_type: fSourceType ? (fSourceType.value || '') : '',
    source_url: fSourceUrl ? (fSourceUrl.value.trim() || '') : ''
  };
  const r = await fetch(`/api/alerts/${encodeURIComponent(current.id)}`, {
    method:'PUT', headers:{ 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify(payload)
  });
  if (!r.ok){ showMsg('Save failed'); return; }
  const j = await r.json();
  const idx = alerts.findIndex(a=>a.id===j.id); if (idx>=0) alerts[idx]=j;
  renderList(); select(j); showMsg('Saved');
});

btnDelete.addEventListener('click', async () => {
  if (!current) return;
  if (!confirm('Delete this alert?')) return;
  const r = await fetch(`/api/alerts/${encodeURIComponent(current.id)}`, { method:'DELETE', headers:{ ...authHeaders() } });
  if (!r.ok){ showMsg('Delete failed'); return; }
  const idx = alerts.findIndex(a=>a.id===current.id); if (idx>=0) alerts.splice(idx,1);
  current = null; renderList(); showMsg('Deleted');
});

refreshList();

// Show DB info for admins
(async function showAdminInfo(){
  if (!infoEl) return;
  try{
    const r = await fetch('/admin/info', { headers: { ...authHeaders() }});
    if (!r.ok) { infoEl.textContent = 'Admin info unavailable'; return; }
    const j = await r.json();
    const mk = j.market || {};
    const provider = mk.provider || 'none';
    const currency = mk.currency || 'USD';
    infoEl.textContent = `DB: ${j.databasePath} — Alerts: ${j.counts.alerts}, Users: ${j.counts.users}, Prefs: ${j.counts.user_prefs} — Market: ${provider.toUpperCase()} ${currency} — Restore on deploy: ${j.restoreFromFile ? 'ON' : 'OFF'}`;
  }catch(e){ infoEl.textContent = 'Admin info unavailable'; }
})();

async function refreshBackups(){
  if (!backupListEl) return;
  backupListEl.innerHTML = 'Loading backups…';
  try{
    const r = await fetch('/admin/backups', { headers: { ...authHeaders() }});
    if (!r.ok){ backupListEl.textContent = 'Failed to load backups'; return; }
    const j = await r.json();
    const files = (j && j.files) || [];
    if (!files.length){ backupListEl.textContent = 'No backups found'; return; }
    backupListEl.innerHTML = '';
    files.forEach(f => {
      const row = document.createElement('div');
      row.className = 'admin-item';
      const dt = new Date(f.mtime).toLocaleString();
      const size = Math.round(f.size/1024/1024*10)/10 + ' MB';
      const link = document.createElement('a');
      link.href = `/admin/backups/${encodeURIComponent(f.file)}`;
      link.textContent = `${f.file}`;
      link.className = 'backup-link';
      row.appendChild(link);
      const meta = document.createElement('span');
      meta.className = 'meta-line';
      meta.style.marginLeft = '8px';
      meta.textContent = `— ${size} — ${dt}`;
      row.appendChild(meta);
      backupListEl.appendChild(row);
    });
  }catch(e){ backupListEl.textContent = 'Failed to load backups'; }
}

async function doBackupNow(){
  if (!btnBackupNow) return;
  btnBackupNow.disabled = true;
  try{
    const r = await fetch('/admin/backup', { method:'POST', headers: { 'Content-Type':'application/json', ...authHeaders() }});
    if (!r.ok){ showMsg('Backup failed'); return; }
    const j = await r.json();
    showMsg('Backup created');
    await refreshBackups();
  }finally{
    btnBackupNow.disabled = false;
  }
}

if (btnBackupNow) btnBackupNow.addEventListener('click', doBackupNow);
if (btnRefreshBackups) btnRefreshBackups.addEventListener('click', refreshBackups);
refreshBackups();

// --- Users Tab Functionality ---
async function refreshUsers(){
  if (!usersListEl) return;
  usersListEl.innerHTML = 'Loading users…';
  try{
    const r = await fetch('/admin/users', { headers: { ...authHeaders() }});
    if (!r.ok){ 
      usersListEl.textContent = 'Failed to load users (check auth)'; 
      return; 
    }
    const j = await r.json();
    users = (j && j.users) || [];
    filteredUsers = users;
    renderUsers();
    updateUsersStats();
  }catch(e){ 
    usersListEl.textContent = 'Failed to load users'; 
    console.error('Users fetch error:', e);
  }
}

function renderUsers(){
  if (!usersListEl) return;
  if (filteredUsers.length === 0){
    usersListEl.innerHTML = '<div class="note">No users found</div>';
    return;
  }
  
  usersListEl.innerHTML = '';
  filteredUsers.forEach(user => {
    const card = document.createElement('div');
    card.className = 'user-card';
    
    // Avatar
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'user-avatar';
    if (user.avatar) {
      const img = document.createElement('img');
      img.src = user.avatar;
      img.alt = user.name || user.email || 'User';
      avatarDiv.appendChild(img);
    } else {
      const initial = (user.name || user.email || user.username || '?')[0].toUpperCase();
      avatarDiv.textContent = initial;
    }
    
    // Info section
    const infoDiv = document.createElement('div');
    infoDiv.className = 'user-info';
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'user-name';
    nameDiv.textContent = user.name || user.username || user.email || user.id;
    
    const emailDiv = document.createElement('div');
    emailDiv.className = 'user-email';
    emailDiv.textContent = user.email || 'No email';
    
    const metaDiv = document.createElement('div');
    metaDiv.className = 'user-meta';
    
    if (user.username) {
      const usernameBadge = document.createElement('span');
      usernameBadge.className = 'user-badge';
      usernameBadge.textContent = `@${user.username}`;
      metaDiv.appendChild(usernameBadge);
    }
    
    if (user.isGoogleUser) {
      const googleBadge = document.createElement('span');
      googleBadge.className = 'user-badge google';
      googleBadge.textContent = '✓ Google';
      metaDiv.appendChild(googleBadge);
    }
    
    if (user.created_at) {
      const createdSpan = document.createElement('span');
      const date = new Date(user.created_at);
      createdSpan.textContent = `Joined ${date.toLocaleDateString()}`;
      metaDiv.appendChild(createdSpan);
    }
    
    infoDiv.appendChild(nameDiv);
    infoDiv.appendChild(emailDiv);
    if (metaDiv.children.length > 0) {
      infoDiv.appendChild(metaDiv);
    }
    
    // Stats section
    const statsDiv = document.createElement('div');
    statsDiv.className = 'user-stats';
    
    const watchlistStat = document.createElement('div');
    watchlistStat.className = 'user-stat';
    watchlistStat.innerHTML = `<strong>${user.watchlistCount}</strong> tokens`;
    statsDiv.appendChild(watchlistStat);
    
    if (user.lastActivity) {
      const activityStat = document.createElement('div');
      activityStat.className = 'user-stat';
      const actDate = new Date(user.lastActivity);
      const now = new Date();
      const diffMs = now - actDate;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      
      let timeAgo;
      if (diffMins < 60) {
        timeAgo = `${diffMins}m ago`;
      } else if (diffHours < 24) {
        timeAgo = `${diffHours}h ago`;
      } else {
        timeAgo = `${diffDays}d ago`;
      }
      
      activityStat.innerHTML = `Active ${timeAgo}`;
      statsDiv.appendChild(activityStat);
    }
    
    // Assemble card
    card.appendChild(avatarDiv);
    card.appendChild(infoDiv);
    card.appendChild(statsDiv);
    
    usersListEl.appendChild(card);
  });
}

function updateUsersStats(){
  if (!usersStatsEl) return;
  const total = users.length;
  const googleUsers = users.filter(u => u.isGoogleUser).length;
  const anonUsers = total - googleUsers;
  const withWatchlist = users.filter(u => u.watchlistCount > 0).length;
  
  usersStatsEl.textContent = `${total} total users • ${googleUsers} logged in • ${anonUsers} anonymous • ${withWatchlist} with watchlists`;
}

if (btnRefreshUsers) {
  btnRefreshUsers.addEventListener('click', refreshUsers);
}

// Search functionality for users
if (usersSearchInput) {
  usersSearchInput.addEventListener('input', () => {
    const q = usersSearchInput.value.toLowerCase();
    filteredUsers = users.filter(u =>
      (u.name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.id || '').toLowerCase().includes(q)
    );
    renderUsers();
  });
}

// Load users when tab is clicked
tabs.forEach(t => t.addEventListener('click', () => {
  const tab = t.getAttribute('data-tab');
  if (tab === 'users' && users.length === 0) {
    refreshUsers();
  }
}));

// --- Tabs ---
if (tabs && tabs.length){
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const tab = t.getAttribute('data-tab');
    if (alertsPane) alertsPane.hidden = tab !== 'alerts';
    if (usersPane) usersPane.hidden = tab !== 'users';
    if (toolsPane) toolsPane.hidden = tab !== 'tools';
    if (uploadPane) uploadPane.hidden = tab !== 'upload';
  }));
}

// --- CSV Exports ---
async function download(url, filename){
  const r = await fetch(url, { headers: { ...authHeaders() }});
  if (!r.ok) { showMsg('Download failed'); return; }
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}
if (btnExportUsers){ btnExportUsers.addEventListener('click', () => download('/admin/export/users.csv', 'users.csv')); }
if (btnExportAudit){ btnExportAudit.addEventListener('click', () => download('/admin/export/audit.csv?days=30', 'audit-last-30-days.csv')); }
if (btnExportAlerts){ btnExportAlerts.addEventListener('click', () => download('/admin/export/alerts.csv', 'alerts.csv')); }

// --- Search filter ---
if (searchInput){
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase();
    filtered = alerts.filter(a =>
      (a.token||'').toLowerCase().includes(q) ||
      (a.title||'').toLowerCase().includes(q) ||
      (a.severity||'').toLowerCase().includes(q)
    );
    renderList();
  });
}

// --- Severity segmented control ---
function syncSevSeg(){
  if (!sevSeg) return;
  sevSeg.querySelectorAll('button[data-sev]').forEach(b => {
    const sev = b.getAttribute('data-sev');
    b.classList.toggle('active', sev === currentSev);
  });
}
if (sevSeg){
  sevSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-sev]'); if (!btn) return;
    currentSev = btn.getAttribute('data-sev') || 'info';
    syncSevSeg();
  });
}

// --- Tags pills UX ---
function renderTags(list){
  tagsPills.innerHTML = '';
  const uniq = Array.from(new Set(list.map(s => String(s).trim()).filter(Boolean)));
  uniq.forEach(t => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill'; pill.dataset.tag = t;
    pill.textContent = t + ' ';
    const x = document.createElement('button'); x.className='remove'; x.textContent='×';
    x.addEventListener('click', () => {
      pill.remove();
      // Keep admin dropdown UI in sync
      updateAdminTagUI();
    });
    pill.appendChild(x);
    tagsPills.appendChild(pill);
  });
  // also reflect into admin dropdown UI
  updateAdminTagUI();
}

function toISO(localStr){
  if (!localStr) return '';
  // local datetime-local string -> ISO string
  const dt = new Date(localStr);
  if (isNaN(dt.getTime())) return '';
  return dt.toISOString();
}

if (tagInput){
  tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter'){
      e.preventDefault();
      const val = (tagInput.value||'').trim();
      if (!val) return;
      const exists = Array.from(tagsPills.querySelectorAll('.tag-pill')).some(p => p.dataset.tag === val);
      if (!exists) renderTags([...gatherTags(), val]);
      tagInput.value = '';
    }
  });
}

// ---- Admin tag dropdown (mirrors main page) ----
function allKnownTags(){
  const set = new Set();
  // from ALERT_TAGS if available
  if (window.ALERT_TAGS){
    Object.keys(window.ALERT_TAGS).forEach(k => set.add(k));
  }
  // from currently loaded alerts
  alerts.forEach(a => {
    const arr = Array.isArray(a.tags) ? a.tags : [];
    arr.forEach(t => set.add(String(t)));
  });
  return Array.from(set).sort();
}

function updateAdminTagUI(){
  if (!adminSelected || !adminTagText) return;
  // Selected pills display
  adminSelected.innerHTML = '';
  const sel = gatherTags();
  sel.forEach(tag => {
    const p = document.createElement('span');
    p.className = 'selected-tag-pill';
    p.textContent = tag;
    const rm = document.createElement('button');
    rm.className = 'remove-tag';
    rm.textContent = '×';
    rm.addEventListener('click', () => {
      // remove from hidden pills and update UI
      const pill = Array.from(tagsPills.querySelectorAll('.tag-pill')).find(el => el.dataset.tag === tag);
      if (pill) pill.remove();
      updateAdminTagUI();
    });
    p.appendChild(rm);
    adminSelected.appendChild(p);
  });
  // Dropdown text
  adminTagText.textContent = sel.length ? `${sel.length} tag${sel.length>1?'s':''} selected` : 'Select tags...';
  // Options checked state
  if (adminTagOptions){
    adminTagOptions.querySelectorAll('.dropdown-option').forEach(opt => {
      const t = opt.getAttribute('data-tag');
      const checked = sel.includes(t);
      opt.classList.toggle('selected', checked);
      const box = opt.querySelector('.option-checkbox');
      if (box){ box.classList.toggle('checked', checked); }
    });
  }
}

function buildAdminTagOptions(){
  if (!adminTagOptions) return;
  adminTagOptions.innerHTML = '';
  allKnownTags().forEach(tag => {
    const opt = document.createElement('div');
    opt.className = 'dropdown-option';
    opt.setAttribute('data-tag', tag);
    const box = document.createElement('span'); box.className = 'option-checkbox';
    const label = document.createElement('span'); label.className = 'option-label';
    // decorate with icon/label from ALERT_TAGS when available
    if (window.ALERT_TAGS && window.ALERT_TAGS[tag]){
      const info = window.ALERT_TAGS[tag];
      label.textContent = `${info.icon || ''} ${tag}`;
      // subtle color cue
      label.style.color = info.color || '';
    } else {
      label.textContent = tag;
    }
    opt.appendChild(box); opt.appendChild(label);
    opt.addEventListener('click', () => {
      const cur = gatherTags();
      const exists = cur.includes(tag);
      if (exists){
        const pill = Array.from(tagsPills.querySelectorAll('.tag-pill')).find(el => el.dataset.tag === tag);
        if (pill) pill.remove();
      }else{
        renderTags([...cur, tag]);
      }
      updateAdminTagUI();
    });
    adminTagOptions.appendChild(opt);
  });
  updateAdminTagUI();
}

// Toggle admin tag dropdown open/close
if (adminTagTrigger){
  adminTagTrigger.addEventListener('click', () => {
    if (!adminTagOptions) return;
    const open = adminTagOptions.classList.toggle('open');
    adminTagTrigger.classList.toggle('active', open);
  });
}

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  const within = e.target.closest('.custom-dropdown');
  if (!within && adminTagOptions){
    adminTagOptions.classList.remove('open');
    if (adminTagTrigger) adminTagTrigger.classList.remove('active');
  }
});

// Build options once alerts load
(async function waitAndBuild(){
  try{
    // if alerts already loaded, build immediately; else after refreshList
    if (alerts && alerts.length) buildAdminTagOptions();
    else {
      // Monkey-patch refreshList to chain a build
      const __orig = refreshList;
      refreshList = async function(){
        await __orig();
        buildAdminTagOptions();
      };
    }
  }catch(_e){}
})();

// --- CSV Upload Functionality (Admin Only) ------------------------------------------------
const uploadArea = document.getElementById('csv-upload-area');
const fileInput = document.getElementById('csv-file-input');
const previewSection = document.getElementById('csv-preview-section');
const previewTable = document.getElementById('csv-preview-table');
const importBtn = document.getElementById('csv-import-btn');
const downloadTemplateBtn = document.getElementById('csv-template-btn');
const statusDiv = document.getElementById('csv-status');

let csvData = null;
let validatedAlerts = [];

  // Download CSV template
  downloadTemplateBtn?.addEventListener('click', () => {
    const csvContent = [
      'token,title,description,severity,deadline,tags,further_info,source_type,source_url',
      'BTC,Example Alert,"This is an example alert, with a comma",critical,2024-12-31T23:59:59.000Z,"[""hack"",""exploit""]","Additional information about this alert. Quotes need doubling like this: ""quoted"".",trusted-source,https://example.com'
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'crypto_alerts_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Handle drag and drop
  uploadArea?.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });

  uploadArea?.addEventListener('dragleave', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
  });

  uploadArea?.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  });

  // Handle click to upload
  uploadArea?.addEventListener('click', () => {
    fileInput?.click();
  });

  // Handle file input change
  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  });

  // Handle file selection
  function handleFileSelect(file) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      showStatus('Please select a CSV file.', 'error');
      return;
    }

    showStatus('Reading file...', 'info');
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        csvData = parseCSV(text);
        validateAndPreviewData();
      } catch (error) {
        showStatus(`Error reading file: ${error.message}`, 'error');
      }
    };
    reader.readAsText(file);
  }

  // Robust CSV parser (RFC4180-ish): handles quotes, escaped quotes, and commas in fields
  function parseCSV(text) {
    if (!text || !text.trim()) throw new Error('Empty CSV');
    // Normalize line endings
    const input = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Detect delimiter from the first few non-empty lines (support ",", ";", or tab)
    const sampleLines = input.split('\n').filter(Boolean).slice(0, 10);
    const delimCandidates = [',', ';', '\t'];
    let delim = ',';
    let bestScore = -1;
    for (const d of delimCandidates) {
      // Score by average token count across samples
      let total = 0; let lines = 0;
      for (const ln of sampleLines) { total += (ln.split(d).length); lines++; }
      const avg = lines ? total / lines : 0;
      if (avg > bestScore) { bestScore = avg; delim = d; }
    }
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (ch === '"') {
        if (inQuotes && input[i + 1] === '"') {
          // Escaped quote
          field += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delim && !inQuotes) {
        row.push(field);
        field = '';
      } else if (ch === '\n' && !inQuotes) {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
    // Push last field/row
    if (field.length > 0 || inQuotes || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    if (!rows.length) throw new Error('CSV must have at least a header row');
    // Headers
    const headers = rows[0].map(h => (h || '').trim().replace(/^\ufeff/, '').replace(/^\"|\"$/g, ''));
    const requiredHeaders = ['token', 'title', 'description', 'severity', 'deadline'];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    if (missingHeaders.length) {
      throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`);
    }

    const data = [];
    for (let r = 1; r < rows.length; r++) {
      const cols = rows[r];
      if (!cols || cols.every(c => !c || !String(c).trim())) continue; // skip empty rows
      const obj = {};
      headers.forEach((h, idx) => {
        let v = cols[idx] == null ? '' : String(cols[idx]);
        // Trim outer quotes if present
        if (v.startsWith('"') && v.endsWith('"')) {
          v = v.substring(1, v.length - 1);
        }
        obj[h] = v;
      });
      // If there are extra columns beyond headers due to stray delimiters, keep them in the last field
      if (cols.length > headers.length) {
        const lastIdx = headers.length - 1;
        const extra = cols.slice(headers.length).join(delim === '\t' ? '\t' : delim);
        obj[headers[lastIdx]] = `${obj[headers[lastIdx]]}${obj[headers[lastIdx]] ? (delim === '\t' ? '\t' : delim) : ''}${extra}`;
      }
      data.push(obj);
    }
    return data;
  }

  // Validate data and show preview
  function validateAndPreviewData() {
    if (!csvData || csvData.length === 0) {
      showStatus('No data found in CSV file', 'error');
      return;
    }

    validatedAlerts = [];
    const errors = [];

    csvData.forEach((row, index) => {
      const rowErrors = validateAlertRow(row, index + 2); // +2 for header and 0-based index
      if (rowErrors.length === 0) {
        validatedAlerts.push(normalizeAlertRow(row));
      } else {
        errors.push(...rowErrors);
      }
    });

    if (errors.length > 0) {
      showStatus(`Validation errors found:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n... and ${errors.length - 5} more` : ''}`, 'error');
    } else {
      showStatus(`✓ ${validatedAlerts.length} alerts validated successfully`, 'success');
    }

    renderPreview();
    
    if (previewSection) {
      previewSection.hidden = false;
    }
    
    if (importBtn) {
      importBtn.disabled = validatedAlerts.length === 0;
    }
  }

  // Validate a single alert row
  function validateAlertRow(row, rowNumber) {
    const errors = [];

    // Token validation
    if (!row.token || !/^[A-Z0-9]{2,15}$/i.test(row.token.trim())) {
      errors.push(`Row ${rowNumber}: Invalid token format (${row.token})`);
    }

    // Title validation
    if (!row.title || row.title.trim().length === 0) {
      errors.push(`Row ${rowNumber}: Title is required`);
    }

    // Description validation
    if (!row.description || row.description.trim().length === 0) {
      errors.push(`Row ${rowNumber}: Description is required`);
    }

    // Severity validation
    if (!['critical', 'warning', 'info'].includes(row.severity)) {
      errors.push(`Row ${rowNumber}: Severity must be 'critical', 'warning', or 'info' (${row.severity})`);
    }

    // Deadline validation
    try {
      const deadline = new Date(row.deadline);
      if (isNaN(deadline.getTime())) {
        errors.push(`Row ${rowNumber}: Invalid deadline format (${row.deadline})`);
      }
    } catch (e) {
      errors.push(`Row ${rowNumber}: Invalid deadline format (${row.deadline})`);
    }

    // Tags validation (if present) - accept JSON array OR comma/semicolon list
    if (row.tags && row.tags.trim()) {
      const raw = row.tags.trim();
      let ok = false;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) ok = true;
      } catch (_e) {
        // Fallback: split by comma/semicolon
        const parts = raw.split(/[;,]/).map(s => s.trim()).filter(Boolean);
        if (parts.length) ok = true;
      }
      if (!ok) {
        errors.push(`Row ${rowNumber}: Invalid tags format (must be JSON array or comma-separated list)`);
      }
    }

    // Source type validation (if present) with normalization
    if (row.source_type && row.source_type.trim()) {
      const allowed = ['anonymous', 'mainstream-media', 'trusted-source', 'social-media', 'dev-team'];
      const map = {
        'mainstream': 'mainstream-media',
        'main stream media': 'mainstream-media',
        'main-stream-media': 'mainstream-media',
        'trusted': 'trusted-source',
        'social': 'social-media',
        'dev': 'dev-team',
        'team': 'dev-team'
      };
      const raw = String(row.source_type).trim().toLowerCase();
      const norm = map[raw] || raw;
      if (!allowed.includes(norm)) {
        errors.push(`Row ${rowNumber}: Invalid source_type (${row.source_type})`);
      }
    }

    // Source URL validation (if present)
    if (row.source_url && row.source_url.trim()) {
      try {
        new URL(row.source_url);
      } catch (e) {
        errors.push(`Row ${rowNumber}: Invalid source_url format`);
      }
    }

    return errors;
  }

  // Normalize alert row to match expected format
  function normalizeAlertRow(row) {
    const alert = {
      token: row.token.toUpperCase().trim(),
      title: row.title.trim(),
      description: row.description.trim(),
      severity: row.severity.toLowerCase(),
      deadline: new Date(row.deadline).toISOString()
    };

    // Add optional fields if present
    if (row.tags && row.tags.trim()) {
      const raw = row.tags.trim();
      try {
        const parsed = JSON.parse(raw);
        alert.tags = Array.isArray(parsed) ? parsed : [];
      } catch (_e) {
        // Fallback: split by comma/semicolon into array of strings
        alert.tags = raw.split(/[;,]/).map(s => s.trim()).filter(Boolean);
      }
    }

    if (row.further_info && row.further_info.trim()) {
      alert.further_info = row.further_info.trim();
    }

    if (row.source_type && row.source_type.trim()) {
      const st = row.source_type.trim().toLowerCase();
      const allowed = ['anonymous','mainstream-media','trusted-source','social-media','dev-team'];
      // map common variants/synonyms
      const map = {
        'mainstream': 'mainstream-media',
        'main stream media': 'mainstream-media',
        'main-stream-media': 'mainstream-media',
        'trusted': 'trusted-source',
        'social': 'social-media',
        'dev': 'dev-team',
        'team': 'dev-team'
      };
      const norm = map[st] || st;
      if (allowed.includes(norm)) alert.source_type = norm;
    }

    if (row.source_url && row.source_url.trim()) {
      alert.source_url = row.source_url.trim();
    }

    return alert;
  }

  // Render preview table
  function renderPreview() {
    if (!previewTable || !csvData) return;

    const headers = Object.keys(csvData[0] || {});
    const previewData = csvData.slice(0, 5); // Show first 5 rows

    let html = '<thead><tr>';
    headers.forEach(header => {
      html += `<th>${header}</th>`;
    });
    html += '</tr></thead><tbody>';

    previewData.forEach(row => {
      html += '<tr>';
      headers.forEach(header => {
        const value = row[header] || '';
        const displayValue = value.length > 50 ? value.substring(0, 50) + '...' : value;
        html += `<td title="${value}">${displayValue}</td>`;
      });
      html += '</tr>';
    });

    html += '</tbody>';
    previewTable.innerHTML = html;
  }

  // Show status message
  function showStatus(message, type = 'info') {
    if (!statusDiv) return;
    
    statusDiv.textContent = message;
    statusDiv.className = `csv-status ${type}`;
    statusDiv.hidden = false;

    if (type === 'success') {
      setTimeout(() => {
        statusDiv.hidden = true;
      }, 5000);
    }
  }

  // Handle import button click
  importBtn?.addEventListener('click', async () => {
    if (!validatedAlerts || validatedAlerts.length === 0) {
      showStatus('No valid alerts to import', 'error');
      return;
    }

    if (!ADMIN_TOKEN) {
      showStatus('Admin token required for bulk import', 'error');
      return;
    }

    try {
      importBtn.disabled = true;
      showStatus(`Importing ${validatedAlerts.length} alerts...`, 'info');

      const response = await fetch('/api/alerts/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders()
        },
        body: JSON.stringify({ alerts: validatedAlerts })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Import failed');
      }

      const result = await response.json();
      showStatus(`✓ Successfully imported ${result.imported || validatedAlerts.length} alerts`, 'success');

      // Reset the form
      if (fileInput) fileInput.value = '';
      if (previewSection) previewSection.hidden = true;
      csvData = null;
      validatedAlerts = [];

      // Refresh the alerts list
      await refreshList();

    } catch (error) {
      showStatus(`Import failed: ${error.message}`, 'error');
    } finally {
      importBtn.disabled = false;
    }
  });

// --- Account Menu Functionality ---
const userMenuBtn = document.getElementById('user-menu-btn');
const userMenu = document.getElementById('user-menu');

if (userMenuBtn && userMenu) {
  userMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isExpanded = userMenuBtn.getAttribute('aria-expanded') === 'true';
    
    if (isExpanded) {
      userMenu.hidden = true;
      userMenuBtn.setAttribute('aria-expanded', 'false');
    } else {
      userMenu.hidden = false;
      userMenuBtn.setAttribute('aria-expanded', 'true');
    }
  });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!userMenuBtn.contains(e.target) && !userMenu.contains(e.target)) {
      userMenu.hidden = true;
      userMenuBtn.setAttribute('aria-expanded', 'false');
    }
  });

  // Handle menu item clicks
  userMenu.addEventListener('click', (e) => {
    if (e.target.classList.contains('menu-item') && e.target.dataset.action) {
      const action = e.target.dataset.action;
      
      switch (action) {
        case 'settings':
          showMsg('Settings not yet implemented');
          break;
        case 'help':
          showMsg('Help not yet implemented');
          break;
        case 'logout':
          showMsg('Logout not yet implemented');
          break;
      }
      
      // Close menu after action
      userMenu.hidden = true;
      userMenuBtn.setAttribute('aria-expanded', 'false');
    }
  });
}
