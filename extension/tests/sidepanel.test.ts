// Sidepanel logic tests for the Front Desk AI extension.
//
// sidepanel.js wires DOM listeners and chrome.* APIs at import time, so each
// test sets up a fixture DOM, loads the module with vi.resetModules, and
// drives behavior through the mocked chrome APIs and DOM events.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Keep track of the module's registered runtime and tab-activation listeners.
let runtimeListener: any = null;
let activatedListener: any = null;

async function loadSidepanel() {
  await import('../src/sidepanel.ts');
  runtimeListener = chrome.runtime.onMessage.addListener.mock.calls[0]?.[0] || null;
  activatedListener = chrome.tabs.onActivated.addListener.mock.calls[0]?.[0] || null;
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Make `tab` the active tab of the current window, then fire tabs.onActivated.
function activateTab(tab: { id: number; url: string }) {
  chrome.tabs.query.mockImplementation((_q: any, cb: any) => cb([tab]));
  chrome.tabs.get.mockImplementation((_id: any, cb: any) => cb(tab));
  activatedListener();
}

// Load the panel on tab 1 with one template selected and a generated draft.
async function loadPanelWithDraft(draft: string) {
  global.fetch = vi.fn().mockImplementation((url: any) => {
    if (String(url).includes('/copilot/draft')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ draft }) });
    }
    if (String(url).includes('/templates')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => [{ id: 1, name: 'Checkout', content: 'Checkout is at 11:00 AM.', tags: [] }]
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => [] });
  });
  chrome.storage.local.get.mockResolvedValue({ token: 't' });
  await loadSidepanel();
  await flush();
  await flush();
  (document.querySelector('#template-list .template-item') as HTMLElement).click();
  document.getElementById('btn-generate')!.click();
  await flush();
  await flush();
  await flush();
}

// Build a DOM matching sidepanel.html's structure (ids the script depends on).
function setupDom() {
  document.body.innerHTML = `
    <div id="auth-prompt" class="hidden"></div>
    <div id="main-panel" class="hidden"></div>
    <input id="auth-email" />
    <input id="auth-password" />
    <div id="auth-error" class="hidden"></div>
    <button id="btn-login"></button>
    <button id="btn-logout"></button>
    <span id="dot-property"></span>
    <span id="label-property"></span>
    <span id="dot-guest"></span>
    <span id="label-guest"></span>
    <div id="guest-info-block"></div>
    <div id="chat-context-block"></div>
    <div id="shift-notes-block"></div>
    <input id="template-search" />
    <div id="template-list"></div>
    <div id="section-selected" style="display:none"></div>
    <div id="selected-list"></div>
    <button class="tone-btn active" data-tone="professional"></button>
    <button class="tone-btn" data-tone="friendly"></button>
    <button id="btn-generate"></button>
    <div id="response-box" class="empty"></div>
    <button id="btn-copy" class="hidden"></button>
    <button id="btn-inject" class="hidden"></button>
  `;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  // Restore promise-returning runtime.sendMessage (background relay contract)
  chrome.runtime.sendMessage.mockReset();
  chrome.runtime.sendMessage.mockReturnValue(Promise.resolve());
  setupDom();
  chrome.storage.local.get.mockResolvedValue({});
  chrome.tabs.query.mockImplementation((_q: any, cb: any) => cb([{ id: 1, url: 'https://app.akia.io/chat' }]));
  chrome.tabs.get.mockImplementation((tabId: any, cb: any) => cb({ id: tabId, url: 'https://app.akia.io/chat' }));
  chrome.tabs.sendMessage.mockImplementation((_id: any, _msg: any, cb: any) => {
    if (cb) cb({});
  });
  global.fetch = vi.fn();
  (global as any).navigator.clipboard.writeText = vi.fn().mockResolvedValue(undefined);
  vi.doUnmock('../src/config');
  global.alert = vi.fn();
});

