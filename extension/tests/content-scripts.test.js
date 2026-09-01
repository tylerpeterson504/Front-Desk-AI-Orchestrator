/**
 * Smoke tests for the content scripts.
 * Verifies they load cleanly and do not broadcast on an empty DOM.
 */

describe('Content scripts smoke tests', function() {
  const originalMutationObserver = window.MutationObserver;

  beforeEach(function() {
    document.body.innerHTML = '';
    chrome.runtime.sendMessage.mockClear();
    chrome.runtime.onMessage.addListener.mockClear();
    const MockMutationObserver = class {
      observe() {}
      disconnect() {}
    };
    window.MutationObserver = MockMutationObserver;
    global.MutationObserver = MockMutationObserver;
  });

  afterEach(function() {
    window.MutationObserver = originalMutationObserver;
    global.MutationObserver = originalMutationObserver;
    jest.resetModules();
  });

  function loadScript(path) {
    jest.isolateModules(function() {
      require(path);
    });
  }

  it('loads the Akia script without broadcasting on an empty DOM', function() {
    loadScript('../src/content-akia.js');
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('loads the Stayntouch script and serves the guest-info contract on an empty DOM', function() {
    let listener = null;
    chrome.runtime.onMessage.addListener.mockImplementation(function(fn) {
      listener = fn;
    });

    loadScript('../src/content-stayntouch.js');

    expect(typeof listener).toBe('function');
    const sendResponse = jest.fn();
    listener({ type: 'GET_GUEST_INFO' }, null, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith({
      data: {
        guestName: '',
        roomNumber: '',
        checkIn: '',
        checkOut: '',
        confirmationNumber: '',
        reservationStatus: ''
      }
    });
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});

describe('Content scripts debouncing', function() {
  beforeEach(function() {
    document.body.innerHTML = '';
    chrome.runtime.sendMessage.mockClear();
    jest.useFakeTimers();
  });

  afterEach(function() {
    jest.useRealTimers();
    jest.resetModules();
  });

  function loadScript(path) {
    jest.isolateModules(function() {
      require(path);
    });
  }

  it('coalesces Stayntouch mutations into a single broadcast', async function() {
    const sent = [];
    chrome.runtime.sendMessage.mockImplementation(function(payload) {
      sent.push(payload);
    });

    document.body.innerHTML = '<div class="guest-name">First</div>';
    loadScript('../src/config.js');
    loadScript('../src/content-stayntouch.js');

    expect(sent).toHaveLength(1);

    for (let i = 0; i < 10; i += 1) {
      document.body.appendChild(document.createElement('div'));
    }

    await Promise.resolve();
    expect(sent).toHaveLength(1);

    jest.advanceTimersByTime(300);
    expect(sent).toHaveLength(2);
    expect(sent[1].type).toBe('GUEST_INFO_UPDATED');
  });
});
