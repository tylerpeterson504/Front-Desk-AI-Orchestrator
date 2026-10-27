// Front Desk AI Side Panel Logic

import { getApiBaseUrl, getPropertyConfig, loadApiBaseUrl } from './config';

// API base URL comes from the shared extension config (single source of truth),
// which owns the chrome.storage.local `apiBaseUrl` override. init() awaits
// loadApiBaseUrl() before the first request, so this initial value only matters
// if something calls out before then.
let API_BASE = getApiBaseUrl() + '/api';

export {};

// ━━━━━━ State ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let authToken: string | null = null;
// Single-use: every refresh returns a replacement that must be written back.
let refreshToken: string | null = null;
let allTemplates: Template[] = [];
let selectedTemplates: Template[] = [];
let currentTone: 'professional' | 'friendly' = 'professional';
let guestInfo: GuestInfo | null = null;
let chatContext: ChatContext | null = null;
// Page context is kept per tab; only the active tab's entries are shown and used for drafts.
let activeTabId: number | null = null;
const guestInfoByTab = new Map<number, GuestInfo | null>();
const chatContextByTab = new Map<number, ChatContext | null>();
// Backend property id for the active tab's host. The server only accepts ids owned by the caller.
let activePropertyId: number | null = null;
// Tab the current draft belongs to. A draft can only be sent to that tab.
let draftTabId: number | null = null;

// Response-time analytics (issue #327): remember when a conversation first
// appeared in the panel; when the agent injects a reply, report the pair.
// Keyed by a short hash of the guest + last message, capped so a long shift
// cannot grow the map without bound.
const seenConversations = new Map<string, number>();

interface Template {
  id: number;
  name: string;
  content: string;
  category?: string;
  tags?: string[];
}

interface GuestInfo {
  guestName?: string;
  roomNumber?: string;
  checkIn?: string;
  checkOut?: string;
  reservationStatus?: string;
  confirmationNumber?: string;
}

interface ChatContext {
  messages?: Array<{ sender?: string; text: string }>;
  activeGuest?: string;
}

// Session endpoints must never trigger a refresh: a 401 from them is final.
const SESSION_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout'];

// One refresh at a time. The panel fires several requests on open (templates,
// shift notes, property detection); if each rotated the refresh token the
// stragglers would present a superseded one, which the server reads as theft
// and answers by revoking every session for the user.
let refreshInFlight: Promise<boolean> | null = null;

// ━━━━━━ Auth helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function getHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: 'Bearer ' + authToken } : {}),
  };
}

// Safe storage read: a rejected chrome.storage read (context invalidated,
// storage quota error) must never kill the init path — resolve to {} instead.
async function safeStorageGet(keys: string[]): Promise<Record<string, unknown>> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return {};
    return (await chrome.storage.local.get(keys)) || {};
  } catch {
    return {};
  }
}

async function persistSession(data: { token: string; refresh_token?: string }): Promise<void> {
  authToken = data.token;
  const stored: Record<string, string> = { token: data.token };
  if (data.refresh_token) stored.refreshToken = data.refresh_token;
  await chrome.storage.local.set(stored);
}

async function clearSession(): Promise<void> {
  authToken = null;
  refreshToken = null;
  await chrome.storage.local.remove(['token', 'refreshToken']);
}

function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  if (!refreshToken) return Promise.resolve(false);

  refreshInFlight = fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
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

async function send(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    method,
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function apiRequest(method: string, path: string, body?: unknown): Promise<unknown> {
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
    throw new Error((err as { error?: string }).error || 'Request failed');
  }
  if (res.status === 204) return null;
  return res.json();
}

// ━━━━━━ UI helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function show(id: string): void {
  document.getElementById(id)?.classList.remove('hidden');
}
function hide(id: string): void {
  document.getElementById(id)?.classList.add('hidden');
}
function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
function setDot(id: string, active: boolean): void {
  // Boolean() matters: toggle(x, undefined) flips instead of forcing off.
  document.getElementById(id)?.classList.toggle('active', Boolean(active));
}

// ━━━━━━ Init ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function init(): Promise<void> {
  API_BASE = (await loadApiBaseUrl()) + '/api';
  const stored = await safeStorageGet(['token', 'refreshToken']);
  refreshToken = (stored.refreshToken as string) || null;
  if (stored.token) {
    authToken = stored.token as string;
    showMainPanel();
  } else {
    showAuthPrompt();
  }
}

function showAuthPrompt(): void {
  show('auth-prompt');
  hide('main-panel');
}