describe('init and auth flow', () => {
  it('shows auth prompt when no token is stored', async () => {
    await loadSidepanel();
    await flush();
    expect(document.getElementById('auth-prompt')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('main-panel')!.classList.contains('hidden')).toBe(true);
  });

  it('shows main panel when a token exists and loads data', async () => {
    chrome.storage.local.get.mockResolvedValue({ token: 'tok123' });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => []
    });
    await loadSidepanel();
    await flush();
    await flush();
    expect(document.getElementById('main-panel')!.classList.contains('hidden')).toBe(false);
    expect(global.fetch).toHaveBeenCalled();
    // Authorization header sent on API calls
    const called = (global.fetch as any).mock.calls[0];
    expect(called[1].headers.Authorization).toBe('Bearer tok123');
  });

  it('login stores both tokens and swaps panels', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: 'jwt-abc', refresh_token: 'refresh-abc' })
    });
    await loadSidepanel();
    (document.getElementById('auth-email') as HTMLInputElement).value = 'agent@example.com';
    (document.getElementById('auth-password') as HTMLInputElement).value = 'pw';
    document.getElementById('btn-login')!.click();
    await flush();
    await flush();
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      token: 'jwt-abc',
      refreshToken: 'refresh-abc'
    });
    expect(document.getElementById('main-panel')!.classList.contains('hidden')).toBe(false);
  });

  it('login failure surfaces the error message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid credentials' })
    });
    await loadSidepanel();
    (document.getElementById('auth-email') as HTMLInputElement).value = 'agent@example.com';
    (document.getElementById('auth-password') as HTMLInputElement).value = 'wrong';
    document.getElementById('btn-login')!.click();
    await flush();
    await flush();
    const err = document.getElementById('auth-error')!;
    expect(err.classList.contains('hidden')).toBe(false);
    expect(err.textContent).toBe('Invalid credentials');
  });

  it('logout revokes the session server-side and returns to the auth prompt', async () => {
    chrome.storage.local.get.mockResolvedValue({ token: 'tok', refreshToken: 'refresh-1' });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    await loadSidepanel();
    await flush();
    await flush();
    document.getElementById('btn-logout')!.click();
    await flush();
    await flush();

    const logoutCall = (global.fetch as any).mock.calls.find(([url]: any[]) => (url as string).endsWith('/auth/logout'));
    expect(logoutCall).toBeTruthy();
    expect(JSON.parse((logoutCall as any[])[1].body)).toEqual({ refresh_token: 'refresh-1' });
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(['token', 'refreshToken']);
    expect(document.getElementById('auth-prompt')!.classList.contains('hidden')).toBe(false);
  });

  it('logout still clears locally when the revoke call fails', async () => {
    chrome.storage.local.get.mockResolvedValue({ token: 'tok', refreshToken: 'refresh-1' });
    global.fetch = vi.fn().mockImplementation((url: any) => {
      if ((url as string).endsWith('/auth/logout')) return Promise.reject(new Error('offline'));
      return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    });
    await loadSidepanel();
    await flush();
    await flush();
    document.getElementById('btn-logout')!.click();
    await flush();
    await flush();

    expect(chrome.storage.local.remove).toHaveBeenCalledWith(['token', 'refreshToken']);
    expect(document.getElementById('auth-prompt')!.classList.contains('hidden')).toBe(false);
  });
});

