/* ============================================================================
 * Lifeguard AI — floating chat widget
 * ----------------------------------------------------------------------------
 * A self-contained chat experience that talks to POST /api/chat (SSE).
 * Designed to be dropped into any page with <script type="module" src="/src/chat.js">
 * and a container <div id="lifeguard-chat-root"></div> somewhere in the body.
 *
 * Features:
 *   - Floating launcher with breathing pulse
 *   - Glass panel with header, scroll-follow message list, composer
 *   - Streaming assistant responses via Server-Sent Events
 *   - Tool-use status pills ("Checking BTC price...", "Searching news...")
 *   - Lightweight markdown rendering (bold, italic, code, inline links, lists)
 *   - Suggested starter prompts that adapt to the current page context
 *   - Conversation persistence in localStorage (24h rolling)
 *   - Keyboard shortcuts: Cmd/Ctrl+K opens, Esc closes, Enter sends, Shift+Enter newlines
 *   - Context passing: reads window.CLG_CHAT_CONTEXT (token, page, watchlist)
 * ========================================================================== */

// ---- API base resolver (matches app.js pattern) ---------------------------
function getApiBaseUrl() {
  const injected = (typeof window !== 'undefined' && window.BACKEND_URL) ? window.BACKEND_URL : '';
  if (injected && injected !== '__BACKEND_URL__') return injected;
  return '';
}
const API_BASE = getApiBaseUrl();

// ---- Storage keys ---------------------------------------------------------
const STORAGE_KEY = 'clg_chat_history_v1';
const OPEN_KEY = 'clg_chat_open_v1';
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000;

// ---- State ----------------------------------------------------------------
let state = {
  messages: [],      // [{ role, content, toolCalls?: [] }]
  isOpen: false,
  isStreaming: false,
  lastError: ''
};

// ---- Starter prompts (contextual) -----------------------------------------
function getStarterPrompts() {
  const ctx = window.CLG_CHAT_CONTEXT || {};
  if (ctx.token) {
    return [
      { icon: '📈', text: `What's the latest on ${ctx.token}?` },
      { icon: '🛡️', text: `Any security warnings for ${ctx.token}?` },
      { icon: '📰', text: `Show me recent news about ${ctx.token}` },
      { icon: '💡', text: `Explain ${ctx.token} in two sentences` }
    ];
  }
  if (ctx.page === 'news') {
    return [
      { icon: '🔥', text: 'What are the biggest crypto stories today?' },
      { icon: '🛡️', text: 'Any active hacks or exploits I should know about?' },
      { icon: '📊', text: 'How is Bitcoin performing right now?' },
      { icon: '🎯', text: 'Summarise the last 24h in one paragraph' }
    ];
  }
  return [
    { icon: '👋', text: "What's happening in crypto right now?" },
    { icon: '🛡️', text: 'Any critical alerts I should know about?' },
    { icon: '📈', text: 'Show me BTC and ETH prices' },
    { icon: '⭐', text: 'How is my watchlist doing today?' }
  ];
}

// ---- Persistence ----------------------------------------------------------
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.messages)) return [];
    if (Date.now() - (parsed.ts || 0) > HISTORY_TTL_MS) return [];
    return parsed.messages;
  } catch { return []; }
}
function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now(), messages: state.messages.slice(-30) }));
  } catch {}
}

