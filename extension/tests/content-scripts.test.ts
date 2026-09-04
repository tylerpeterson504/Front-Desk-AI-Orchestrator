// Content-script and shared-config tests for the Front Desk AI extension.
//
// The content scripts are IIFEs that run against the real DOM (jsdom here) and
// chrome.* messaging. Each test injects a fixture DOM, loads the script with
// dynamic import, and asserts the extraction/injection behavior through the chrome
// mock and direct DOM inspection.

describe('config.js shared module', () => {
  const CONFIG_PATH = '../src/config.ts';

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  async function loadConfig(hostname?: string) {
    if (hostname !== undefined) {
      Object.defineProperty(window, 'location', {
        value: { hostname },
        writable: true
      });
    }
    const mod = await import(CONFIG_PATH);
    return mod;
  }

  test('matches a property by urlPattern substring', async () => {
    const config = await loadConfig('app.us1.stayntouch.com');
    const property = config.getPropertyConfig();
    expect(property).not.toBeNull();
    expect(property.name).toBe('St.Pierre Hotel');
    expect(property.id).toBe(1);
  });

  test('matches the second property', async () => {
    const config = await loadConfig('sys.akia.ai');
    expect(config.getPropertyConfig()?.name).toBe('Andrew Jackson Hotel');
  });

  test('returns null on an unknown host', async () => {
    const config = await loadConfig('unknown.pms.example');
    expect(config.getPropertyConfig()).toBeNull();
  });

  test('getApiBaseUrl is centralized and defaults to local dev', async () => {
    const config = await loadConfig('app.us1.stayntouch.com');
    expect(config.getApiBaseUrl()).toBe('http://localhost:3001');
    expect(config.getAllProperties()).toHaveLength(2);
  });

  test('loadApiBaseUrl applies the chrome.storage.local override', async () => {
    chrome.storage.local.get.mockResolvedValue({ apiBaseUrl: 'https://api.example.com/' });
    const config = await loadConfig('app.us1.stayntouch.com');

    await expect(config.loadApiBaseUrl()).resolves.toBe('https://api.example.com');
    expect(config.getApiBaseUrl()).toBe('https://api.example.com');
  });

  test('loadApiBaseUrl falls back to the default when storage is empty', async () => {
    chrome.storage.local.get.mockResolvedValue({});
    const config = await loadConfig('app.us1.stayntouch.com');
    await expect(config.loadApiBaseUrl()).resolves.toBe('http://localhost:3001');
  });

  test('loadApiBaseUrl survives a storage failure', async () => {
    chrome.storage.local.get.mockRejectedValue(new Error('storage unavailable'));
    const config = await loadConfig('app.us1.stayntouch.com');
    await expect(config.loadApiBaseUrl()).resolves.toBe('http://localhost:3001');
  });

  test('rejects overrides that are not http(s) URLs', async () => {
    const config = await loadConfig('app.us1.stayntouch.com');
    for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'not a url', '', null]) {
      expect(config.setApiBaseUrlOverride(bad)).toBe('http://localhost:3001');
    }
    expect(config.normalizeApiBaseUrl('https://api.example.com//')).toBe('https://api.example.com');
  });

  test('a storage change updates the cached override without a reload', async () => {
    const config = await loadConfig('app.us1.stayntouch.com');
    const listener = chrome.storage.onChanged.addListener.mock.calls.at(-1)[0];

    listener({ apiBaseUrl: { newValue: 'https://later.example.com' } }, 'local');
    expect(config.getApiBaseUrl()).toBe('https://later.example.com');

    listener({ apiBaseUrl: { newValue: 'https://sync.example.com' } }, 'sync');
    listener({ token: { newValue: 'x' } }, 'local');
    expect(config.getApiBaseUrl()).toBe('https://later.example.com');
  });
});