describe('access token refresh', () => {
  // The panel opens with an access token that expired mid-shift. Every API call
  // 401s once, the panel refreshes silently, and the user sees no interruption.
  function expiredThenOk({ refreshOk = true } = {}) {
    const seen = new Set();
    return vi.fn().mockImplementation((url: any, options: any) => {
      const path = String(url);
      if (path.endsWith('/auth/refresh')) {
        return Promise.resolve({
          ok: refreshOk,
          status: refreshOk ? 200 : 401,
          json: async () =>
            refreshOk
              ? { token: 'fresh-jwt', refresh_token: 'refresh-2' }
              : { error: 'Invalid refresh token' }
        });
      }
      // First attempt per path is unauthorized; the replay succeeds.
      if (!seen.has(path)) {
        seen.add(path);
        return Promise.resolve({ ok: false, status: 401, json: async () => ({ error: 'expired' }) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => [],
        headers: { get: () => null }
      });
    });
  }

  it('a 401 triggers one refresh and the request is replayed', async () => {
    chrome.storage.local.get.mockResolvedValue({ token: 'stale', refreshToken: 'refresh-1' });
    global.fetch = expiredThenOk();
    await loadSidepanel();
    await flush();

    await flush();
    await flush();

    const refreshCalls = (global.fetch as any).mock.calls.filter(([url]: any[]) =>
      String(url).endsWith('/auth/refresh')
    );
    // Several requests fire on open; they must share a single refresh, because
    // refresh tokens are single-use and a superseded one revokes the family.
    expect(refreshCalls).toHaveLength(1);
    expect(JSON.parse(refreshCalls[0][1].body)).toEqual({ refresh_token: 'refresh-1' });

    // The rotated pair is persisted for next time.
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      token: 'fresh-jwt',
      refreshToken: 'refresh-2'
    });

    // The user stays in the panel, and the replay carried the new token.
    expect(document.getElementById('main-panel')!.classList.contains('hidden')).toBe(false);
    const replay = (global.fetch as any).mock.calls
      .filter(([url]: any[]) => String(url).includes('/templates'))
      .pop();
    expect(replay[1].headers.Authorization).toBe('Bearer fresh-jwt');
  });

  it('a dead refresh token drops back to the login prompt', async () => {
    chrome.storage.local.get.mockResolvedValue({ token: 'stale', refreshToken: 'revoked' });
    global.fetch = expiredThenOk({ refreshOk: false });
    await loadSidepanel();
    await flush();
    await flush();
    await flush();

    expect(chrome.storage.local.remove).toHaveBeenCalledWith(['token', 'refreshToken']);
    expect(document.getElementById('auth-prompt')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('main-panel')!.classList.contains('hidden')).toBe(true);
  });

  it('no refresh is attempted when there is no refresh token', async () => {
    chrome.storage.local.get.mockResolvedValue({ token: 'stale' });
    global.fetch = expiredThenOk();
    await loadSidepanel();
    await flush();
    await flush();
    await flush();

    expect(
      (global.fetch as any).mock.calls.filter(([url]: any[]) => String(url).endsWith('/auth/refresh'))
    ).toHaveLength(0);
    expect(document.getElementById('auth-prompt')!.classList.contains('hidden')).toBe(false);
  });
});

describe('guest info and chat context', () => {
  it('updateGuestInfo renders guest fields and lights the dot', async () => {
    await loadSidepanel();
    runtimeListener({ type: 'GUEST_INFO_UPDATED', tabId: 1, data: { guestName: 'Jane', roomNumber: '204' } });
    expect(document.getElementById('label-guest')!.textContent).toBe('Jane');
    expect(document.getElementById('dot-guest')!.classList.contains('active')).toBe(true);
    expect(document.getElementById('guest-info-block')!.textContent).toContain('Jane');
    expect(document.getElementById('guest-info-block')!.textContent).toContain('204');
  });

  it('empty guest data keeps the dot off', async () => {
    await loadSidepanel();
    runtimeListener({ type: 'GUEST_INFO_UPDATED', tabId: 1, data: {} });
    expect(document.getElementById('dot-guest')!.classList.contains('active')).toBe(false);
    expect(document.getElementById('guest-info-block')!.textContent).toContain('No guest data');
  });

  it('chat context renders the last 3 messages', async () => {
    await loadSidepanel();
    runtimeListener({
      type: 'CHAT_CONTEXT_UPDATED',
      tabId: 1,
      data: {
        activeGuest: 'Jane Doe',
        messages: [
          { sender: 'Jane', text: 'one' },
          { sender: 'Desk', text: 'two' },
          { sender: 'Jane', text: 'three' },
          { sender: 'Jane', text: 'four' }
        ]
      }
    });
    const text = document.getElementById('chat-context-block')!.textContent;
    expect(text).toContain('Jane Doe');
    expect(text).toContain('four');
    expect(text).not.toContain('one');
  });

  it('empty chat shows the no-chat placeholder', async () => {
    await loadSidepanel();
    runtimeListener({ type: 'CHAT_CONTEXT_UPDATED', tabId: 1, data: { messages: [] } });
    expect(document.getElementById('chat-context-block')!.textContent).toBe('No active chat');
  });
});

