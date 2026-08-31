// Context-invalidation guard for the content scripts.
//
// Lives in its own file on purpose: every content-script test that loads the
// script attaches another MutationObserver to the shared jsdom document, so
// counting broadcasts is only meaningful when the script is loaded exactly
// once per file (see content-observer-debounce.test.js for the same pattern).

describe('content-stayntouch.js survives a reloaded extension', () => {
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

  test('a throwing sendMessage does not kill the observer', async () => {
    jest.useFakeTimers();
    try {
      document.body.innerHTML = '<div class="guest-name">First</div>';
      // Simulate the extension being reloaded mid-session: every send throws.
      chrome.runtime.sendMessage.mockImplementation(() => {
        throw new Error('Extension context invalidated');
      });
      loadScript(); // load-time send throws but is caught; observer still attaches

      // Once the context is healthy again, a mutation should broadcast.
      const sent = [];
      chrome.runtime.sendMessage.mockImplementation((msg) => sent.push(msg));
      document.body.appendChild(document.createElement('div'));
      await Promise.resolve(); // jsdom delivers mutation records on a microtask
      jest.advanceTimersByTime(300);
      expect(sent).toHaveLength(1);
      expect(sent[0].type).toBe('GUEST_INFO_UPDATED');
    } finally {
      jest.useRealTimers();
    }
  });
});
