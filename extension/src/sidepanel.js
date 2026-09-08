// Front Desk AI Side Panel Logic

// API base URL comes from the shared extension config (single source of truth),
// which owns the chrome.storage.local `apiBaseUrl` override. init() awaits
// loadApiBaseUrl() before the first request, so this initial value only matters
// if something calls out before then.
let API_BASE = (typeof getApiBaseUrl === 'function' ? getApiBaseUrl() : 'http://localhost:3001') + '/api';

// ─── State ───────────────────────────────────────────────────────────────────
let authToken = null;
// Single-use: every refresh returns a replacement that must be written back.
let refreshToken = null;
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

// Session endpoints must never trigger a refresh: a 401 from them is final.
const SESSION_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout'];

// One refresh at a time. The panel fires several requests on open (templates,
// shift notes, property detection); if each rotated the refresh token the
// stragglers would present a superseded one, which the server reads as theft
// and answers by revoking every session for the user.
let refreshInFlight = null;

async function persistSession(data) {
  authToken = data.token;
  const stored = { token: data.token };
  if (data.refresh_token) stored.refreshToken = data.refresh_token;
  await chrome.storage.local.set(stored);
}

async function clearSession() {
  authToken = null;
  refreshToken = null;
  await chrome.storage.local.remove(['token', 'refreshToken']);
}

function refreshSession() {
  if (refreshInFlight) return refreshInFlight;
  if (!refreshToken) return Promise.resolve(false);

  refreshInFlight = fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  })
    .then(async (res) => {
      if (!res.ok) return false;
      const data = await res.json();
      refreshToken = data.refresh_token || refreshToken;
      await persistSession(data);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

async function send(method, path, body) {
  return fetch(`${API_BASE}${path}`, {
    method,
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined
  });
}

async function apiRequest(method, path, body) {
  let res = await send(method, path, body);

  // Access tokens last 15 minutes, so an expired one is routine during a shift.
  // Refresh once, replay, and only fall back to the login prompt if that fails.
  if (res.status === 401 && !SESSION_PATHS.includes(path)) {
    const refreshed = await refreshSession();
    if (refreshed) {
      res = await send(method, path, body);
    }
    if (!refreshed || res.status === 401) {
      await clearSession();
      showAuthPrompt();
      throw new Error('Session expired — please sign in again');
    }
  }

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
  if (typeof loadApiBaseUrl === 'function') {
    API_BASE = (await loadApiBaseUrl()) + '/api';
  }
  const stored = await chrome.storage.local.get(['token', 'refreshToken']);
  refreshToken = stored.refreshToken || null;
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
    refreshToken = data.refresh_token || null;
    await persistSession(data);
    showMainPanel();
  } catch (err) {
    errorEl.textContent = err.message || 'Login failed';
    errorEl.classList.remove('hidden');
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  // Tell the server first so the session is actually revoked, then clear
  // locally regardless — a failed call must not leave the panel signed in.
  try {
    if (refreshToken) {
      await apiRequest('POST', '/auth/logout', { refresh_token: refreshToken });
    }
  } catch (err) {
    // Nothing useful to show: we are logging out either way.
  } finally {
    await clearSession();
    showAuthPrompt();
  }
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
    // Template names are user-supplied and arrive from the API, so they are set
    // as text rather than interpolated into markup.
    const label = document.createElement('span');
    label.textContent = t.name;

    const removeButton = document.createElement('button');
    removeButton.className = 'remove-btn';
    removeButton.dataset.id = t.id;
    removeButton.textContent = '✕';

    el.append(label, removeButton);
    removeButton.addEventListener('click', () => {
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