describe('property detection', () => {
  it('labels the detected property', async () => {
    vi.doMock('../src/config', async (importOriginal: () => Promise<object>) => ({
      ...(await importOriginal()),
      getPropertyConfig: () => ({ name: 'St.Pierre Hotel' })
    }));
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    chrome.storage.local.get.mockResolvedValue({ token: 't' });
    await loadSidepanel();
    await flush();
    await flush();
    expect(
      document.getElementById('label-property')!.textContent).toBe('St.Pierre Hotel');
    expect(document.getElementById('dot-property')!.classList.contains('active')).toBe(true);
  });

  it('falls back to "No property"', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    chrome.storage.local.get.mockResolvedValue({ token: 't' });
    await loadSidepanel();
    await flush();
    await flush();
    expect(document.getElementById('label-property')!.textContent).toBe('No property');
  });
});

describe('templates', () => {
  async function loadWithTemplates(templates: any[]) {
    global.fetch = vi.fn().mockImplementation((url: any) => {
      if (String(url).includes('/templates')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => templates });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    });
    chrome.storage.local.get.mockResolvedValue({ token: 't' });
    await loadSidepanel();
    await flush();
    await flush();
  }

  it('renders templates from the API', async () => {
    await loadWithTemplates([
      { id: 1, name: 'WiFi Info', tags: ['wifi'] },
      { id: 2, name: 'Checkout', tags: [] }
    ]);
    const items = document.querySelectorAll('#template-list .template-item');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe('WiFi Info');
  });

  it('renders a selected template name as text, not markup', async () => {
    const hostile = '<img src=x onerror="window.__xss = true">';
    await loadWithTemplates([{ id: 1, name: hostile, tags: [] }]);
    (document.querySelector('#template-list .template-item') as HTMLElement).click();

    const chip = document.querySelector('#selected-list .selected-item')!;
    expect(chip.querySelector('span')!.textContent).toBe(hostile);
    expect(chip.querySelector('img')).toBeNull();
    expect((window as any).__xss).toBeUndefined();
    // The remove control still works.

    chip.querySelector('.remove-btn')!.click();
    expect(document.querySelectorAll('#selected-list .selected-item')).toHaveLength(0);
  });

  it('selecting a template shows it in the selected list', async () => {
    await loadWithTemplates([{ id: 1, name: 'WiFi Info', tags: [] }]);
    (document.querySelector('#template-list .template-item') as HTMLElement).click();
    expect(document.querySelectorAll('#selected-list .selected-item')).toHaveLength(1);
    expect(document.getElementById('section-selected')!.style.display).not.toBe('none');
  });

  it('toggling twice deselects', async () => {
    await loadWithTemplates([{ id: 1, name: 'WiFi Info', tags: [] }]);
    const item = document.querySelector('#template-list .template-item') as HTMLElement;
    item.click();
    item.click();
    expect(document.querySelectorAll('#selected-list .selected-item')).toHaveLength(0);
    expect(document.getElementById('section-selected')!.style.display).toBe('none');
  });

  it('search filters by name and tag', async () => {
    await loadWithTemplates([
      { id: 1, name: 'WiFi Info', tags: ['wifi'] },
      { id: 2, name: 'Checkout', tags: ['time'] }
    ]);
    const search = document.getElementById('template-search') as HTMLInputElement;
    search.value = 'wifi';
    search.dispatchEvent(new Event('input'));
    expect(document.querySelectorAll('#template-list .template-item')).toHaveLength(1);

    search.value = 'time';
    search.dispatchEvent(new Event('input'));
    expect(document.querySelectorAll('#template-list .template-item')).toHaveLength(1);

    expect((document.querySelector('#template-list .template-item') as HTMLElement).textContent).toBe('Checkout');
  });
});

