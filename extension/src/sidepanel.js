// Front Desk AI Side Panel Logic

// API base URL comes from the shared extension config (single source of truth).
// An optional `apiBaseUrl` in chrome.storage.local overrides it per install,
// so production deployments do not require code edits.
let API_BASE = (typeof getApiBaseUrl === 'function' ? getApiBaseUrl() : 'http://localhost:3001') + '/api';

// ─── State ───────────────────────────────────────────────────────────────────
let authToken = null;
let allTemplates = [];
let selectedTemplates = [];
let currentTone = 'professional';
let guestInfo = null;
let chatContext = null;

// ─── Auth helpers ─────────────────────────────────────────────────────────────
function getHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: 'Bearer ' + authToken } : {})
  };
}

async function apiRequest(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  if (res.status === 204) return null;
  return res.json();
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
function setText(id, text) { document.getElementById(id).textContent = text; }
function setDot(id, active) {
  // Boolean() matters: toggle(x, undefined) flips instead of forcing off.
  document.getElementById(id).classList.toggle('active', Boolean(active));
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const stored = await chrome.storage.local.get(['token', 'apiBaseUrl']);
  if (stored.apiBaseUrl) {
    API_BASE = String(stored.apiBaseUrl).replace(/\/+$/, '') + '/api';
  }
  if (stored.token) {
    authToken = stored.token;
    showMainPanel();
  } else {
    showAuthPrompt();
  }
}

function showAuthPrompt() {
  show('auth-prompt');
  hide('main-panel');
}

async function showMainPanel() {
  hide('auth-prompt');
  show('main-panel');
  await Promise.all([loadTemplates(), loadShiftNotes()]);
  detectProperty();
  requestPageData();
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
document.getElementById('btn-login').addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errorEl = document.getElementById('auth-error');

  errorEl.classList.add('hidden');
  try {
    const data = await apiRequest('POST', '/auth/login', { email, password });
    authToken = data.token;
    await chrome.storage.local.set({ token: data.token });
    showMainPanel();
  } catch (err) {
    errorEl.textContent = err.message || 'Login failed';
    errorEl.classList.remove('hidden');
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  authToken = null;
  await chrome.storage.local.remove(['token']);
  showAuthPrompt();
});

// ─── Property detection ───────────────────────────────────────────────────────
function detectProperty() {
  const config = typeof getPropertyConfig === 'function' ? getPropertyConfig() : null;
  if (config) {
    setDot('dot-property', true);
    setText('label-property', config.name);
  } else {
    setDot('dot-property', false);
    setText('label-property', 'No property');
  }
}

// ─── Page data (guest info / chat context) ────────────────────────────────────
function requestPageData() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: 'GET_GUEST_INFO' }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res?.data) updateGuestInfo(res.data);
    });
    chrome.tabs.sendMessage(tab.id, { type: 'GET_CHAT_CONTEXT' }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res?.data) updateChatContext(res.data);
    });
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'GUEST_INFO_UPDATED') updateGuestInfo(message.data);
  if (message.type === 'CHAT_CONTEXT_UPDATED') updateChatContext(message.data);
});

function updateGuestInfo(data) {
  guestInfo = data;
  const hasData = data.guestName || data.roomNumber;
  setDot('dot-guest', hasData);
  setText('label-guest', data.guestName || 'No guest');

  const parts = [
    data.guestName && `Guest: ${data.guestName}`,
    data.roomNumber && `Room: ${data.roomNumber}`,
    data.checkIn && `Check-in: ${data.checkIn}`,
    data.checkOut && `Check-out: ${data.checkOut}`,
    data.reservationStatus && `Status: ${data.reservationStatus}`
  ].filter(Boolean);

  document.getElementById('guest-info-block').textContent =
    parts.length ? parts.join('\n') : 'No guest data found on this page';
}

function updateChatContext(data) {
  chatContext = data;
  const block = document.getElementById('chat-context-block');
  if (!data.messages?.length && !data.activeGuest) {
    block.textContent = 'No active chat';
    return;
  }
  const lines = [];
  if (data.activeGuest) lines.push(`Guest: ${data.activeGuest}`);
  data.messages.slice(-3).forEach((m) => {
    lines.push(`${m.sender || 'Guest'}: ${m.text}`);
  });
  block.textContent = lines.join('\n');
}

// ─── Shift notes ──────────────────────────────────────────────────────────────
async function loadShiftNotes() {
  try {
    const notes = await apiRequest('GET', '/shift-notes');
    const block = document.getElementById('shift-notes-block');
    if (!notes?.length) {
      block.textContent = 'No shift notes for today';
      return;
    }
    block.textContent = notes.map((n) => `• ${n.content}`).join('\n');
  } catch {
    document.getElementById('shift-notes-block').textContent = 'Unable to load shift notes';
  }
}

