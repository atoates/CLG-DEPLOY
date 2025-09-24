// create.js (module)

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
const formDeadline = document.getElementById('form-deadline');

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
    const meRes = await fetch('/api/me');
    if (!meRes.ok) return;
    const me = await meRes.json();
    const wl = Array.isArray(me.watchlist) ? me.watchlist.slice() : [];
    if (!wl.includes(token)) wl.push(token);
    await fetch('/api/me/prefs', {
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
  const deadlineLocal = formDeadline.value;

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

  try{
    const res = await fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, severity, title, description, deadline: deadlineIso })
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
