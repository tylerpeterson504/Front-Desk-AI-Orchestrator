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

  test('falls back to label/value pairs when selectors miss', () => {
    // A PMS that renders label + value rows instead of .guest-name elements.
    document.body.innerHTML = `
      <dl>
        <dt>Guest Name</dt><dd>Jane Doe</dd>
        <dt>Room</dt><dd>204</dd>
      </dl>
    `;
    const sent = [];
    chrome.runtime.sendMessage.mockImplementation((msg) => sent.push(msg));
    loadScript();
    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe('GUEST_INFO_UPDATED');
    expect(sent[0].data.guestName).toBe('Jane Doe');
    expect(sent[0].data.roomNumber).toBe('204');
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

  // Fixture copied verbatim from the live Akia website-chat DOM (Aug 2026),
  // captured from Hotel St Pierre's public widget. Do not "tidy" this markup:
  // the duplicated .website-chat-message class on the typing indicator and the
  // .message text div nested inside it are exactly the traps the extractor has
  // to survive.
  const REAL_AKIA_DOM = `
    <div class="website-chat-client-body" aria-label="Chat conversation" role="log">
      <div aria-hidden="true" aria-label="" class="website-chat-typing-indicator website-chat-message incoming" role="status">
        <div class="message">
          <span aria-hidden="true" class="website-chat-typing-dot"></span>
          <span aria-hidden="true" class="website-chat-typing-dot"></span>
          <span aria-hidden="true" class="website-chat-typing-dot"></span>
        </div>
      </div>
      <section aria-label="Message group">
        <article aria-label="Message from Hotel St Pierre " class="website-chat-message incoming">
          <address class="author">Hotel St Pierre </address>
          <div class="message">Send a message to our hotel staff.
</div>
          <time class="timestamp">a few seconds ago</time>
        </article>
        <article aria-label="Message from you" class="website-chat-message outgoing">
          <div class="message">What time is check-in?</div>
          <time class="timestamp">just now</time>
        </article>
      </section>
    </div>
  `;

  test('extracts from the real Akia website-chat DOM and skips the typing indicator', () => {
    document.body.innerHTML = REAL_AKIA_DOM;
    const sent = [];
    chrome.runtime.sendMessage.mockImplementation((msg) => sent.push(msg));
    loadScript();
    expect(sent).toHaveLength(1);
    // The typing indicator must NOT appear as a message, and the .message div
    // inside each article must not be mistaken for a row of its own.
    expect(sent[0].data.messages).toEqual([
      { sender: 'Hotel St Pierre', text: 'Send a message to our hotel staff.', time: 'a few seconds ago' },
      { sender: 'guest', text: 'What time is check-in?', time: 'just now' }
    ]);
  });

  test('injects into the real Akia composer without touching the honeypot field', () => {
    document.body.innerHTML = `
      <form class="website-chat-client-composer" aria-label="Send message form">
        <div class="faux-field">
          <input name="form_helper" type="checkbox">
          <input id="message" name="butter" placeholder="Type your message here." aria-label="Message input" type="text">
          <button id="send-button" class="composer-send composer-send-disabled" aria-label="Send message" type="submit">
            <span class="website-chat-arrow-right"></span>
          </button>
        </div>
      </form>
    `;
    chrome.runtime.sendMessage.mockImplementation(() => undefined);
    loadScript();
    const events = [];
    const field = document.getElementById('message');
    field.addEventListener('input', () => events.push('input'));
    field.addEventListener('change', () => events.push('change'));

    const respond = jest.fn();
    listener()({ type: 'INJECT_MESSAGE', text: 'Check-in is at 4 PM.' }, {}, respond);

    expect(field.value).toBe('Check-in is at 4 PM.');
    expect(events).toEqual(['input', 'change']);
    // The decoy checkbox must be untouched.
    expect(document.querySelector('input[name="form_helper"]').checked).toBe(false);
    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
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

  test('injectMessage fills a contenteditable and dispatches input', () => {
    document.body.innerHTML = '<div contenteditable="true" class="composer"></div>';
    const el = document.querySelector('.composer');
    Object.defineProperty(el, 'isContentEditable', { value: true, configurable: true });
    document.execCommand = jest.fn().mockReturnValue(true);
    const events = [];
    el.addEventListener('input', (e) => events.push(e));
    try {
      chrome.runtime.sendMessage.mockImplementation(() => undefined);
      loadScript();
      const respond = jest.fn();
      listener()({ type: 'INJECT_MESSAGE', text: 'Hello there' }, {}, respond);
      expect(respond.mock.calls[0][0].success).toBe(true);
      expect(el.textContent).toBe('Hello there');
      expect(events).toHaveLength(1);
    } finally {
      delete document.execCommand;
    }
  });

  test('injectMessage falls back when execCommand is unavailable', () => {
    document.body.innerHTML = '<div contenteditable="true"></div>';
    const el = document.querySelector('[contenteditable]');
    Object.defineProperty(el, 'isContentEditable', { value: true, configurable: true });
    document.execCommand = undefined;
    const events = [];
    el.addEventListener('input', (e) => events.push(e));
    try {
      chrome.runtime.sendMessage.mockImplementation(() => undefined);
      loadScript();
      const respond = jest.fn();
      listener()({ type: 'INJECT_MESSAGE', text: 'Hi' }, {}, respond);
      expect(respond.mock.calls[0][0].success).toBe(true);
      expect(el.textContent).toBe('Hi');
      expect(events).toHaveLength(1);
    } finally {
      delete document.execCommand;
    }
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