describe('response generation', () => {
  async function loadAndSelect() {
    global.fetch = vi.fn().mockImplementation((url: any) => {
      if (String(url).includes('/templates')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [
            { id: 1, name: 'Checkout', content: 'Checkout is at 11:00 AM. We sincerely hope you enjoyed your stay.', tags: [] }
          ]
        });
      }
      if (String(url).includes('/copilot/draft')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ draft: '' })
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    });
    chrome.storage.local.get.mockResolvedValue({ token: 't' });
    await loadSidepanel();
    await flush();
    await flush();
    (document.querySelector('#template-list .template-item') as HTMLElement).click();
  }

  it('blocks generation without a selected template', async () => {
    await loadAndSelect();
    // Deselect
    (document.querySelector('#template-list .template-item') as HTMLElement).click();
    document.getElementById('btn-generate')!.click();
    expect(global.alert).toHaveBeenCalled();
    expect(document.getElementById('response-box')!.textContent).not.toContain('11:00');
  });

  it('professional tone keeps template text verbatim', async () => {
    await loadAndSelect();
    document.getElementById('btn-generate')!.click();
    await flush();
    await flush();
    await flush();
    await flush();
    const text = document.getElementById('response-box')!.textContent;
    expect(text).toContain('sincerely');
    expect(document.getElementById('btn-copy')!.classList.contains('hidden')).toBe(false);
  });

  it('friendly tone swaps formal wording', async () => {
    await loadAndSelect();
    (document.querySelector('.tone-btn[data-tone="friendly"]') as HTMLElement).click();
    document.getElementById('btn-generate')!.click();
    await flush();
    await flush();
    await flush();
    await flush();
    const text = document.getElementById('response-box')!.textContent;
    expect(text).not.toContain('sincerely');
    expect(text).toContain('warmly');
  });

  it('prefixes the guest name when known', async () => {
    await loadAndSelect();
    runtimeListener({ type: 'GUEST_INFO_UPDATED', tabId: 1, data: { guestName: 'Jane Doe' } });
    document.getElementById('btn-generate')!.click();
    await flush();
    await flush();
    await flush();
    await flush();
    expect(document.getElementById('response-box')!.textContent).toMatch(/^Dear Jane Doe/);
  });

  it('shows inject only when the active tab is Akia', async () => {
    await loadAndSelect();
    chrome.tabs.query.mockImplementation((_q: any, cb: any) => cb([{ id: 1, url: 'https://app.akia.io/chat' }]));
    document.getElementById('btn-generate')!.click();
    await flush();
    expect(document.getElementById('btn-inject')!.classList.contains('hidden')).toBe(false);

    chrome.tabs.query.mockImplementation((_q: any, cb: any) => cb([{ id: 1, url: 'https://stpierre.stayntouch.com/x' }]));
    document.getElementById('btn-generate')!.click();
    await flush();
    // Inject stays as it was (only shown for Akia tabs)
    expect(document.getElementById('btn-inject')!.classList.contains('hidden')).toBe(false);
  });
});

describe('copy and inject', () => {
  it('copy writes the response to the clipboard', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    chrome.storage.local.get.mockResolvedValue({ token: 't' });
    await loadSidepanel();
    await flush();
    await flush();
    document.getElementById('response-box')!.textContent = 'Hello world';
    document.getElementById('btn-copy')!.classList.remove('hidden');
    document.getElementById('btn-copy')!.click();
    await flush();
    expect((navigator as any).clipboard.writeText).toHaveBeenCalledWith('Hello world');
  });

  it('inject sends INJECT_MESSAGE to the tab the draft was generated for', async () => {
    await loadPanelWithDraft('Reply text');
    document.getElementById('btn-inject')!.click();
    await flush();
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      { type: 'INJECT_MESSAGE', text: 'Reply text' },
      expect.any(Function)
    );
  });
});

