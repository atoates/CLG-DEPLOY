// token suggestions
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

function toISOFromLocal(dtLocalStr){
  if (!dtLocalStr) return null;
  const dt = new Date(dtLocalStr);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

// Add the alert token to the server-side watchlist so it shows after redirect
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

  if (!token || !severity || !title || !description || !deadlineLocal) return;
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

    // Ensure this token is on the user's server-side watchlist
    await addTokenToServerWatchlist(token);

    msg.textContent = 'Alert created. Redirecting…';
    setTimeout(() => { window.location.href = '/'; }, 600);
  }catch(err){
    console.error(err);
    msg.textContent = 'Failed to save alert. Please try again.';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Add alert';
  }
});