async function showMainPanel(): Promise<void> {
  hide('auth-prompt');
  show('main-panel');
  await Promise.all([loadTemplates(), loadShiftNotes()]);
}

// The popup removes the session from storage when the backend changes. Drop the
// in-memory session to match, and pick up a changed backend URL.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.token && !changes.token.newValue) {
    authToken = null;
    refreshToken = null;
    showAuthPrompt();
  } else if (changes.refreshToken && !changes.refreshToken.newValue) {
    refreshToken = null;
  }
  if (changes.apiBaseUrl) {
    void loadApiBaseUrl().then((base) => {
      API_BASE = base + '/api';
    });
  }
});

// ━━━━━━ Auth ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
document.getElementById('btn-login')?.addEventListener('click', async () => {
  const email = (document.getElementById('auth-email') as HTMLInputElement)?.value.trim() || '';
  const password = (document.getElementById('auth-password') as HTMLInputElement)?.value || '';
  const errorEl = document.getElementById('auth-error');

  errorEl?.classList.add('hidden');
  try {
    const data = await apiRequest('POST', '/auth/login', { email, password });
    refreshToken = (data as { refresh_token?: string }).refresh_token || null;
    await persistSession(data as { token: string; refresh_token?: string });
    showMainPanel();
  } catch (err: unknown) {
    const message = (err as Error).message || 'Login failed';
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
    }
  }
});

document.getElementById('btn-logout')?.addEventListener('click', async () => {
  // Tell the server first so the session is actually revoked, then clear
  // locally regardless — a failed call must not leave the panel signed in.
  try {
    if (refreshToken) {
      await apiRequest('POST', '/auth/logout', { refresh_token: refreshToken });
    }
  } catch {
    // Nothing useful to show: we are logging out either way.
  } finally {
    await clearSession();
    clearPanelState();
    showAuthPrompt();
  }
});

function clearPanelState(): void {
  guestInfoByTab.clear();
  chatContextByTab.clear();
  applyGuestInfo(null);
  applyChatContext(null);
  selectedTemplates = [];
  renderTemplates(allTemplates);
  renderSelected();
  activePropertyId = null;
  setDot('dot-property', false);
  setText('label-property', 'No property');
  setText('response-box', 'Response will appear here…');
  document.getElementById('response-box')?.classList.add('empty');
  hide('btn-copy');
  hide('btn-inject');
}

// ━━━━━━ Property detection ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// The side panel's own location is the extension page, so the property is read
// from the active tab's URL.
function propertyForUrl(url: string | undefined): { id: number; name: string } | null {
  if (!url) return null;
  try {
    return getPropertyConfig(new URL(url).hostname);
  } catch {
    return null;
  }
}

function detectProperty(tabId: number): void {
  activePropertyId = null;
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || tabId !== activeTabId) return;
    const config = propertyForUrl(tab?.url);
    activePropertyId = config?.id ?? null;
    setDot('dot-property', Boolean(config));
    setText('label-property', config ? config.name : 'No property');
  });
}

// ━━━━━━ Page data (guest info / chat context) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function activateCurrentTab(): void {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.id !== undefined) activateTab(tab.id);
  });
}

function activateTab(tabId: number): void {
  activeTabId = tabId;
  applyGuestInfo(guestInfoByTab.get(tabId) ?? null);
  applyChatContext(chatContextByTab.get(tabId) ?? null);
  detectProperty(tabId);
  requestPageData(tabId);
}

function requestPageData(tabId: number): void {
  chrome.tabs.sendMessage(tabId, { type: 'GET_GUEST_INFO' }, (res) => {
    if (chrome.runtime.lastError) return;
    if (res?.data) updateGuestInfo(res.data, tabId);
  });
  chrome.tabs.sendMessage(tabId, { type: 'GET_CHAT_CONTEXT' }, (res) => {
    if (chrome.runtime.lastError) return;
    if (res?.data) updateChatContext(res.data, tabId);
  });
}

chrome.tabs.onActivated.addListener(() => activateCurrentTab());

chrome.runtime.onMessage.addListener((message: { type: string; data?: unknown; tabId?: number }) => {
  if (message.tabId === undefined) return;
  if (message.type === 'GUEST_INFO_UPDATED') updateGuestInfo(message.data as GuestInfo, message.tabId);
  if (message.type === 'CHAT_CONTEXT_UPDATED') updateChatContext(message.data as ChatContext, message.tabId);
});

function updateGuestInfo(data: GuestInfo | null, tabId: number): void {
  guestInfoByTab.set(tabId, data);
  if (tabId === activeTabId) applyGuestInfo(data);
}