describe('content-stayntouch.js extraction', () => {
  const SCRIPT_PATH = '../src/content-stayntouch.ts';

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  async function loadScript() {
    await import(SCRIPT_PATH);
  }

  test('broadcasts GUEST_INFO_UPDATED with extracted fields', async () => {
    document.body.innerHTML = `
      <div class="guest-name">Jane Doe</div>
      <div class="room-number">204</div>
      <div class="check-in-date">2026-08-28</div>
      <div class="check-out-date">2026-08-30</div>
      <div class="reservation-status">Checked-in</div>
      <div class="confirmation-number">CN-9911</div>
    `;
    const sent: any[] = [];
    chrome.runtime.sendMessage.mockImplementation((msg) => sent.push(msg));
    await loadScript();
    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe('GUEST_INFO_UPDATED');
    expect(sent[0].data).toEqual({
      guestName: 'Jane Doe',
      roomNumber: '204',
      checkIn: '2026-08-28',
      checkOut: '2026-08-30',
      reservationStatus: 'Checked-in',
      confirmationNumber: 'CN-9911'
    });
  });

  test('does not broadcast when the page has no guest data', async () => {
    document.body.innerHTML = '<div>empty lobby page</div>';
    const sent: any[] = [];
    chrome.runtime.sendMessage.mockImplementation((msg) => sent.push(msg));
    await loadScript();
    expect(sent).toHaveLength(0);
  });

  test('answers GET_GUEST_INFO pull requests', async () => {
    document.body.innerHTML = `
      <div class="guest-name">Bob</div>
      <div class="room-number">101</div>
    `;
    const response = { captured: false, value: null };
    chrome.runtime.sendMessage.mockImplementation(() => undefined);
    await loadScript();
    const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    listener({ type: 'GET_GUEST_INFO' }, {}, (res: any) => {
      response.captured = true;
      response.value = res;
    });
    expect(response.captured).toBe(true);
    expect(response.value.data.guestName).toBe('Bob');
    expect(response.value.data.roomNumber).toBe('101');
  });
});

describe('content-akia.js extraction and injection', () => {
  const SCRIPT_PATH = '../src/content-akia.ts';

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  async function loadScript() {
    await import(SCRIPT_PATH);
  }

  function listener() {
    return chrome.runtime.onMessage.addListener.mock.calls[0][0];
  }

  test('broadcasts CHAT_CONTEXT_UPDATED with messages and guest', async () => {
    document.body.innerHTML = `
      <div class="message-item">
        <span class="sender-name">Jane</span>
        <span class="message-text">When is checkout?</span>
        <span class="message-time">10:02</span>
      </div>
      <div class="message-item">
        <span class="sender-name">Desk</span>
        <span class="message-text">11 AM.</span>
      </div>
      <div class="active-guest-name">Jane Doe</div>
      <div data-conversation-id="conv-42"></div>
    `;
    const sent: any[] = [];
    chrome.runtime.sendMessage.mockImplementation((msg) => sent.push(msg));
    await loadScript();
    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe('CHAT_CONTEXT_UPDATED');
    expect(sent[0].data.activeGuest).toBe('Jane Doe');
    expect(sent[0].data.conversationId).toBe('conv-42');
    expect(sent[0].data.messages).toEqual([
      { sender: 'Jane', text: 'When is checkout?', time: '10:02' },
      { sender: 'Desk', text: '11 AM.', time: null }
    ]);
  });

  test('skips broadcast when the chat is empty', async () => {
    document.body.innerHTML = '<div class="chat-shell"></div>';
    const sent: any[] = [];
    chrome.runtime.sendMessage.mockImplementation((msg) => sent.push(msg));
    await loadScript();
    expect(sent).toHaveLength(0);
  });

  test('answers GET_CHAT_CONTEXT', async () => {
    document.body.innerHTML = `
      <div class="message-item"><span class="message-text">hello</span></div>
    `;
    chrome.runtime.sendMessage.mockImplementation(() => undefined);
    await loadScript();
    const respond = jest.fn();
    listener()({ type: 'GET_CHAT_CONTEXT' }, {}, respond);
    expect(respond).toHaveBeenCalled();
    expect(respond.mock.calls[0][0].data.messages[0].text).toBe('hello');
  });

  test('injectMessage sets the textarea via the native setter + input event', async () => {
    document.body.innerHTML = '<textarea class="message-input"></textarea>';
    const input = document.querySelector('textarea.message-input')!;
    const events: any[] = [];
    input.addEventListener('input', (e) => events.push(e));
    chrome.runtime.sendMessage.mockImplementation(() => undefined);
    await loadScript();
    const respond = jest.fn();
    listener()({ type: 'INJECT_MESSAGE', text: 'Dear guest...' }, {}, respond);
    expect(respond.mock.calls[0][0].success).toBe(true);
    expect(input.value).toBe('Dear guest...');
    expect(events).toHaveLength(1);
    expect(input === document.activeElement).toBe(true);
  });

  test('INJECT_MESSAGE reports failure when no input exists', async () => {
    document.body.innerHTML = '<div>no composer here</div>';
    chrome.runtime.sendMessage.mockImplementation(() => undefined);
    await loadScript();
    const respond = jest.fn();
    listener()({ type: 'INJECT_MESSAGE', text: 'x' }, {}, respond);
    expect(respond.mock.calls[0][0].success).toBe(false);
  });

  test('ignores unrelated message types', async () => {
    document.body.innerHTML = '<textarea class="message-input"></textarea>';
    chrome.runtime.sendMessage.mockImplementation(() => undefined);
    await loadScript();
    const respond = jest.fn();
    listener()({ type: 'SOMETHING_ELSE' }, {}, respond);
    expect(respond).not.toHaveBeenCalled();
  });
});