// ---- Minimal safe markdown renderer ---------------------------------------
// Supports: **bold**, *italic*, `code`, [text](url), - bullet lists, line breaks
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function renderMarkdown(text) {
  if (!text) return '';
  // Escape first, then apply inline markdown
  let html = escapeHtml(text);

  // Code spans
  html = html.replace(/`([^`]+?)`/g, '<code>$1</code>');
  // Bold (double star)
  html = html.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  // Italic (single star, avoiding already-bolded)
  html = html.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>');
  // Bare URLs
  html = html.replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noreferrer noopener">$2</a>');

  // Bullet lists: lines starting with "- " or "* "
  const lines = html.split('\n');
  const out = [];
  let inList = false;
  for (const line of lines) {
    const m = line.match(/^\s*[-*]\s+(.*)$/);
    if (m) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${m[1]}</li>`);
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      if (line.trim() === '') out.push('<br>');
      else out.push(`<p>${line}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('');
}

// ---- DOM helpers ----------------------------------------------------------
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children || [])) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

// ---- Tool label humaniser -------------------------------------------------
function describeTool(name, args) {
  switch (name) {
    case 'get_price': {
      const toks = (args?.tokens || []).join(', ');
      return `Checking live price${(args?.tokens || []).length > 1 ? 's' : ''} for ${toks || 'tokens'}`;
    }
    case 'get_token_info':
      return `Looking up ${args?.token || 'token'}`;
    case 'get_alerts': {
      const parts = [];
      if (args?.severity) parts.push(args.severity);
      parts.push('alerts');
      if (args?.token) parts.push(`for ${args.token}`);
      return `Scanning ${parts.join(' ')}`;
    }
    case 'search_news': {
      const q = args?.query ? `"${args.query}"` : (args?.token || 'recent crypto news');
      return `Searching news for ${q}`;
    }
    case 'get_watchlist':
      return 'Reading your watchlist';
    default:
      return `Running ${name}`;
  }
}

// ---- UI builders ----------------------------------------------------------
function buildLauncher(onOpen) {
  return el('button', {
    class: 'clg-chat-launcher',
    'aria-label': 'Open Lifeguard AI assistant',
    type: 'button',
    onclick: onOpen
  }, [
    el('span', { class: 'clg-chat-launcher__glow' }),
    el('span', { class: 'clg-chat-launcher__icon', html: sparklesSvg() }),
    el('span', { class: 'clg-chat-launcher__label' }, ['Ask Lifeguard AI'])
  ]);
}

function sparklesSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>`;
}
function closeSvg()   { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`; }
function sendSvg()    { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/></svg>`; }
function shieldSvg()  { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>`; }
function trashSvg()   { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`; }
function toolSvg()    { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1"/></svg>`; }

function buildPanel({ onClose, onSend, onReset, onStarter }) {
  const panel = el('div', { class: 'clg-chat-panel', role: 'dialog', 'aria-label': 'Lifeguard AI' });

  // Header
  const header = el('header', { class: 'clg-chat-header' }, [
    el('div', { class: 'clg-chat-brand' }, [
      el('span', { class: 'clg-chat-brand__icon', html: shieldSvg() }),
      el('div', { class: 'clg-chat-brand__text' }, [
        el('div', { class: 'clg-chat-brand__title' }, ['Lifeguard AI']),
        el('div', { class: 'clg-chat-brand__sub' }, ['Your crypto co-pilot'])
      ])
    ]),
    el('div', { class: 'clg-chat-header__actions' }, [
      el('button', {
        class: 'clg-chat-icon-btn',
        type: 'button',
        title: 'Clear conversation',
        'aria-label': 'Clear conversation',
        onclick: onReset,
        html: trashSvg()
      }),
      el('button', {
        class: 'clg-chat-icon-btn',
        type: 'button',
        title: 'Close',
        'aria-label': 'Close chat',
        onclick: onClose,
        html: closeSvg()
      })
    ])
  ]);

  // Body (scroll container)
  const body = el('div', { class: 'clg-chat-body', id: 'clg-chat-body' });

  // Composer
  const textarea = el('textarea', {
    class: 'clg-chat-textarea',
    placeholder: 'Ask Lifeguard AI anything about crypto…',
    rows: '1',
    'aria-label': 'Message'
  });
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 140) + 'px';
  });
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const v = textarea.value.trim();
      if (v) onSend(v, textarea);
    }
  });
  const sendBtn = el('button', {
    class: 'clg-chat-send',
    type: 'button',
    title: 'Send',
    'aria-label': 'Send message',
    html: sendSvg(),
    onclick: () => {
      const v = textarea.value.trim();
      if (v) onSend(v, textarea);
    }
  });
  const composer = el('div', { class: 'clg-chat-composer' }, [
    el('div', { class: 'clg-chat-composer__inner' }, [textarea, sendBtn]),
    el('div', { class: 'clg-chat-composer__hint' }, [
      el('span', {}, ['Enter to send · Shift+Enter for newline · Esc to close']),
      el('span', { class: 'clg-chat-powered' }, ['Powered by Grok'])
    ])
  ]);

  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(composer);
  return { panel, body, textarea };
}