function applyGuestInfo(data: GuestInfo | null): void {
  guestInfo = data;
  const hasData = data?.guestName || data?.roomNumber;
  setDot('dot-guest', Boolean(hasData));
  setText('label-guest', data?.guestName || 'No guest');

  const parts = [
    data?.guestName && `Guest: ${data.guestName}`,
    data?.roomNumber && `Room: ${data.roomNumber}`,
    data?.checkIn && `Check-in: ${data.checkIn}`,
    data?.checkOut && `Check-out: ${data.checkOut}`,
    data?.reservationStatus && `Status: ${data.reservationStatus}`,
  ].filter(Boolean) as string[];

  setText('guest-info-block', parts.length ? parts.join('\n') : 'No guest data found on this page');
}

function updateChatContext(data: ChatContext | null, tabId: number): void {
  chatContextByTab.set(tabId, data);
  if (tabId === activeTabId) applyChatContext(data);
}

function applyChatContext(data: ChatContext | null): void {
  chatContext = data;
  noteConversationSeen(data);
  const block = document.getElementById('chat-context-block');
  if (!data?.messages?.length && !data?.activeGuest) {
    if (block) block.textContent = 'No active chat';
    return;
  }
  const lines: string[] = [];
  if (data?.activeGuest) lines.push(`Guest: ${data.activeGuest}`);
  data?.messages?.slice(-3).forEach((m) => {
    lines.push(`${m.sender || 'Guest'}: ${m.text}`);
  });
  if (block) block.textContent = lines.join('\n');
}