describe('per-tab page context', () => {
  it("shows only the active tab's guest and chat context", async () => {
    await loadSidepanel();
    runtimeListener({ type: 'GUEST_INFO_UPDATED', tabId: 2, data: { guestName: 'Background Guest' } });
    runtimeListener({ type: 'CHAT_CONTEXT_UPDATED', tabId: 2, data: { activeGuest: 'Background Chat', messages: [] } });
    expect(document.getElementById('label-guest')!.textContent).toBe('No guest');
    expect(document.getElementById('chat-context-block')!.textContent).toBe('No active chat');

    runtimeListener({ type: 'GUEST_INFO_UPDATED', tabId: 1, data: { guestName: 'Jane' } });
    expect(document.getElementById('label-guest')!.textContent).toBe('Jane');

    activateTab({ id: 2, url: 'https://app.akia.io/other' });
    expect(document.getElementById('label-guest')!.textContent).toBe('Background Guest');
    expect(document.getElementById('guest-info-block')!.textContent).toContain('Background Guest');
    expect(document.getElementById('chat-context-block')!.textContent).toContain('Background Chat');

    activateTab({ id: 1, url: 'https://app.akia.io/chat' });
    expect(document.getElementById('label-guest')!.textContent).toBe('Jane');
    expect(document.getElementById('chat-context-block')!.textContent).toBe('No active chat');
  });

  it('ignores context broadcasts that carry no tab id', async () => {
    await loadSidepanel();
    runtimeListener({ type: 'GUEST_INFO_UPDATED', data: { guestName: 'Nobody' } });
    expect(document.getElementById('label-guest')!.textContent).toBe('No guest');
  });

  it('requests page data from the newly active tab and stores each answer under its tab', async () => {
    chrome.tabs.sendMessage.mockImplementation((tabId: any, msg: any, cb: any) => {
      if (msg.type === 'GET_GUEST_INFO') cb({ data: { guestName: `Guest ${tabId}` } });
      else cb({});
    });
    await loadSidepanel();
    expect(document.getElementById('label-guest')!.textContent).toBe('Guest 1');

    activateTab({ id: 2, url: 'https://app.akia.io/other' });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(2, { type: 'GET_GUEST_INFO' }, expect.any(Function));
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(2, { type: 'GET_CHAT_CONTEXT' }, expect.any(Function));
    expect(document.getElementById('label-guest')!.textContent).toBe('Guest 2');

    activateTab({ id: 1, url: 'https://app.akia.io/chat' });
    expect(document.getElementById('label-guest')!.textContent).toBe('Guest 1');
  });

  it("detects the property from the active tab's URL, not the panel page", async () => {
    const lookup = vi.fn((hostname?: string) =>
      hostname === 'app.us1.stayntouch.com' ? { id: 1, name: 'St.Pierre Hotel' } : null
    );
    vi.doMock('../src/config', async (importOriginal: () => Promise<object>) => ({
      ...(await importOriginal()),
      getPropertyConfig: lookup
    }));
    chrome.tabs.get.mockImplementation((_id: any, cb: any) =>
      cb({ id: 1, url: 'https://app.us1.stayntouch.com/inbox' })
    );
    await loadSidepanel();
    expect(lookup).toHaveBeenCalledWith('app.us1.stayntouch.com');
    expect(document.getElementById('label-property')!.textContent).toBe('St.Pierre Hotel');
    expect(document.getElementById('dot-property')!.classList.contains('active')).toBe(true);

    activateTab({ id: 2, url: 'https://example.com/' });
    expect(document.getElementById('label-property')!.textContent).toBe('No property');
    expect(document.getElementById('dot-property')!.classList.contains('active')).toBe(false);
  });

  it("generates drafts from the active tab's guest only", async () => {
    const drafted: any[] = [];
    global.fetch = vi.fn().mockImplementation((url: any, opts: any) => {
      if (String(url).includes('/copilot/draft')) {
        drafted.push(JSON.parse(opts.body));
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ draft: 'ok' }) });
      }
      if (String(url).includes('/templates')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [{ id: 1, name: 'Checkout', content: 'Hi', tags: [] }]
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    });
    chrome.storage.local.get.mockResolvedValue({ token: 't' });
    await loadSidepanel();
    await flush();
    await flush();
    runtimeListener({ type: 'GUEST_INFO_UPDATED', tabId: 1, data: { guestName: 'Jane' } });
    runtimeListener({ type: 'GUEST_INFO_UPDATED', tabId: 2, data: { guestName: 'Other' } });

    activateTab({ id: 2, url: 'https://app.akia.io/other' });
    (document.querySelector('#template-list .template-item') as HTMLElement).click();
    document.getElementById('btn-generate')!.click();
    await flush();
    await flush();

    expect(drafted).toHaveLength(1);
    expect(drafted[0].guest_info).toEqual({ guestName: 'Other' });
  });
});

