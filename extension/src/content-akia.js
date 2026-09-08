// Content script for Akia guest messaging platform
// Pipeline B: Captures active chat context and supports message injection

(function () {
  // Enhanced error handling and logging
  function logExtractionError(error, selector) {
    console.error('[Akia Content Script] Error extracting from selector:', selector, error);
  }

  function safeGetText(selector, root = document) {
    try {
      if (!root || !root.querySelector) return null;
      const el = root.querySelector(selector);
      return el ? el.textContent.trim() : null;
    } catch (error) {
      logExtractionError(error, selector);
      return null;
    }
  }

  function getText(selector, root = document) {
    // Try multiple selectors for robustness
    if (!root || !root.querySelector) return null;
    
    const selectors = selector.split(',').map(s => s.trim());
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el) {
        try {
          const text = el.textContent.trim();
          if (text) return text;
        } catch (error) {
          logExtractionError(error, sel);
        }
      }
    }
    return null;
  }

  function extractChatContext() {
    try {
      const messages = [];

      // Try multiple message container selectors
      const messageSelectors = [
        '.message-item, .chat-message, [data-test="message"]',
        '.message-container .message, .chat-bubble, .message-wrapper',
        '.thread-message, .conversation-message'
      ];

      messageSelectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach((el) => {
            const sender = getText('.sender-name, .message-sender, [data-test="sender"], .message-author, .from-name', el);
            const text = getText('.message-text, .message-body, [data-test="message-text"], .message-content, .text-body', el);
            const time = getText('.message-time, .timestamp, [data-test="timestamp"], .message-time, .sent-at', el);
            const messageId = el.getAttribute('data-message-id') || el.getAttribute('id');
            
            if (text && !messages.some(m => m.text === text)) {
              messages.push({ 
                sender, 
                text, 
                time,
                messageId: messageId || null
              });
            }
          });
        } catch (error) {
          logExtractionError(error, selector);
        }
      });

      // Get active guest information
      const activeGuest = getText('.active-guest-name, .conversation-guest, [data-test="active-guest"], .guest-display-name, .current-guest');
      
      // Get conversation metadata
      let conversationId = null;
      let conversationStatus = null;
      let propertyId = null;
      
      try {
        const convIdEl = document.querySelector('[data-conversation-id], [data-chat-id], [data-thread-id]');
        if (convIdEl) {
          conversationId = convIdEl.getAttribute('data-conversation-id') || 
                          convIdEl.getAttribute('data-chat-id') || 
                          convIdEl.getAttribute('data-thread-id');
        }
        
        conversationStatus = getText('.conversation-status, .chat-status, .thread-status');
        
        const propertyEl = document.querySelector('[data-property-id]');
        if (propertyEl) {
          propertyId = propertyEl.getAttribute('data-property-id');
        }
      } catch (error) {
        logExtractionError(error, 'conversation metadata');
      }

      // Get additional context
      const currentUrl = window.location.href;
      const pageTitle = document.title;

      return {
        messages,
        activeGuest,
        conversationId,
        conversationStatus,
        propertyId,
        pageTitle,
        currentUrl,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('[Akia Content Script] Error in extractChatContext:', error);
      return {
        messages: [],
        activeGuest: null,
        conversationId: null
      };
    }
  }

  function sendChatContext() {
    const context = extractChatContext();
    if (context.messages.length > 0 || context.activeGuest) {
      chrome.runtime.sendMessage({ type: 'CHAT_CONTEXT_UPDATED', data: context });
    }
  }

  // Inject a message into the Akia chat input
  function injectMessage(text) {
    try {
      // Try multiple input selectors for robustness
      const inputSelectors = [
        'textarea.message-input, input.message-input, [data-test="message-input"], .chat-input textarea',
        'textarea.chat-input, input.chat-input, [data-test="chat-input"], .message-input textarea',
        'textarea#message-input, input#message-input, [name="message"], [id="chat-input"]'
      ];

      let input = null;
      for (const selector of inputSelectors) {
        input = document.querySelector(selector);
        if (input) break;
      }

      if (!input) {
        console.error('[Akia Content Script] Could not find message input element');
        return false;
      }

      // Enhanced injection method that works with React, Angular, Vue, etc.
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(input, text);
        // Dispatch both input and change events for comprehensive framework support
        input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      } else {
        input.value = text;
        // Also try setting via direct property for some frameworks
        if (input._valueTracker) {
          input._valueTracker.setValue(text);
        }
      }

      // Focus the input and scroll to it
      input.focus();
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Select all text for easy editing
      if (input.select) {
        input.select();
      }

      console.log('[Akia Content Script] Message injected successfully');
      return true;
    } catch (error) {
      console.error('[Akia Content Script] Error in injectMessage:', error);
      return false;
    }
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
