// Content script for Akia guest messaging platform
// Captures active chat context and injects drafted messages into the composer.
//
// Hardened: multi-strategy selectors with ancestor-dedup, contenteditable
// injection, a try/catch guard so a reloaded extension never crashes the
// observer, a 300ms debounced MutationObserver, and an optional debug-discovery
// mode. Enable debug by setting chrome.storage.local fdao-debug to true.
//
// VERIFIED against the live Akia website-chat DOM (Aug 2026):
//   div.website-chat-client-body[role="log"]
//     div.website-chat-typing-indicator.website-chat-message.incoming  <- NOT a message
//       div.message  (three .website-chat-typing-dot spans)
//     section[aria-label="Message group"]
//       article.website-chat-message.incoming
//         address.author   "Hotel St Pierre"
//         div.message      "Send a message to our hotel staff."
//         time.timestamp   "a few seconds ago"

import { logger, initDebugMode } from './utils/logger';

interface ChatMessage {
  sender: string | null;
  text: string;
  time: string | null;
}

interface ChatContext {
  messages: ChatMessage[];
  activeGuest: string;
  conversationId: string;
}

interface MessageSelectorResult {
  type: string;
  success?: boolean;
}

(function () {
  'use strict';

  let observer: MutationObserver | null = null;
  let pending: ReturnType<typeof setTimeout> | null = null;

  const MUTATION_DEBOUNCE_MS = 300;

  // Initialize logger with debug mode from storage
  const log = createLogger('FDAO/akia');
  initDebugMode(log);

  function sanitizeText(text: string | null | undefined): string | null | undefined {
    if (!text || typeof text !== 'string') return text;
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeSend(payload: { type: string; data?: unknown }): void {
    try {
      const result = chrome.runtime.sendMessage(payload);
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        (result as Promise<unknown>).catch(function (e) {
          log.warn('sendMessage failed for type ' + (payload.type || 'unknown') + ':', (e as Error)?.message);
        });
      }
    } catch (e) {
      log.warn('sendMessage failed for type ' + (payload.type || 'unknown') + ':', (e as Error)?.message);
    }
  }

  function getRoot(): Element {
    return document.querySelector(
      '.website-chat-client-body[role="log"], [role="log"], main [role="main"], #app > [data-testid*="chat"], #chat-container, [data-app-root]'
    ) || document.body;
  }

  function firstText(root: Element, selectors: string[]): string | null {
    for (let i = 0; i < selectors.length; i++) {
      let el: Element | null = null;
      try { el = root.querySelector(selectors[i]); } catch (_) {}
      if (el) {
        const t = (el.innerText || el.textContent || '').trim();
        if (t) return t;
      }
    }
    return null;
  }

  const MESSAGE_SELECTORS = [
    'article.website-chat-message',
    '.message-row',
    '.message-item',
    '.chat-message',
    '[data-test="message"]',
    '[data-testid*="message-item" i]',
    '[data-testid*="message-row" i]',
    '[data-testid*="message-bubble" i]'
  ];

  const MESSAGE_EXCLUDE = ['.website-chat-typing-indicator', '[role="status"]'];
  const SENDER_SELECTORS = ['address.author', '.author', '.sender-name', '.message-sender', '[data-test="sender"]', '[data-testid*="sender" i]'];
  const TEXT_SELECTORS = [':scope > .message', '.message-text', '.message-body', '[data-test="message-text"]'];
  const TIME_SELECTORS = ['time.timestamp', '.timestamp', '.message-time', '[data-test="timestamp"]', 'time'];

  const COMPOSER_SELECTORS = [
    '.website-chat-client-composer input#message',
    '.website-chat-client-composer input[aria-label="Message input" i]',
    '.website-chat-client-composer input[type="text"]',
    'input[aria-label="Message input" i]',
    'textarea.message-input',
    'input.message-input',
    '[data-test="message-input"]',
    '.chat-input textarea',
    'textarea[placeholder*="message" i]',
    'textarea[placeholder*="reply" i]',
    'textarea[placeholder*="type" i]',
    'input[type="text"][placeholder*="message" i]',
    '[contenteditable="true"]'
  ];

  function extractChatContext(): ChatContext {
    const root = getRoot();
    const collected: Element[] = [];
    MESSAGE_SELECTORS.forEach(function (sel) {
      try { root.querySelectorAll(sel).forEach(function (n) { collected.push(n); }); }
      catch (_) {}
    });
    const nodes = collected.filter(function (n) {
      const excluded = MESSAGE_EXCLUDE.some(function (sel) {
        try { return n.matches(sel) || n.closest(sel); } catch (_) { return false; }
      });
      if (excluded) return false;
      return !collected.some(function (m) { return m !== n && n.contains(m); });
    });
    const messages = nodes.map(function (el) {
      let sender: string | null = firstText(el, SENDER_SELECTORS);
      if (!sender) {
        try { if (el.matches('.incoming')) sender = 'hotel'; else if (el.matches('.outgoing')) sender = 'guest'; }
        catch (_) {}
      }
      if (!sender && el.parentElement) {
        const siblingRows = nodes.filter(function (n) { return n.parentElement === el.parentElement; });
        if (siblingRows.length <= 1) sender = firstText(el.parentElement, SENDER_SELECTORS);
      }
      const text = firstText(el, TEXT_SELECTORS) || (el.innerText || el.textContent || '').trim();
      const time = firstText(el, TIME_SELECTORS);
      return { sender: sender, text: text, time: time };
    }).filter(function (m) { return !!m.text; });
    const activeGuest = firstText(root, ['.active-guest-name', '.conversation-guest', '[data-test="active-guest"]', '.website-chat-client-header .author', '[data-testid*="guest-name" i]']);
    let conversationEl: Element | null = null;
    try { conversationEl = root.querySelector('[data-conversation-id]'); } catch (_) {}
    const conversationId = conversationEl ? conversationEl.getAttribute('data-conversation-id') : null;
    
    log.log('messages:', messages.length, 'activeGuest:', activeGuest, 'samples:', messages.slice(0, 3));
    logDiscovery(root);
    
    return { messages: messages, activeGuest: activeGuest || '', conversationId: conversationId || '' };
  }

  function validateContext(ctx: unknown): ChatContext {
    const validated = ctx as ChatContext;
    if (!validated || typeof validated !== 'object') throw new Error('Context must be an object');
    if (!Array.isArray(validated.messages)) throw new Error('messages must be an array');
    validated.messages.forEach(function(m, index) {
      if (!m || typeof m !== 'object') throw new Error('Message at index ' + index + ' must be an object');
      if (typeof m.text !== 'string') throw new Error('Message at index ' + index + ': text must be a string');
      if (m.sender !== null && typeof m.sender !== 'string') throw new Error('Message at index ' + index + ': sender must be string or null');
      if (m.time !== null && typeof m.time !== 'string') throw new Error('Message at index ' + index + ': time must be string or null');
    });
    if (typeof validated.activeGuest !== 'string') throw new Error('activeGuest must be a string');
    if (typeof validated.conversationId !== 'string') throw new Error('conversationId must be a string');
    return validated;
  }

  function hasContext(ctx: ChatContext): boolean { return ctx.messages.length > 0 || !!ctx.activeGuest; }

  function sendChatContext(): void {
    try { const ctx = extractChatContext(); validateContext(ctx); if (hasContext(ctx)) safeSend({ type: 'CHAT_CONTEXT_UPDATED', data: ctx }); }
    catch (e: unknown) { log.warn('sendChatContext failed:', (e as Error)?.message); }
  }

  function logDiscovery(root: Element): void {
    const probes: Record<string, string[]> = {
      'message-containers': ['.message-item', '.chat-message', '[data-test="message"]', '[data-testid*="message" i]', '[class*="bubble" i]', '[class*="msg" i]'],
      'sender-like': ['[class*="sender" i]', '[data-testid*="sender" i]', '[class*="author" i]', '[class*="from" i]'],
      'composer-like': ['textarea', 'input[type="text"]', '[contenteditable="true"]', '[class*="input" i]', '[class*="composer" i]', '[class*="reply" i]']
    };
    Object.keys(probes).forEach(function (label) {
      let total = 0; const samples: string[] = [];
      (probes as Record<string, string[]>)[label].forEach(function (sel) {
        let n = 0; try { n = root.querySelectorAll(sel).length; } catch (_) {}
        if (n) { total += n; if (samples.length < 5) samples.push(sel + '(' + n + ')'); }
      });
      log.log('discovery[' + label + ']: ' + (total || 'none') + (samples.length ? ' -> ' + samples.join(' | ') : ''));
    });
  }

  function findComposer(): Element | null {
    for (let i = 0; i < COMPOSER_SELECTORS.length; i++) {
      let el: Element | null = null; try { el = document.querySelector(COMPOSER_SELECTORS[i]); } catch (_) {}
      if (el) return el;
    }
    return null;
  }

  function injectMessage(text: string): boolean {
    if (!text || typeof text !== 'string') { log.warn('inject: invalid text input, must be a non-empty string'); return false; }
    if (text.length > 10000) { log.warn('inject: text too long, truncating to 10000 characters'); text = text.substring(0, 10000); }
    const el = findComposer();
    if (!el) { log.warn('inject: composer not found'); return false; }
    try {
      if ((el as HTMLElement).isContentEditable) {
        (el as HTMLElement).focus();
        const before = el.textContent;
        let ok = false;
        try {
          const s = document.execCommand('selectAll', false, null);
          const i = document.execCommand('insertText', false, text);
          ok = !!(s && i);
        }
        catch (_) { ok = false; }
        if (!ok || el.textContent === before) (el as HTMLElement).textContent = text;
        const InputEventCtor = (window as unknown as { InputEvent: typeof InputEvent }).InputEvent;
        const evt = InputEventCtor 
          ? new InputEventCtor('input', { bubbles: true, inputType: 'insertText', data: text })
          : new Event('input', { bubbles: true });
        el.dispatchEvent(evt);
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      const proto = (el as HTMLTextAreaElement).constructor.prototype;
      if (proto && 'value' in proto) {
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) desc.set.call(el, text);
        else (el as HTMLTextAreaElement | HTMLInputElement).value = text;
      } else {
        (el as HTMLTextAreaElement | HTMLInputElement).value = text;
      }
      const InputEventCtor2 = (window as unknown as { InputEvent: typeof InputEvent }).InputEvent;
      const evt2 = InputEventCtor2
        ? new InputEventCtor2('input', { bubbles: true, inputType: 'insertText', data: text })
        : new Event('input', { bubbles: true });
      el.dispatchEvent(evt2);
      el.dispatchEvent(new Event('change', { bubbles: true }));
      (el as HTMLElement).focus();
      return true;
    } catch (e: unknown) { log.warn('inject failed:', (e as Error)?.message); return false; }
  }

  function scheduleCapture(): void {
    if (pending) clearTimeout(pending);
    pending = setTimeout(function () { pending = null; sendChatContext(); }, MUTATION_DEBOUNCE_MS);
  }

  function setupObserver(): void {
    if (observer) { try { observer.disconnect(); } catch (_) {} }
    observer = new MutationObserver(function () { scheduleCapture(); });
    if (document.body) { try { observer.observe(document.body, { childList: true, subtree: true }); } catch (e: unknown) { log.warn('observe failed:', (e as Error)?.message); } }
  }

  function init(): void {
    setupObserver();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', sendChatContext);
    } else {
      sendChatContext();
    }
    if (window.addEventListener) {
      window.addEventListener('beforeunload', function() {
        if (observer) {
          try { observer.disconnect(); } catch (_) {}
          observer = null;
        }
      });
    }
  }

  chrome.runtime.onMessage.addListener(function (message: { type: string; data?: unknown; text?: string }, _sender: unknown, sendResponse: (response: MessageSelectorResult) => void) {
    if (message.type === 'GET_CHAT_CONTEXT') {
      try {
        const ctx = extractChatContext();
        validateContext(ctx);
        sendResponse({ data: ctx });
      }
      catch (e: unknown) {
        log.warn('GET_CHAT_CONTEXT failed:', (e as Error)?.message);
        sendResponse({ data: { messages: [], activeGuest: '', conversationId: '' } });
      }
      return false;
    }
    if (message.type === 'INJECT_MESSAGE') {
      sendResponse({ success: injectMessage(message.text || '') });
      return false;
    }
  });

  init();

  // Import createLogger dynamically to avoid circular dependency
  function createLogger(prefix: string): {
    log: (message: string, data?: unknown) => void;
    warn: (message: string, data?: unknown) => void;
    error: (message: string, data?: unknown) => void;
    setDebug: (enabled: boolean) => void;
  } {
    let debug = false;

    function setDebug(enabled: boolean): void {
      debug = enabled;
    }

    function log(message: string, data?: unknown): void {
      if (!debug) return;
      const formatted = data !== undefined 
        ? `[${new Date().toISOString()}] [${prefix}] ${message} ${JSON.stringify(data)}`
        : `[${new Date().toISOString()}] [${prefix}] ${message}`;
      console.log(formatted);
    }

    function warn(message: string, data?: unknown): void {
      if (!debug) return;
      const formatted = data !== undefined 
        ? `[${new Date().toISOString()}] [${prefix}] ${message} ${JSON.stringify(data)}`
        : `[${new Date().toISOString()}] [${prefix}] ${message}`;
      console.warn(formatted);
    }

    return {
      log,
      warn,
      error: warn,
      setDebug
    };
  }
})();