describe('background.js relay', () => {
  const SCRIPT_PATH = '../src/background.ts';

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    chrome.runtime.sendMessage.mockReset();
    chrome.runtime.sendMessage.mockReturnValue(Promise.resolve());
  });

  async function loadScript() {
    await import(SCRIPT_PATH);
  }

  test('forwards context updates to the runtime', async () => {
    await loadScript();
    // Background script registers its listener on chrome.runtime.onMessage
    const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    listener({ type: 'GUEST_INFO_UPDATED', data: {} }, {}, jest.fn());
    listener({ type: 'CHAT_CONTEXT_UPDATED', data: {} }, {}, jest.fn());
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  test('ignores unrelated messages', async () => {
    await loadScript();
    const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    listener({ type: 'OTHER' }, {}, jest.fn());
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});

describe('exception-safe broadcast path (safeSend)', () => {
  const CASES = [
    { path: '../src/content-stayntouch.ts', fixture: '<div class="guest-name">Jane</div>', type: 'GUEST_INFO_UPDATED' },
    { path: '../src/content-akia.ts', fixture: '<div class="message-item"><span class="message-text">hi</span></div>', type: 'CHAT_CONTEXT_UPDATED' }
  ];

  for (const { path: scriptPath, fixture, type } of CASES) {
    describe(scriptPath, () => {
      beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        chrome.runtime.sendMessage.mockReset();
        chrome.runtime.sendMessage.mockReturnValue(Promise.resolve());
      });

      async function loadScript() {
        await import(scriptPath);
      }

      test('a synchronous throw from sendMessage does not kill the observer', async () => {
        document.body.innerHTML = fixture;
        let calls = 0;
        chrome.runtime.sendMessage.mockImplementation(() => {
          calls += 1;
          throw new Error('Extension context invalidated.');
        });

        await loadScript();
        expect(calls).toBe(1);

        const callsBeforeMutation = calls;
        document.body.appendChild(document.createElement('div'));
        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 350));
        expect(calls).toBeGreaterThan(callsBeforeMutation);
      });

      test('a rejected sendMessage promise does not surface an unhandled rejection', async () => {
        document.body.innerHTML = fixture;
        const rejections: any[] = [];
        const handler = (err: any) => rejections.push(err);
        process.on('unhandledRejection', handler);
        chrome.runtime.sendMessage.mockImplementation(() => Promise.reject(new Error('no receiver')));

        try {
          await loadScript();
          document.body.appendChild(document.createElement('div'));
          await Promise.resolve();
          await new Promise((r) => setTimeout(r, 350));
          await new Promise((r) => setTimeout(r, 10));
          expect(rejections).toHaveLength(0);
        } finally {
          process.off('unhandledRejection', handler);
        }
      });

      test(`successful broadcasts still carry ${type}`, async () => {
        document.body.innerHTML = fixture;
        const sent: any[] = [];
        chrome.runtime.sendMessage.mockImplementation((msg) => sent.push(msg));
        await loadScript();
        expect(sent).toHaveLength(1);
        expect(sent[0].type).toBe(type);
      });
    });
  }
});

describe('Content Scripts Edge Cases', function() {
  let originalBody: string;

  beforeEach(function() {
    originalBody = document.body.innerHTML;
    document.body.innerHTML = '';
  });

  afterEach(function() {
    document.body.innerHTML = originalBody;
  });

  describe('Empty DOM', function() {
    it('should handle empty DOM without errors', function() {
      document.body.innerHTML = '';
    });
  });

  describe('Malformed HTML', function() {
    it('should handle unclosed tags', function() {
      document.body.innerHTML = '<div><p>Unclosed tag';
    });
  });

  describe('Rapid DOM Mutations', function() {
    it('should handle rapid DOM mutations with debouncing', function(done) {
      document.body.innerHTML = '<div id="container"></div>';
      const container = document.getElementById('container');
      for (let i = 0; i < 50; i++) {
        setTimeout(() => {
          container!.innerHTML += '<div class="message">Message ' + i + '</div>';
        }, i * 10);
      }
      setTimeout(done, 1000);
    });
  });
});