// ---- Message rendering ----------------------------------------------------
function renderWelcome(bodyEl, onStarter) {
  const starters = getStarterPrompts();
  const wrap = el('div', { class: 'clg-chat-welcome' }, [
    el('div', { class: 'clg-chat-welcome__badge' }, ['Lifeguard AI · beta']),
    el('h3', { class: 'clg-chat-welcome__title' }, ["Hi, I'm your crypto co-pilot"]),
    el('p', { class: 'clg-chat-welcome__lede' }, [
      'Ask me about live prices, active alerts, recent news, or anything on your watchlist. I have access to real-time data, so I won\'t guess.'
    ]),
    el('div', { class: 'clg-chat-skills' }, [
      skillPill('📈', 'Market Analyst'),
      skillPill('🛡️', 'Security Watchdog'),
      skillPill('📰', 'News Scout'),
      skillPill('⭐', 'Watchlist Coach')
    ]),
    el('div', { class: 'clg-chat-starters' }, starters.map((s) =>
      el('button', {
        class: 'clg-chat-starter',
        type: 'button',
        onclick: () => onStarter(s.text)
      }, [
        el('span', { class: 'clg-chat-starter__icon' }, [s.icon]),
        el('span', { class: 'clg-chat-starter__text' }, [s.text])
      ])
    ))
  ]);
  bodyEl.appendChild(wrap);
}

function skillPill(icon, label) {
  return el('span', { class: 'clg-chat-skill' }, [
    el('span', {}, [icon]),
    el('span', {}, [label])
  ]);
}

function renderUserMessage(bodyEl, text) {
  const wrap = el('div', { class: 'clg-chat-msg clg-chat-msg--user' }, [
    el('div', { class: 'clg-chat-bubble' }, [el('p', {}, [text])])
  ]);
  bodyEl.appendChild(wrap);
  // User sending a new message = intent to see the latest. Force pin.
  scrollBottom(bodyEl, { force: true });
}

function renderAssistantBubble(bodyEl) {
  const tools = el('div', { class: 'clg-chat-tools' });
  const content = el('div', { class: 'clg-chat-bubble clg-chat-bubble--ai' }, [
    el('div', { class: 'clg-chat-ai-header' }, [
      el('span', { class: 'clg-chat-ai-icon', html: sparklesSvg() }),
      el('span', {}, ['Lifeguard AI'])
    ]),
    tools,
    el('div', { class: 'clg-chat-content' }, [
      el('span', { class: 'clg-chat-typing' }, [
        el('span', {}, []), el('span', {}, []), el('span', {}, [])
      ])
    ])
  ]);
  const wrap = el('div', { class: 'clg-chat-msg clg-chat-msg--ai' }, [content]);
  bodyEl.appendChild(wrap);
  // New assistant turn after a user send = pin to bottom.
  scrollBottom(bodyEl, { force: true });
  return {
    wrap,
    tools,
    contentEl: content.querySelector('.clg-chat-content'),
    setTyping(on) {
      const t = content.querySelector('.clg-chat-typing');
      if (on && !t) content.querySelector('.clg-chat-content').innerHTML = '<span class="clg-chat-typing"><span></span><span></span><span></span></span>';
      else if (!on && t) t.remove();
    },
    addTool(label) {
      const pill = el('div', { class: 'clg-chat-tool-pill' }, [
        el('span', { class: 'clg-chat-tool-pill__icon', html: toolSvg() }),
        el('span', {}, [label]),
        el('span', { class: 'clg-chat-tool-pill__spinner' })
      ]);
      tools.appendChild(pill);
      return pill;
    },
    completeTool(pill) {
      pill?.classList.add('is-done');
      const sp = pill?.querySelector('.clg-chat-tool-pill__spinner');
      if (sp) sp.remove();
      const check = el('span', { class: 'clg-chat-tool-pill__check' }, ['✓']);
      pill?.appendChild(check);
    }
  };
}