// ─── Templates ────────────────────────────────────────────────────────────────
async function loadTemplates() {
  try {
    const data = await apiRequest('GET', '/templates');
    allTemplates = data || [];
    renderTemplates(allTemplates);
  } catch {
    document.getElementById('template-list').textContent = 'Unable to load templates';
  }
}

function renderTemplates(templates) {
  const list = document.getElementById('template-list');
  list.innerHTML = '';
  templates.forEach((t) => {
    const el = document.createElement('div');
    el.className = `template-item${selectedTemplates.find((s) => s.id === t.id) ? ' selected' : ''}`;
    el.textContent = t.name;
    el.dataset.id = t.id;
    el.addEventListener('click', () => toggleTemplate(t));
    list.appendChild(el);
  });
}

function toggleTemplate(template) {
  const idx = selectedTemplates.findIndex((t) => t.id === template.id);
  if (idx === -1) {
    selectedTemplates.push(template);
  } else {
    selectedTemplates.splice(idx, 1);
  }
  renderTemplates(allTemplates);
  renderSelected();
}

function renderSelected() {
  const list = document.getElementById('selected-list');
  const section = document.getElementById('section-selected');
  list.innerHTML = '';

  if (!selectedTemplates.length) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';

  selectedTemplates.forEach((t) => {
    const el = document.createElement('div');
    el.className = 'selected-item';
    el.innerHTML = `<span>${t.name}</span><button class="remove-btn" data-id="${t.id}">✕</button>`;
    el.querySelector('.remove-btn').addEventListener('click', () => {
      selectedTemplates = selectedTemplates.filter((s) => s.id !== t.id);
      renderTemplates(allTemplates);
      renderSelected();
    });
    list.appendChild(el);
  });
}

// Template search
document.getElementById('template-search').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  renderTemplates(
    allTemplates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.tags && t.tags.some((tag) => tag.toLowerCase().includes(q)))
    )
  );
});

// ─── Tone toggle ──────────────────────────────────────────────────────────────
document.querySelectorAll('.tone-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tone-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentTone = btn.dataset.tone;
  });
});

// ─── Generate response ────────────────────────────────────────────────────────
function localFallbackDraft() {
  // Template stitching fallback (also used when the server has no AI key).
  const combined = selectedTemplates.map((t) => t.content).join('\n\n');
  const toneNote =
    currentTone === 'friendly'
      ? combined.replace(/\bsincerely\b/gi, 'warmly').replace(/\bkindly\b/gi, 'warmly')
      : combined;
  return guestInfo?.guestName ? `Dear ${guestInfo.guestName},\n\n${toneNote}` : toneNote;
}

// Resolve the backend property id for the tab's host. config.js maps hosts to
// property configs; the server only accepts ids owned by the caller.
function resolvePropertyId() {
  try {
    const config = typeof getPropertyConfig === 'function' ? getPropertyConfig() : null;
    return config?.id ?? null;
  } catch {
    return null;
  }
}

function showDraft(text) {
  const box = document.getElementById('response-box');
  box.textContent = text;
  box.classList.remove('empty');
  show('btn-copy');
  // Only show inject button if we're on an Akia page
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.url?.includes('akia')) show('btn-inject');
  });
}

document.getElementById('btn-generate').addEventListener('click', async () => {
  if (!selectedTemplates.length) {
    alert('Select at least one template first');
    return;
  }

  const btn = document.getElementById('btn-generate');
  if (btn.disabled) return;
  btn.disabled = true;
  setText('response-box', 'Drafting…');
  document.getElementById('response-box').classList.remove('empty');

  try {
    const data = await apiRequest('POST', '/copilot/draft', {
      property_id: resolvePropertyId() || undefined,
      tone: currentTone,
      template_ids: selectedTemplates.map((t) => t.id),
      guest_info: guestInfo || undefined,
      chat_context: chatContext || undefined
    });
    if (data?.draft && String(data.draft).trim()) {
      showDraft(data.draft);
    } else {
      // Server responded but produced no draft (LLM unconfigured) — local path.
      showDraft(localFallbackDraft());
    }
  } catch (err) {
    // Server AI unavailable (no key / offline): use the local template path.
    showDraft(localFallbackDraft());
  } finally {
    btn.disabled = false;
  }
});

// ─── Copy ─────────────────────────────────────────────────────────────────────
document.getElementById('btn-copy').addEventListener('click', () => {
  const text = document.getElementById('response-box').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('btn-copy');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  });
});

// ─── Inject to chat ───────────────────────────────────────────────────────────
document.getElementById('btn-inject').addEventListener('click', () => {
  const text = document.getElementById('response-box').textContent;
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: 'INJECT_MESSAGE', text }, (res) => {
      if (res?.success) {
        const btn = document.getElementById('btn-inject');
        btn.textContent = 'Injected!';
        setTimeout(() => { btn.textContent = 'Inject to Chat'; }, 2000);
      }
    });
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
init();