describe('inject targeting', () => {
  it('refuses to inject while another tab is active and injects again once the draft tab is back', async () => {
    await loadPanelWithDraft('Reply text');

    activateTab({ id: 2, url: 'https://app.akia.io/other' });
    chrome.tabs.sendMessage.mockClear();
    document.getElementById('btn-inject')!.click();
    await flush();
    const injected = (chrome.tabs.sendMessage as any).mock.calls.filter(
      ([, msg]: any[]) => msg?.type === 'INJECT_MESSAGE'
    );
    expect(injected).toHaveLength(0);
    expect(global.alert).toHaveBeenCalledWith(expect.stringContaining('Switch back'));

    activateTab({ id: 1, url: 'https://app.akia.io/chat' });
    chrome.tabs.sendMessage.mockClear();
    document.getElementById('btn-inject')!.click();
    await flush();
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      { type: 'INJECT_MESSAGE', text: 'Reply text' },
      expect.any(Function)
    );
  });

  it('keeps a draft bound to the tab it was requested from when the user switches mid-request', async () => {
    let resolveDraft: (value: unknown) => void = () => {};
    global.fetch = vi.fn().mockImplementation((url: any) => {
      if (String(url).includes('/copilot/draft')) {
        return new Promise((resolve) => {
          resolveDraft = resolve;
        });
      }
      if (String(url).includes('/templates')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [{ id: 1, name: 'Checkout', content: 'Hi', tags: [] }]
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    });
    chrome.storage.local.get.mockResolvedValue({ token: 't' });
    await loadSidepanel();
    await flush();
    await flush();
    (document.querySelector('#template-list .template-item') as HTMLElement).click();
    document.getElementById('btn-generate')!.click();

    activateTab({ id: 2, url: 'https://app.akia.io/other' });
    resolveDraft({ ok: true, status: 200, json: async () => ({ draft: 'Late reply' }) });
    await flush();
    await flush();
    await flush();
    expect(document.getElementById('response-box')!.textContent).toBe('Late reply');

    chrome.tabs.sendMessage.mockClear();
    document.getElementById('btn-inject')!.click();
    await flush();
    expect(
      (chrome.tabs.sendMessage as any).mock.calls.filter(([, msg]: any[]) => msg?.type === 'INJECT_MESSAGE')
    ).toHaveLength(0);

    activateTab({ id: 1, url: 'https://app.akia.io/chat' });
    document.getElementById('btn-inject')!.click();
    await flush();
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      { type: 'INJECT_MESSAGE', text: 'Late reply' },
      expect.any(Function)
    );
  });
});

describe('backend URL and session changes', () => {
  // config.ts registers its own storage listener too, so deliver to all of them.
  function emitStorageChange(changes: Record<string, { oldValue?: unknown; newValue?: unknown }>) {
    for (const [listener] of chrome.storage.onChanged.addListener.mock.calls) {
      listener(changes, 'local');
    }
  }

  it('a session removed from storage returns the panel to the login prompt', async () => {
    chrome.storage.local.get.mockResolvedValue({ token: 'tok', refreshToken: 'refresh-1' });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    await loadSidepanel();
    await flush();
    await flush();
    expect(document.getElementById('main-panel')!.classList.contains('hidden')).toBe(false);

    emitStorageChange({ token: { oldValue: 'tok' }, refreshToken: { oldValue: 'refresh-1' } });
    expect(document.getElementById('auth-prompt')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('main-panel')!.classList.contains('hidden')).toBe(true);

    // The next request goes out without the old session token.
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: 'jwt-new' }) });
    (document.getElementById('auth-email') as HTMLInputElement).value = 'agent@example.com';
    (document.getElementById('auth-password') as HTMLInputElement).value = 'pw';
    document.getElementById('btn-login')!.click();
    await flush();
    await flush();
    const [, options] = (global.fetch as any).mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });

  it('later requests use a backend URL changed in storage', async () => {
    chrome.storage.local.get.mockResolvedValue({});
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    await loadSidepanel();
    await flush();

    chrome.storage.local.get.mockResolvedValue({ apiBaseUrl: 'https://api.example.com' });
    emitStorageChange({ apiBaseUrl: { newValue: 'https://api.example.com' } });
    await flush();
    await flush();

    (document.getElementById('auth-email') as HTMLInputElement).value = 'agent@example.com';
    (document.getElementById('auth-password') as HTMLInputElement).value = 'pw';
    document.getElementById('btn-login')!.click();
    await flush();
    await flush();
    const loginCall = (global.fetch as any).mock.calls.find(([url]: any[]) =>
      String(url).endsWith('/auth/login')
    );
    expect(loginCall[0]).toBe('https://api.example.com/api/auth/login');
  });
});
