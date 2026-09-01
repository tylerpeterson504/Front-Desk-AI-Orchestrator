// Sidepanel logic tests for the Front Desk AI extension.
//
// sidepanel.js wires DOM listeners and chrome.* APIs at import time, so each
// test sets up a fixture DOM, loads the module with jest.isolateModules, and
// drives behavior through the mocked chrome APIs and DOM events.

// Keep track of the module's registered runtime listener.
let runtimeListener = null;

function loadSidepanel() {
  jest.isolateModules(() => {
    require('../src/sidepanel.js');
  });
  runtimeListener = chrome.runtime.onMessage.addListener.mock.calls[0]?.[0] || null;
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
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
  jest.resetModules();
  jest.clearAllMocks();
  // Restore promise-returning runtime.sendMessage (background relay contract)
  chrome.runtime.sendMessage.mockReset();
  chrome.runtime.sendMessage.mockReturnValue(Promise.resolve());
  setupDom();
  chrome.storage.local.get.mockResolvedValue({});
  chrome.tabs.query.mockImplementation((_q, cb) => cb([{ id: 1, url: 'https://app.akia.io/chat' }]));
  chrome.tabs.sendMessage.mockImplementation((_id, _msg, cb) => {
    if (cb) cb({});
  });
  global.fetch = jest.fn();
  global.navigator.clipboard.writeText = jest.fn().mockResolvedValue(undefined);
  global.getPropertyConfig = undefined;
  global.alert = jest.fn();
});

describe('init and auth flow', () => {
  test('shows auth prompt when no token is stored', async () => {
    loadSidepanel();
    await flush();
    expect(document.getElementById('auth-prompt').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('main-panel').classList.contains('hidden')).toBe(true);
  });

  test('shows main panel when a token exists and loads data', async () => {
    chrome.storage.local.get.mockResolvedValue({ token: 'tok123' });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => []
    });
    loadSidepanel();
    await flush();
    await flush();
    expect(document.getElementById('main-panel').classList.contains('hidden')).toBe(false);
    expect(global.fetch).toHaveBeenCalled();
    // Authorization header sent on API calls
    const called = global.fetch.mock.calls[0];
    expect(called[1].headers.Authorization).toBe('Bearer tok123');
  });

  test('login stores both tokens and swaps panels', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: 'jwt-abc', refresh_token: 'refresh-abc' })
    });
    loadSidepanel();
    document.getElementById('auth-email').value = 'agent@example.com';
    document.getElementById('auth-password').value = 'pw';
    document.getElementById('btn-login').click();
    await flush();
    await flush();
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      token: 'jwt-abc',
      refreshToken: 'refresh-abc'
    });
    expect(document.getElementById('main-panel').classList.contains('hidden')).toBe(false);
  });

  test('login failure surfaces the error message', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid credentials' })
    });
    loadSidepanel();
    document.getElementById('auth-email').value = 'agent@example.com';
    document.getElementById('auth-password').value = 'wrong';
    document.getElementById('btn-login').click();
    await flush();
    await flush();
    const err = document.getElementById('auth-error');
    expect(err.classList.contains('hidden')).toBe(false);
    expect(err.textContent).toBe('Invalid credentials');
  });

  test('logout revokes the session server-side and returns to the auth prompt', async () => {
    chrome.storage.local.get.mockResolvedValue({ token: 'tok', refreshToken: 'refresh-1' });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    loadSidepanel();
    await flush();
    await flush();
    document.getElementById('btn-logout').click();
    await flush();
    await flush();

    const logoutCall = global.fetch.mock.calls.find(([url]) => url.endsWith('/auth/logout'));
    expect(logoutCall).toBeTruthy();
    expect(JSON.parse(logoutCall[1].body)).toEqual({ refresh_token: 'refresh-1' });
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(['token', 'refreshToken']);
    expect(document.getElementById('auth-prompt').classList.contains('hidden')).toBe(false);
  });

  test('logout still clears locally when the revoke call fails', async () => {
    chrome.storage.local.get.mockResolvedValue({ token: 'tok', refreshToken: 'refresh-1' });
    global.fetch = jest.fn().mockImplementation((url) => {
      if (String(url).endsWith('/auth/logout')) return Promise.reject(new Error('offline'));
      return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    });
    loadSidepanel();
    await flush();
    await flush();
    document.getElementById('btn-logout').click();
    await flush();
    await flush();

    expect(chrome.storage.local.remove).toHaveBeenCalledWith(['token', 'refreshToken']);
    expect(document.getElementById('auth-prompt').classList.contains('hidden')).toBe(false);
  });
});