// ━━━━━━ Response-time analytics ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Stable short hash of the conversation (guest + last message) so a reply can
// be paired with the moment the conversation first appeared in the panel.
function conversationHash(data: ChatContext | null): string | null {
  if (!data || (!data.activeGuest && !data.messages?.length)) return null;
  const tail = data.messages?.length ? (data.messages[data.messages.length - 1]?.text ?? '') : '';
  const key = `${data.activeGuest || ''}|${tail}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

function noteConversationSeen(data: ChatContext | null): void {
  const hash = conversationHash(data);
  if (!hash || seenConversations.has(hash)) return;
  seenConversations.set(hash, Date.now());
  // FIFO cap: drop the oldest entry so the map stays bounded.
  if (seenConversations.size > 50) {
    const oldest = seenConversations.keys().next().value;
    if (oldest !== undefined) seenConversations.delete(oldest);
  }
}

function noteReplySent(): void {
  const hash = conversationHash(chatContext);
  if (!hash) return;
  const firstSeenAt = seenConversations.get(hash);
  if (!firstSeenAt) return;
  seenConversations.delete(hash);

  // The server requires a property the caller owns; without one there is
  // nothing useful to report.
  const propertyId = activePropertyId;
  if (!propertyId) return;

  // Fire-and-forget: analytics must never block or break the panel.
  apiRequest('POST', '/analytics/response-events', {
    events: [
      {
        property_id: propertyId,
        conversation_hash: hash,
        first_seen_at: new Date(firstSeenAt).toISOString(),
        replied_at: new Date().toISOString(),
      },
    ],
  }).catch(() => {});
}

// ━━━━━━ Shift notes ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/**
 * Fetch today's shift notes and render them into the shift notes block.
 */
async function loadShiftNotes(): Promise<void> {
  try {
    const notes = await apiRequest('GET', '/shift-notes');
    const block = document.getElementById('shift-notes-block');
    if (!notes || !Array.isArray(notes) || notes.length === 0) {
      if (block) block.textContent = 'No shift notes for today';
      return;
    }
    if (block)
      block.textContent = notes.map((n: { content: string }) => `• ${n.content}`).join('\n');
  } catch {
    setText('shift-notes-block', 'Unable to load shift notes');
  }
}

// ━━━━━━ Templates ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function loadTemplates(): Promise<void> {
  try {
    const data = await apiRequest('GET', '/templates');
    allTemplates = (data as Template[]) || [];
    renderTemplates(allTemplates);
  } catch {
    setText('template-list', 'Unable to load templates');
  }
}

function renderTemplates(templates: Template[]): void {
  const list = document.getElementById('template-list');
  if (!list) return;
  list.innerHTML = '';
  templates.forEach((t) => {
    const el = document.createElement('div');
    el.className = `template-item${selectedTemplates.find((s) => s.id === t.id) ? ' selected' : ''}`;
    el.textContent = t.name;
    el.dataset.id = String(t.id);
    el.addEventListener('click', () => toggleTemplate(t));
    list.appendChild(el);
  });
}

function toggleTemplate(template: Template): void {
  const idx = selectedTemplates.findIndex((t) => t.id === template.id);
  if (idx === -1) {
    selectedTemplates.push(template);
  } else {
    selectedTemplates.splice(idx, 1);
  }
  renderTemplates(allTemplates);
  renderSelected();
}

function renderSelected(): void {
  const list = document.getElementById('selected-list');
  const section = document.getElementById('section-selected');
  if (!list || !section) return;
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
    removeButton.dataset.id = String(t.id);
    removeButton.textContent = '✕';

    el.append(label, removeButton);
    removeButton.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedTemplates = selectedTemplates.filter((s) => s.id !== t.id);
      renderTemplates(allTemplates);
      renderSelected();
    });
    list.appendChild(el);
  });
}

// Template search
document.getElementById('template-search')?.addEventListener('input', (e) => {
  const q = (e.target as HTMLInputElement).value.toLowerCase();
  renderTemplates(
    allTemplates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.tags && t.tags.some((tag) => tag.toLowerCase().includes(q)))
    )
  );
});

// ━━━━━━ Tone toggle ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
document.querySelectorAll('.tone-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tone-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentTone = (btn as HTMLElement).dataset.tone as 'professional' | 'friendly';
  });
});

// ━━━━━━ Generate response ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function localFallbackDraft(guest: GuestInfo | null): string {
  // Template stitching fallback (also used when the server has no AI key).
  const combined = selectedTemplates.map((t) => t.content).join('\n\n');
  const toneNote =
    currentTone === 'friendly'
      ? combined.replace(/\bsincerely\b/gi, 'warmly').replace(/\bkindly\b/gi, 'warmly')
      : combined;
  return guest?.guestName ? `Dear ${guest.guestName},\n\n${toneNote}` : toneNote;
}

function showDraft(text: string, tabId: number | null): void {
  draftTabId = tabId;
  const box = document.getElementById('response-box');
  if (box) {
    box.textContent = text;
    box.classList.remove('empty');
  }
  show('btn-copy');
  // Only show inject button if we're on an Akia page
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.url?.includes('akia')) show('btn-inject');
  });
}

document.getElementById('btn-generate')?.addEventListener('click', async () => {
  if (!selectedTemplates.length) {
    alert('Select at least one template first');
    return;
  }

  const btn = document.getElementById('btn-generate');
  if (!btn || (btn as HTMLButtonElement).disabled) return;
  (btn as HTMLButtonElement).disabled = true;
  setText('response-box', 'Drafting…');
  document.getElementById('response-box')?.classList.remove('empty');

  // The draft belongs to the tab that was active when it was requested.
  const tabId = activeTabId;
  const guest = guestInfo;
  try {
    const data = await apiRequest('POST', '/copilot/draft', {
      property_id: activePropertyId || undefined,
      tone: currentTone,
      template_ids: selectedTemplates.map((t) => t.id),
      guest_info: guest || undefined,
      chat_context: chatContext || undefined,
    });
    if (data && typeof data === 'object' && 'draft' in data && String(data.draft).trim()) {
      showDraft(String(data.draft), tabId);
    } else {
      // Server responded but produced no draft (LLM unconfigured) — local path.
      showDraft(localFallbackDraft(guest), tabId);
    }
  } catch {
    // Server AI unavailable (no key / offline): use the local template path.
    showDraft(localFallbackDraft(guest), tabId);
  } finally {
    if (btn) (btn as HTMLButtonElement).disabled = false;
  }
});

// ━━━━━━ Copy ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
document.getElementById('btn-copy')?.addEventListener('click', () => {
  const text = document.getElementById('response-box')?.textContent || '';
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('btn-copy');
    if (btn) {
      btn.textContent = 'Copied!';
      setTimeout(() => {
        btn.textContent = 'Copy';
      }, 2000);
    }
  });
});

// ━━━━━━ Inject to chat ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
document.getElementById('btn-inject')?.addEventListener('click', () => {
  const text = document.getElementById('response-box')?.textContent || '';
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    const target = draftTabId;
    if (target === null || tab?.id !== target) {
      alert('Switch back to the chat this draft was written for to inject it.');
      return;
    }
    chrome.tabs.sendMessage(target, { type: 'INJECT_MESSAGE', text }, (res) => {
      if (res?.success) {
        noteReplySent();
        const btn = document.getElementById('btn-inject');
        if (btn) {
          btn.textContent = 'Injected!';
          setTimeout(() => {
            btn.textContent = 'Inject to Chat';
          }, 2000);
        }
      }
    });
  });
});

// ━━━━━━ Start ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
init();
activateCurrentTab();
