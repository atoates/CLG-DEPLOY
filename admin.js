// Admin dashboard logic (requires ADMIN_TOKEN)
const listEl = document.getElementById('list');
const form = document.getElementById('editor');
const msgEl = document.getElementById('msg');
const btnNew = document.getElementById('btn-new');
const tokenInput = document.getElementById('admin-token-input');
const btnSaveToken = document.getElementById('btn-save-token');
const tokenStatus = document.getElementById('token-status');
const btnDelete = document.getElementById('btn-delete');

const fToken = document.getElementById('f-token');
const fTitle = document.getElementById('f-title');
const fDesc = document.getElementById('f-desc');
const fDeadline = document.getElementById('f-deadline');
const fTags = document.getElementById('f-tags');

let current = null;
let alerts = [];

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
  renderList();
}

function renderList(){
  listEl.innerHTML = '';
  alerts.forEach(a => {
    const d = document.createElement('div');
    d.className = 'admin-item';
    d.innerHTML = `<div><strong>${a.token}</strong> — <em>${a.severity}</em></div><div>${a.title}</div>`;
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
  fDeadline.value = a.deadline || '';
  fTags.value = Array.isArray(a.tags) ? a.tags.join(', ') : '';
  // severity radios
  const radio = form.querySelector(`input[name="sev"][value="${a.severity||'info'}"]`);
  if (radio) radio.checked = true;
}

btnNew.addEventListener('click', async () => {
  // Minimal create calls the existing POST /api/alerts (no admin required in server; we’ll include token anyway)
  const payload = {
    token: 'BTC', title: 'New alert', description: '', severity: 'info',
    deadline: new Date(Date.now()+24*3600*1000).toISOString(), tags: []
  };
  const r = await fetch('/api/alerts', {
    method:'POST', headers:{ 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify(payload)
  });
  if (!r.ok){ showMsg('Create failed'); return; }
  const j = await r.json();
  alerts.unshift(j); renderList(); select(j); showMsg('Created');
});

form.addEventListener('submit', async (e) => {
  e.preventDefault(); if (!current) return;
  const sev = form.querySelector('input[name="sev"]:checked')?.value || 'info';
  const payload = {
    token: fToken.value.trim().toUpperCase(),
    title: fTitle.value.trim(),
    description: fDesc.value.trim(),
    severity: sev,
    deadline: fDeadline.value.trim(),
    tags: fTags.value.split(',').map(s=>s.trim()).filter(Boolean)
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