// Auto-pin-to-bottom helper. Each body element is marked with `.clg-stick`
// when the user is near the bottom; streaming updates should only yank the
// viewport down while that flag is set, so readers scrolling up to re-read
// history aren't bounced back down on every chunk.
const STICK_THRESHOLD_PX = 60;
function isNearBottom(bodyEl) {
  if (!bodyEl) return true;
  return (bodyEl.scrollHeight - bodyEl.scrollTop - bodyEl.clientHeight) <= STICK_THRESHOLD_PX;
}
function attachStickyScroll(bodyEl) {
  if (!bodyEl || bodyEl.__clgStickyBound) return;
  bodyEl.__clgStickyBound = true;
  bodyEl.__clgStick = true;
  bodyEl.addEventListener('scroll', () => {
    bodyEl.__clgStick = isNearBottom(bodyEl);
  }, { passive: true });
}
function scrollBottom(bodyEl, { force = false } = {}) {
  if (!bodyEl) return;
  if (!force && bodyEl.__clgStick === false) return;
  // Instant jump - no rAF, no smooth animation. Streaming chunks arrive
  // faster than a smooth animation can catch up, which is what was making
  // the panel appear to "break" and leave the latest text below the fold.
  bodyEl.scrollTop = bodyEl.scrollHeight;
  bodyEl.__clgStick = true;
}

