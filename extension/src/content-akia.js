// Content script for Akia guest messaging platform
// Pipeline B: Captures active chat context and supports message injection

(function () {
  function extractChatContext() {
    const messages = [];

    document.querySelectorAll(
      '.message-item, .chat-message, [data-test="message"]'
    ).forEach((el) => {
      const sender = getText('.sender-name, .message-sender, [data-test="sender"]', el);
      const text = getText('.message-text, .message-body, [data-test="message-text"]', el);
      const time = getText('.message-time, .timestamp', el);
      if (text) {
        messages.push({ sender, text, time });
      }
    });

    return {
      messages,
      activeGuest: getText('.active-guest-name, .conversation-guest, [data-test="active-guest"]'),
      conversationId: document.querySelector('[data-conversation-id]')
        ?.getAttribute('data-conversation-id') || null
    };
  }

  function getText(selector, root = document) {
    const el = root.querySelector(selector);
    return el ? el.textContent.trim() : null;
  }

  function sendChatContext() {
    const context = extractChatContext();
    if (context.messages.length > 0 || context.activeGuest) {
      chrome.runtime.sendMessage({ type: 'CHAT_CONTEXT_UPDATED', data: context });
    }
  }

  // Inject a message into the Akia chat input
  function injectMessage(text) {
    const input = document.querySelector(
      'textarea.message-input, input.message-input, [data-test="message-input"], .chat-input textarea'
    );
    if (!input) return false;

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      input.value = text;
    }
    input.focus();
    return true;
  }

  // Send context on load
  sendChatContext();

  const MUTATION_DEBOUNCE_MS = 300;

  // Re-send on DOM changes (new messages arriving)
  // Debounced: one extraction per burst of DOM changes. These hosts are SPAs that mutate the DOM
  // constantly, and the undebounced version re-extracted and messaged the
  // background worker on every single mutation.
  let pending = null;
  const observer = new MutationObserver(() => {
    if (typeof document === 'undefined' || !document.body) return;
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      sendChatContext();
    }, MUTATION_DEBOUNCE_MS);
  });
  if (typeof document !== 'undefined' && document.body) observer.observe(document.body, { childList: true, subtree: true });

  // Listen for requests from the side panel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_CHAT_CONTEXT') {
      sendResponse({ data: extractChatContext() });
    } else if (message.type === 'INJECT_MESSAGE') {
      const success = injectMessage(message.text);
      sendResponse({ success });
    }
  });
})();