describe('access token refresh', () => {
  // The panel opens with an access token that expired mid-shift. Every API call
  // 401s once, the panel refreshes silently, and the user sees no interruption.
  function expiredThenOk({ refreshOk = true } = {}) {
    const seen = new Set();
    return jest.fn().mockImplementation((url, options) => {
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

  test('a 401 triggers one refresh and the request is replayed', async () => {
    chrome.storage.local.get.mockResolvedValue({ token: 'stale', refreshToken: 'refresh-1' });
    global.fetch = expiredThenOk();
    loadSidepanel();
    await flush();
    await flush();
    await flush();

    const refreshCalls = global.fetch.mock.calls.filter(([url]) =>
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
    expect(document.getElementById('main-panel').classList.contains('hidden')).toBe(false);
    const replay = global.fetch.mock.calls
      .filter(([url]) => String(url).includes('/templates'))
      .pop();
    expect(replay[1].headers.Authorization).toBe('Bearer fresh-jwt');
  });

  test('a dead refresh token drops back to the login prompt', async () => {
    chrome.storage.local.get.mockResolvedValue({ token: 'stale', refreshToken: 'revoked' });
    global.fetch = expiredThenOk({ refreshOk: false });
    loadSidepanel();
    await flush();
    await flush();
    await flush();

    expect(chrome.storage.local.remove).toHaveBeenCalledWith(['token', 'refreshToken']);
    expect(document.getElementById('auth-prompt').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('main-panel').classList.contains('hidden')).toBe(true);
  });

  test('no refresh is attempted when there is no refresh token', async () => {
    chrome.storage.local.get.mockResolvedValue({ token: 'stale' });
    global.fetch = expiredThenOk();
    loadSidepanel();
    await flush();
    await flush();
    await flush();

    expect(
      global.fetch.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))
    ).toHaveLength(0);
    expect(document.getElementById('auth-prompt').classList.contains('hidden')).toBe(false);
  });
});

describe('guest info and chat context', () => {
  test('updateGuestInfo renders guest fields and lights the dot', async () => {
    loadSidepanel();
    runtimeListener({ type: 'GUEST_INFO_UPDATED', data: { guestName: 'Jane', roomNumber: '204' } });
    expect(document.getElementById('label-guest').textContent).toBe('Jane');
    expect(document.getElementById('dot-guest').classList.contains('active')).toBe(true);
    expect(document.getElementById('guest-info-block').textContent).toContain('Jane');
    expect(document.getElementById('guest-info-block').textContent).toContain('204');
  });

  test('empty guest data keeps the dot off', async () => {
    loadSidepanel();
    runtimeListener({ type: 'GUEST_INFO_UPDATED', data: {} });
    expect(document.getElementById('dot-guest').classList.contains('active')).toBe(false);
    expect(document.getElementById('guest-info-block').textContent).toContain('No guest data');
  });

  test('chat context renders the last 3 messages', async () => {
    loadSidepanel();
    runtimeListener({
      type: 'CHAT_CONTEXT_UPDATED',
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
    const text = document.getElementById('chat-context-block').textContent;
    expect(text).toContain('Jane Doe');
    expect(text).toContain('four');
    expect(text).not.toContain('one');
  });

  test('empty chat shows the no-chat placeholder', async () => {
    loadSidepanel();
    runtimeListener({ type: 'CHAT_CONTEXT_UPDATED', data: { messages: [] } });
    expect(document.getElementById('chat-context-block').textContent).toBe('No active chat');
  });
});

describe('property detection', () => {
  test('labels the detected property', async () => {
    global.getPropertyConfig = () => ({ name: 'St.Pierre Hotel' });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    chrome.storage.local.get.mockResolvedValue({ token: 't' });
    loadSidepanel();
    await flush();
    await flush();
    expect(document.getElementById('label-property').textContent).toBe('St.Pierre Hotel');
    expect(document.getElementById('dot-property').classList.contains('active')).toBe(true);
  });

  test('falls back to "No property"', async () => {
    global.getPropertyConfig = () => null;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    chrome.storage.local.get.mockResolvedValue({ token: 't' });
    loadSidepanel();
    await flush();
    await flush();
    expect(document.getElementById('label-property').textContent).toBe('No property');
  });
});

describe('templates', () => {
  async function loadWithTemplates(templates) {
    global.fetch = jest.fn().mockImplementation((url) => {
      if (String(url).includes('/templates')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => templates });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    });
    chrome.storage.local.get.mockResolvedValue({ token: 't' });
    loadSidepanel();
    await flush();
    await flush();
  }

  test('renders templates from the API', async () => {
    await loadWithTemplates([
      { id: 1, name: 'WiFi Info', tags: ['wifi'] },
      { id: 2, name: 'Checkout', tags: [] }
    ]);
    const items = document.querySelectorAll('#template-list .template-item');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe('WiFi Info');
  });

  test('renders a selected template name as text, not markup', async () => {
    const hostile = '<img src=x onerror="window.__xss = true">';
    await loadWithTemplates([{ id: 1, name: hostile, tags: [] }]);
    document.querySelector('#template-list .template-item').click();

    const chip = document.querySelector('#selected-list .selected-item');
    expect(chip.querySelector('span').textContent).toBe(hostile);
    expect(chip.querySelector('img')).toBeNull();
    expect(window.__xss).toBeUndefined();
    // The remove control still works.
    chip.querySelector('.remove-btn').click();
    expect(document.querySelectorAll('#selected-list .selected-item')).toHaveLength(0);
  });

  test('selecting a template shows it in the selected list', async () => {
    await loadWithTemplates([{ id: 1, name: 'WiFi Info', tags: [] }]);
    document.querySelector('#template-list .template-item').click();
    expect(document.querySelectorAll('#selected-list .selected-item')).toHaveLength(1);
    expect(document.getElementById('section-selected').style.display).not.toBe('none');
  });

  test('toggling twice deselects', async () => {
    await loadWithTemplates([{ id: 1, name: 'WiFi Info', tags: [] }]);
    const item = document.querySelector('#template-list .template-item');
    item.click();
    item.click();
    expect(document.querySelectorAll('#selected-list .selected-item')).toHaveLength(0);
    expect(document.getElementById('section-selected').style.display).toBe('none');
  });

  test('search filters by name and tag', async () => {
    await loadWithTemplates([
      { id: 1, name: 'WiFi Info', tags: ['wifi'] },
      { id: 2, name: 'Checkout', tags: ['time'] }
    ]);
    const search = document.getElementById('template-search');
    search.value = 'wifi';
    search.dispatchEvent(new Event('input'));
    expect(document.querySelectorAll('#template-list .template-item')).toHaveLength(1);

    search.value = 'time';
    search.dispatchEvent(new Event('input'));
    expect(document.querySelectorAll('#template-list .template-item')).toHaveLength(1);
    expect(document.querySelector('#template-list .template-item').textContent).toBe('Checkout');
  });
});

describe('response generation', () => {
  async function loadAndSelect() {
    global.fetch = jest.fn().mockImplementation((url) => {
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
          json: async () => ({ draft: null })
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    });
    chrome.storage.local.get.mockResolvedValue({ token: 't' });
    loadSidepanel();
    await flush();
    await flush();
    document.querySelector('#template-list .template-item').click();
  }

  test('blocks generation without a selected template', async () => {
    await loadAndSelect();
    // Deselect
    document.querySelector('#template-list .template-item').click();
    document.getElementById('btn-generate').click();
    expect(global.alert).toHaveBeenCalled();
    expect(document.getElementById('response-box').textContent).not.toContain('11:00');
  });

  test('professional tone keeps template text verbatim', async () => {
    await loadAndSelect();
    document.getElementById('btn-generate').click();
    await flush();
    await flush();
    const text = document.getElementById('response-box').textContent;
    expect(text).toContain('sincerely');
    expect(document.getElementById('btn-copy').classList.contains('hidden')).toBe(false);
  });

  test('friendly tone swaps formal wording', async () => {
    await loadAndSelect();
    document.querySelector('.tone-btn[data-tone="friendly"]').click();
    document.getElementById('btn-generate').click();
    await flush();
    await flush();
    const text = document.getElementById('response-box').textContent;
    expect(text).not.toContain('sincerely');
    expect(text).toContain('warmly');
  });

  test('prefixes the guest name when known', async () => {
    await loadAndSelect();
    runtimeListener({ type: 'GUEST_INFO_UPDATED', data: { guestName: 'Jane Doe' } });
    document.getElementById('btn-generate').click();
    await flush();
    await flush();
    expect(document.getElementById('response-box').textContent).toMatch(/^Dear Jane Doe/);
  });

  test('shows inject only when the active tab is Akia', async () => {
    await loadAndSelect();
    chrome.tabs.query.mockImplementation((_q, cb) => cb([{ id: 1, url: 'https://app.akia.io/chat' }]));
    document.getElementById('btn-generate').click();
    await flush();
    expect(document.getElementById('btn-inject').classList.contains('hidden')).toBe(false);

    chrome.tabs.query.mockImplementation((_q, cb) => cb([{ id: 1, url: 'https://stpierre.stayntouch.com/x' }]));
    document.getElementById('btn-generate').click();
    await flush();
    // Inject stays as it was (only shown for Akia tabs)
    expect(document.getElementById('btn-inject').classList.contains('hidden')).toBe(false);
  });
});

describe('copy and inject', () => {
  test('copy writes the response to the clipboard', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    chrome.storage.local.get.mockResolvedValue({ token: 't' });
    loadSidepanel();
    await flush();
    await flush();
    document.getElementById('response-box').textContent = 'Hello world';
    document.getElementById('btn-copy').classList.remove('hidden');
    document.getElementById('btn-copy').click();
    await flush();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Hello world');
  });

  test('inject sends INJECT_MESSAGE to the active tab', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    chrome.storage.local.get.mockResolvedValue({ token: 't' });
    loadSidepanel();
    await flush();
    await flush();
    document.getElementById('response-box').textContent = 'Reply text';
    document.getElementById('btn-inject').classList.remove('hidden');
    document.getElementById('btn-inject').click();
    await flush();
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      { type: 'INJECT_MESSAGE', text: 'Reply text' },
      expect.any(Function)
    );
  });
});