// ---- SSE reader -----------------------------------------------------------
async function streamChat({ messages, context, onEvent, signal }) {
  const url = `${API_BASE}/api/chat`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
    credentials: 'include',
    body: JSON.stringify({ messages, context }),
    signal
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Chat ${res.status}: ${text.slice(0, 200)}`);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error('no stream');
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Parse SSE events: split on double newline
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = 'message';
      let dataLines = [];
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length) {
        let payload = dataLines.join('\n');
        try { payload = JSON.parse(payload); } catch {}
        onEvent(event, payload);
      }
    }
  }
}

// ---- Controller -----------------------------------------------------------
function buildController(root) {
  state.messages = loadHistory();

  let panelEl = null;
  let bodyEl = null;
  let textareaEl = null;
  let launcherEl = null;
  let backdropEl = null;
  let activeStream = null;

  function openChat() {
    if (state.isOpen) return;
    state.isOpen = true;
    try { sessionStorage.setItem(OPEN_KEY, '1'); } catch {}
    renderAll();
    requestAnimationFrame(() => {
      panelEl?.classList.add('is-open');
      backdropEl?.classList.add('is-open');
      textareaEl?.focus();
    });
  }
  function closeChat() {
    state.isOpen = false;
    try { sessionStorage.removeItem(OPEN_KEY); } catch {}
    panelEl?.classList.remove('is-open');
    backdropEl?.classList.remove('is-open');
    setTimeout(() => {
      if (!state.isOpen) {
        panelEl?.remove(); panelEl = null;
        backdropEl?.remove(); backdropEl = null;
      }
    }, 240);
  }
  function resetChat() {
    if (activeStream) { try { activeStream.abort(); } catch {} activeStream = null; }
    state.messages = [];
    state.isStreaming = false;
    saveHistory();
    if (bodyEl) { bodyEl.innerHTML = ''; renderWelcome(bodyEl, sendStarter); }
  }

  function sendStarter(text) { sendMessage(text); }

  async function sendMessage(text) {
    if (!text || state.isStreaming) return;
    // Drop the welcome screen if present
    const welcome = bodyEl?.querySelector('.clg-chat-welcome');
    if (welcome) welcome.remove();

    const userMsg = { role: 'user', content: text };
    state.messages.push(userMsg);
    renderUserMessage(bodyEl, text);
    saveHistory();

    if (textareaEl) {
      textareaEl.value = '';
      textareaEl.style.height = 'auto';
    }

    state.isStreaming = true;
    const bubble = renderAssistantBubble(bodyEl);
    let assistantText = '';
    const context = window.CLG_CHAT_CONTEXT || {};
    const activeTools = new Map();

    const ac = new AbortController();
    activeStream = ac;

    try {
      await streamChat({
        messages: state.messages.map(({ role, content }) => ({ role, content })),
        context,
        signal: ac.signal,
        onEvent: (event, data) => {
          if (event === 'tool') {
            if (data.status === 'running') {
              bubble.setTyping(false);
              const pill = bubble.addTool(describeTool(data.name, data.args));
              activeTools.set(`${data.name}:${JSON.stringify(data.args)}`, pill);
            } else if (data.status === 'done') {
              const pill = activeTools.get(`${data.name}:${JSON.stringify(data.args)}`);
              if (pill) bubble.completeTool(pill);
            }
          } else if (event === 'chunk') {
            bubble.setTyping(false);
            assistantText += data.text || '';
            bubble.contentEl.innerHTML = renderMarkdown(assistantText);
            scrollBottom(bodyEl);
          } else if (event === 'done') {
            bubble.setTyping(false);
            if (!assistantText) {
              bubble.contentEl.innerHTML = '<p><em>No response. Try asking again.</em></p>';
            }
            const footer = el('div', { class: 'clg-chat-msg-footer' }, [
              el('span', { class: 'clg-chat-model' }, [data.model || 'AI'])
            ]);
            bubble.contentEl.appendChild(footer);
          } else if (event === 'error') {
            bubble.setTyping(false);
            bubble.contentEl.innerHTML = `<p class="clg-chat-error">⚠️ ${escapeHtml(data.error || 'Something went wrong')}</p>`;
          }
        }
      });
      state.messages.push({ role: 'assistant', content: assistantText });
      saveHistory();
    } catch (err) {
      bubble.setTyping(false);
      bubble.contentEl.innerHTML = `<p class="clg-chat-error">⚠️ ${escapeHtml(err.message || 'Chat failed')}</p>`;
    } finally {
      state.isStreaming = false;
      activeStream = null;
    }
  }

  function renderAll() {
    // Ensure launcher exists
    if (!launcherEl) {
      launcherEl = buildLauncher(openChat);
      root.appendChild(launcherEl);
    }

    if (state.isOpen && !panelEl) {
      backdropEl = el('div', { class: 'clg-chat-backdrop', onclick: closeChat });
      root.appendChild(backdropEl);

      const built = buildPanel({
        onClose: closeChat,
        onSend: (text) => sendMessage(text),
        onReset: resetChat,
        onStarter: sendStarter
      });
      panelEl = built.panel;
      bodyEl = built.body;
      textareaEl = built.textarea;
      attachStickyScroll(bodyEl);
      root.appendChild(panelEl);

      // Replay any prior conversation
      if (state.messages.length === 0) {
        renderWelcome(bodyEl, sendStarter);
      } else {
        for (const m of state.messages) {
          if (m.role === 'user') renderUserMessage(bodyEl, m.content);
          else {
            const b = renderAssistantBubble(bodyEl);
            b.setTyping(false);
            b.contentEl.innerHTML = renderMarkdown(m.content);
          }
        }
      }
    }
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      state.isOpen ? closeChat() : openChat();
    } else if (e.key === 'Escape' && state.isOpen) {
      closeChat();
    }
  });

  // Render the launcher immediately so it's visible on load
  renderAll();

  // Public API
  return { open: openChat, close: closeChat, reset: resetChat };
}

// ---- Boot -----------------------------------------------------------------
function boot() {
  let root = document.getElementById('lifeguard-chat-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'lifeguard-chat-root';
    document.body.appendChild(root);
  }
  const ctrl = buildController(root);
  window.LifeguardAI = ctrl;

  // Auto-restore if user had it open last session
  try {
    if (sessionStorage.getItem(OPEN_KEY) === '1') ctrl.open();
  } catch {}
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
