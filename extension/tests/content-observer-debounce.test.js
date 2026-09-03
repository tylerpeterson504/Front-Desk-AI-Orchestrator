// Debounce behavior of the content-script MutationObserver.
//
// This lives in its own file on purpose: every test that requires a content
// script attaches another observer to the same jsdom document, so counting
// broadcasts is only meaningful when the script is loaded exactly once.

describe('content-stayntouch.js mutation debouncing', () => {
  const DEBOUNCE_MS = 300;

  it('coalesces a burst of mutations into a single broadcast', async () => {
    jest.useFakeTimers();
    try {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'app.us1.stayntouch.com' },
        writable: true
      });
      document.body.innerHTML = '<div class="guest-name">First</div>';

      const sent = [];
      chrome.runtime.sendMessage.mockImplementation((msg) => sent.push(msg));

      require('../src/config');
      require('../src/content-stayntouch');

      expect(sent).toHaveLength(1); // the load-time send

      // A busy SPA mutates the DOM many times in quick succession. Undebounced,
      // this was one extraction and one message per mutation.
      for (let i = 0; i < 25; i += 1) {
        document.body.appendChild(document.createElement('div'));
      }

      await Promise.resolve(); // jsdom delivers records on a microtask
      expect(sent).toHaveLength(1); // still inside the debounce window

      jest.advanceTimersByTime(DEBOUNCE_MS);
      expect(sent).toHaveLength(2); // one broadcast for the whole burst
      expect(sent[1].type).toBe('GUEST_INFO_UPDATED');

      // A later, separate change gets its own broadcast.
      document.querySelector('.guest-name').textContent = 'Second';
      document.body.appendChild(document.createElement('span'));
      await Promise.resolve();
      jest.advanceTimersByTime(DEBOUNCE_MS);

      expect(sent).toHaveLength(3);
      expect(sent[2].data.guestName).toBe('Second');
    } finally {
      jest.useRealTimers();
    }
  });
});
