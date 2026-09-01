// Content-script and shared-config tests for the Front Desk AI extension.
//
// The content scripts are IIFEs that run against the real DOM (jsdom here) and
// chrome.* messaging. Each test injects a fixture DOM, loads the script with
// `require`, and asserts the extraction/injection behavior through the chrome
// mock and direct DOM inspection.

describe('config.js shared module', () => {
  const CONFIG_PATH = '../src/config.js';

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadConfig(hostname) {
    if (hostname !== undefined) {
      Object.defineProperty(window, 'location', {
        value: { hostname },
        writable: true
      });
    }
    return require(CONFIG_PATH);
  }

  test('matches a property by urlPattern substring', () => {
    const config = loadConfig('app.us1.stayntouch.com');
    const property = config.getPropertyConfig();
    expect(property).not.toBeNull();
    expect(property.name).toBe('St.Pierre Hotel');
    expect(property.id).toBe(1);
  });

  test('matches the second property', () => {
    const config = loadConfig('sys.akia.ai');
    expect(config.getPropertyConfig()?.name).toBe('Andrew Jackson Hotel');
  });

  test('returns null on an unknown host', () => {
    const config = loadConfig('unknown.pms.example');
    expect(config.getPropertyConfig()).toBeNull();
  });

  test('getApiBaseUrl is centralized and defaults to local dev', () => {
    const config = loadConfig('app.us1.stayntouch.com');
    expect(config.getApiBaseUrl()).toBe('http://localhost:3001');
    expect(config.getAllProperties()).toHaveLength(2);
  });

  test('loadApiBaseUrl applies the chrome.storage.local override', async () => {
    chrome.storage.local.get.mockResolvedValue({ apiBaseUrl: 'https://api.example.com/' });
    const config = loadConfig('app.us1.stayntouch.com');

    await expect(config.loadApiBaseUrl()).resolves.toBe('https://api.example.com');
    // The override has to be visible to the synchronous accessor too, since
    // content scripts cannot await storage.
    expect(config.getApiBaseUrl()).toBe('https://api.example.com');
  });

  test('loadApiBaseUrl falls back to the default when storage is empty', async () => {
    chrome.storage.local.get.mockResolvedValue({});
    const config = loadConfig('app.us1.stayntouch.com');
    await expect(config.loadApiBaseUrl()).resolves.toBe('http://localhost:3001');
  });

  test('loadApiBaseUrl survives a storage failure', async () => {
    chrome.storage.local.get.mockRejectedValue(new Error('storage unavailable'));
    const config = loadConfig('app.us1.stayntouch.com');
    await expect(config.loadApiBaseUrl()).resolves.toBe('http://localhost:3001');
  });

  test('rejects overrides that are not http(s) URLs', () => {
    const config = loadConfig('app.us1.stayntouch.com');
    for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'not a url', '', null]) {
      expect(config.setApiBaseUrlOverride(bad)).toBe('http://localhost:3001');
    }
    expect(config.normalizeApiBaseUrl('https://api.example.com//')).toBe('https://api.example.com');
  });

  test('a storage change updates the cached override without a reload', () => {
    const config = loadConfig('app.us1.stayntouch.com');
    const listener = chrome.storage.onChanged.addListener.mock.calls.at(-1)[0];

    listener({ apiBaseUrl: { newValue: 'https://later.example.com' } }, 'local');
    expect(config.getApiBaseUrl()).toBe('https://later.example.com');

    // Changes in other areas or to other keys must not touch it.
    listener({ apiBaseUrl: { newValue: 'https://sync.example.com' } }, 'sync');
    listener({ token: { newValue: 'x' } }, 'local');
    expect(config.getApiBaseUrl()).toBe('https://later.example.com');
  });
});

