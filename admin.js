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
const toolsPane = document.getElementById('tools-pane');
const uploadPane = document.getElementById('upload-pane');

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
    infoEl.textContent = `DB: ${j.databasePath} — Alerts: ${j.counts.alerts}, Users: ${j.counts.users}, Prefs: ${j.counts.user_prefs} — Restore on deploy: ${j.restoreFromFile ? 'ON' : 'OFF'}`;
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
// --- Tabs ---
if (tabs && tabs.length){
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const tab = t.getAttribute('data-tab');
    if (alertsPane) alertsPane.hidden = tab !== 'alerts';
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
      'BTC,Example Alert,This is an example alert,critical,2024-12-31T23:59:59.000Z,"[""hack"",""exploit""]",Additional information about this alert,trusted-source,https://example.com'
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

  // Parse CSV text into array of objects
  function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('CSV must have at least a header row and one data row');
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const requiredHeaders = ['token', 'title', 'description', 'severity', 'deadline'];
    
    // Check required headers
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
      throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`);
    }

    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length !== headers.length) {
        console.warn(`Row ${i + 1} has ${values.length} columns, expected ${headers.length}`);
      }
      
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      data.push(row);
    }

    return data;
  }

  // Parse a single CSV line, handling quoted values
  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"' && (i === 0 || line[i-1] === ',')) {
        inQuotes = true;
      } else if (char === '"' && inQuotes) {
        inQuotes = false;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
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

    // Tags validation (if present)
    if (row.tags && row.tags.trim()) {
      try {
        const parsed = JSON.parse(row.tags);
        if (!Array.isArray(parsed)) {
          errors.push(`Row ${rowNumber}: Tags must be a JSON array`);
        }
      } catch (e) {
        errors.push(`Row ${rowNumber}: Invalid tags format (must be JSON array)`);
      }
    }

    // Source type validation (if present)
    if (row.source_type && !['anonymous', 'mainstream-media', 'trusted-source', 'social-media', 'dev-team'].includes(row.source_type)) {
      errors.push(`Row ${rowNumber}: Invalid source_type (${row.source_type})`);
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
      try {
        alert.tags = JSON.parse(row.tags);
      } catch (e) {
        alert.tags = [];
      }
    }

    if (row.further_info && row.further_info.trim()) {
      alert.further_info = row.further_info.trim();
    }

    if (row.source_type && row.source_type.trim()) {
      alert.source_type = row.source_type.trim();
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
          'Authorization': ADMIN_TOKEN
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
