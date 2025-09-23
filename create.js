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

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  let token = (formToken.value || '').trim().toUpperCase();
  const severity = formSeverity.value;
  const title = (formTitle.value || '').trim();
  const description = (formDescription.value || '').trim();
  const deadlineLocal = formDeadline.value;

  if (!token || !severity || !title || !description || !deadlineLocal) return;
  const deadlineIso = new Date(deadlineLocal).toISOString();

  // UI feedback
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

    // Ensure token is in the user's watchlist for the index page
    const key = 'cl_selectedTokens';
    const current = JSON.parse(localStorage.getItem(key) || '[]');
    if (!current.includes(token)) {
      current.push(token);
      localStorage.setItem(key, JSON.stringify(current));
    }

    msg.textContent = 'Alert created. Redirecting…';
    // Redirect back to the alerts page
    setTimeout(() => {
      window.location.href = './index.html';
    }, 600);
  }catch(err){
    console.error(err);
    msg.textContent = 'Failed to save alert. Please try again.';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Add alert';
  }
});