describe('content-stayntouch.js extraction', () => {
  const SCRIPT_PATH = '../src/content-stayntouch.js';

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadScript() {
    jest.isolateModules(() => {
      require(SCRIPT_PATH);
    });
  }

  function send(message, cb) {
    const listener = require('../tests/setup.js').lastRuntimeListener;
    return listener(message, {}, cb);
  }

  test('broadcasts GUEST_INFO_UPDATED with extracted fields', () => {
    document.body.innerHTML = `
      <div class="guest-name">Jane Doe</div>
      <div class="room-number">204</div>
      <div class="check-in-date">2026-08-28</div>
      <div class="check-out-date">2026-08-30</div>
      <div class="reservation-status">Checked-in</div>
      <div class="confirmation-number">CN-9911</div>
    `;
    const sent = [];
    chrome.runtime.sendMessage.mockImplementation((msg) => sent.push(msg));
    loadScript();
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

  test('does not broadcast when the page has no guest data', () => {
    document.body.innerHTML = '<div>empty lobby page</div>';
    const sent = [];
    chrome.runtime.sendMessage.mockImplementation((msg) => sent.push(msg));
    loadScript();
    expect(sent).toHaveLength(0);
  });

  test('answers GET_GUEST_INFO pull requests', () => {
    document.body.innerHTML = `
      <div class="guest-name">Bob</div>
      <div class="room-number">101</div>
    `;
    const response = { captured: false, value: null };
    chrome.runtime.sendMessage.mockImplementation(() => undefined);
    loadScript();
    const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    listener({ type: 'GET_GUEST_INFO' }, {}, (res) => {
      response.captured = true;
      response.value = res;
    });
    expect(response.captured).toBe(true);
    expect(response.value.data.guestName).toBe('Bob');
    expect(response.value.data.roomNumber).toBe('101');
  });

});

describe('content-akia.js extraction and injection', () => {
  const SCRIPT_PATH = '../src/content-akia.js';

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadScript() {
    jest.isolateModules(() => {
      require(SCRIPT_PATH);
    });
  }

  function listener() {
    return chrome.runtime.onMessage.addListener.mock.calls[0][0];
  }

  test('broadcasts CHAT_CONTEXT_UPDATED with messages and guest', () => {
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
    const sent = [];
    chrome.runtime.sendMessage.mockImplementation((msg) => sent.push(msg));
    loadScript();
    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe('CHAT_CONTEXT_UPDATED');
    expect(sent[0].data.activeGuest).toBe('Jane Doe');
    expect(sent[0].data.conversationId).toBe('conv-42');
    expect(sent[0].data.messages).toEqual([
      { sender: 'Jane', text: 'When is checkout?', time: '10:02' },
      { sender: 'Desk', text: '11 AM.', time: null }
    ]);
  });

  test('skips broadcast when the chat is empty', () => {
    document.body.innerHTML = '<div class="chat-shell"></div>';
    const sent = [];
    chrome.runtime.sendMessage.mockImplementation((msg) => sent.push(msg));
    loadScript();
    expect(sent).toHaveLength(0);
  });

  test('answers GET_CHAT_CONTEXT', () => {
    document.body.innerHTML = `
      <div class="message-item"><span class="message-text">hello</span></div>
    `;
    chrome.runtime.sendMessage.mockImplementation(() => undefined);
    loadScript();
    const respond = jest.fn();
    listener()({ type: 'GET_CHAT_CONTEXT' }, {}, respond);
    expect(respond).toHaveBeenCalled();
    expect(respond.mock.calls[0][0].data.messages[0].text).toBe('hello');
  });

  test('injectMessage sets the textarea via the native setter + input event', () => {
    document.body.innerHTML = '<textarea class="message-input"></textarea>';
    const input = document.querySelector('textarea.message-input');
    const events = [];
    input.addEventListener('input', (e) => events.push(e));
    chrome.runtime.sendMessage.mockImplementation(() => undefined);
    loadScript();
    const respond = jest.fn();
    listener()({ type: 'INJECT_MESSAGE', text: 'Dear guest…' }, {}, respond);
    expect(respond.mock.calls[0][0].success).toBe(true);
    expect(input.value).toBe('Dear guest…');
    expect(events).toHaveLength(1);
    expect(input === document.activeElement).toBe(true);
  });

  test('INJECT_MESSAGE reports failure when no input exists', () => {
    document.body.innerHTML = '<div>no composer here</div>';
    chrome.runtime.sendMessage.mockImplementation(() => undefined);
    loadScript();
    const respond = jest.fn();
    listener()({ type: 'INJECT_MESSAGE', text: 'x' }, {}, respond);
    expect(respond.mock.calls[0][0].success).toBe(false);
  });

  test('ignores unrelated message types', () => {
    document.body.innerHTML = '<textarea class="message-input"></textarea>';
    chrome.runtime.sendMessage.mockImplementation(() => undefined);
    loadScript();
    const respond = jest.fn();
    listener()({ type: 'SOMETHING_ELSE' }, {}, respond);
    expect(respond).not.toHaveBeenCalled();
  });
});

describe('background.js relay', () => {
  const SCRIPT_PATH = '../src/background.js';

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    // Restore the promise-returning runtime.sendMessage: earlier tests replace
    // it with mockImplementation(...) which survives clearAllMocks().
    chrome.runtime.sendMessage.mockReset();
    chrome.runtime.sendMessage.mockReturnValue(Promise.resolve());
  });

  function loadScript() {
    jest.isolateModules(() => {
      require(SCRIPT_PATH);
    });
  }

  test('forwards context updates to the runtime', () => {
    loadScript();
    const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    listener({ type: 'GUEST_INFO_UPDATED', data: {} }, {}, jest.fn());
    listener({ type: 'CHAT_CONTEXT_UPDATED', data: {} }, {}, jest.fn());
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  test('ignores unrelated messages', () => {
    loadScript();
    const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    listener({ type: 'OTHER' }, {}, jest.fn());
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});

describe('exception-safe broadcast path (safeSend)', () => {
  // When the service worker reloads, chrome.runtime.sendMessage throws
  // synchronously ("Extension context invalidated") and the MutationObserver
  // callback would die mid-broadcast. The scripts must swallow it and keep the
  // observer alive so a later mutation still gets a chance to broadcast.
  const CASES = [
    { path: '../src/content-stayntouch.js', fixture: '<div class="guest-name">Jane</div>', type: 'GUEST_INFO_UPDATED' },
    { path: '../src/content-akia.js', fixture: '<div class="message-item"><span class="message-text">hi</span></div>', type: 'CHAT_CONTEXT_UPDATED' }
  ];

  for (const { path: scriptPath, fixture, type } of CASES) {
    describe(scriptPath, () => {
      beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        // Restore the promise-returning sendMessage that other tests replace.
        chrome.runtime.sendMessage.mockReset();
        chrome.runtime.sendMessage.mockReturnValue(Promise.resolve());
      });

      function loadScript() {
        jest.isolateModules(() => {
          require(scriptPath);
        });
      }

      test('a synchronous throw from sendMessage does not kill the observer', async () => {
        document.body.innerHTML = fixture;
        let calls = 0;
        chrome.runtime.sendMessage.mockImplementation(() => {
          calls += 1;
          throw new Error('Extension context invalidated.');
        });

        loadScript(); // load-time broadcast throws internally — swallowed
        expect(calls).toBe(1);

        // The observer must still be alive: a later DOM mutation triggers another
        // (also swallowed) broadcast attempt instead of dying silently. Counts are
        // relative to the pre-mutation baseline because observers attached by
        // earlier tests in this file stay bound to the shared jsdom document and
        // also fire on this mutation (exact-count debouncing is covered in
        // content-observer-debounce.test.js, which loads each script exactly once).
        const callsBeforeMutation = calls;
        document.body.appendChild(document.createElement('div'));
        await Promise.resolve(); // jsdom delivers MutationRecords on a microtask
        await new Promise((r) => setTimeout(r, 350)); // debounce window (300ms)
        expect(calls).toBeGreaterThan(callsBeforeMutation);
      });

      test('a rejected sendMessage promise does not surface an unhandled rejection', async () => {
        document.body.innerHTML = fixture;
        const rejections = [];
        process.on('unhandledRejection', (err) => rejections.push(err));
        chrome.runtime.sendMessage.mockImplementation(() => Promise.reject(new Error('no receiver')));

        try {
          loadScript();
          document.body.appendChild(document.createElement('div'));
          await Promise.resolve();
          await new Promise((r) => setTimeout(r, 350));
          await new Promise((r) => setTimeout(r, 10)); // let any unhandled rejection fire
          expect(rejections).toHaveLength(0);
        } finally {
          process.off('unhandledRejection', (err) => rejections.push(err));
        }
      });

      test(`successful broadcasts still carry ${type}`, () => {
        document.body.innerHTML = fixture;
        const sent = [];
        chrome.runtime.sendMessage.mockImplementation((msg) => sent.push(msg));
        loadScript();
        expect(sent).toHaveLength(1);
        expect(sent[0].type).toBe(type);
      });
    });
  }
});
