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

(function () {
  'use strict';

  let DEBUG = false;
  let observer = null;
  let pending = null;

  const MUTATION_DEBOUNCE_MS = 300;

  function getLocalStorageValue(keys, callback) {
    try {
      if (chrome.storage.local.get.length > 1) {
        chrome.storage.local.get(keys, callback);
        return;
      }

      const result = chrome.storage.local.get(keys);
      if (result && typeof result.then === 'function') {
        result.then(callback).catch(function () {});
        return;
      }
      if (result && typeof result === 'object') callback(result);
    } catch (_) {}
  }

  function initDebugMode() {
    function applyResult(result) {
      DEBUG = result['fdao-debug'] === true;
      if (DEBUG) console.log('[FDAO/akia] Debug mode enabled');
    }

    getLocalStorageValue(['fdao-debug'], applyResult);
  }

  function log(message, data) {
    if (DEBUG) {
      if (data !== undefined) console.log('[FDAO/akia]', message, data);
      else console.log('[FDAO/akia]', message);
    }
  }

  function warn(message, data) {
    if (DEBUG) {
      if (data !== undefined) console.warn('[FDAO/akia]', message, data);
      else console.warn('[FDAO/akia]', message);
    }
  }

  function sanitizeText(text) {
    if (!text || typeof text !== 'string') return text;
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeSend(payload) {
    try {
      const result = chrome.runtime.sendMessage(payload);
      if (result && typeof result.catch === 'function') {
        result.catch(function (e) {
          warn('sendMessage failed for type ' + (payload.type || 'unknown') + ':', e && e.message);
        });
      }
    } catch (e) {
      warn('sendMessage failed for type ' + (payload.type || 'unknown') + ':', e && e.message);
    }
  }

  function getRoot() {
    return document.querySelector(
      '.website-chat-client-body[role="log"], [role="log"], main [role="main"], #app > [data-testid*="chat"], #chat-container, [data-app-root]'
    ) || document.body;
  }

  function firstText(root, selectors) {
    for (let i = 0; i < selectors.length; i++) {
      let el = null;
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

  function extractChatContext() {
    const root = getRoot();
    const collectedSet = new Set();
    MESSAGE_SELECTORS.forEach(function (sel) {
      try { root.querySelectorAll(sel).forEach(function (n) { collectedSet.add(n); }); } catch (_) {}
    });
    const collected = Array.from(collectedSet);
    const nodes = collected.filter(function (n) {
      const excluded = MESSAGE_EXCLUDE.some(function (sel) {
        try { return n.matches(sel) || n.closest(sel); } catch (_) { return false; }
      });
      if (excluded) return false;
      return !collected.some(function (m) { return m !== n && n.contains(m); });
    });
    const messages = nodes.map(function (el) {
      let sender = firstText(el, SENDER_SELECTORS);
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
      return { sender: sender || null, text: text, time: time || null };
    }).filter(function (m) { return !!m.text; });
    const activeGuest = firstText(root, ['.active-guest-name', '.conversation-guest', '[data-test="active-guest"]', '.website-chat-client-header .author', '[data-testid*="guest-name" i]']);
    let conversationEl = null;
    try { conversationEl = root.querySelector('[data-conversation-id]'); } catch (_) {}
    const conversationId = conversationEl ? conversationEl.getAttribute('data-conversation-id') : null;
    if (DEBUG) {
      log('messages:', messages.length, 'activeGuest:', activeGuest, 'samples:', messages.slice(0, 3));
      logDiscovery(root);
    }
    return { messages: messages, activeGuest: activeGuest || '', conversationId: conversationId || '' };
  }

  function validateContext(ctx) {
    if (!ctx || typeof ctx !== 'object') throw new Error('Context must be an object');
    if (!Array.isArray(ctx.messages)) throw new Error('messages must be an array');
    ctx.messages.forEach(function(m, index) {
      if (!m || typeof m !== 'object') throw new Error('Message at index ' + index + ' must be an object');
      if (typeof m.text !== 'string') throw new Error('Message at index ' + index + ': text must be a string');
      if (m.sender !== null && typeof m.sender !== 'string') throw new Error('Message at index ' + index + ': sender must be string or null');
      if (m.time !== null && typeof m.time !== 'string') throw new Error('Message at index ' + index + ': time must be string or null');
    });
    if (typeof ctx.activeGuest !== 'string') throw new Error('activeGuest must be a string');
    if (typeof ctx.conversationId !== 'string') throw new Error('conversationId must be a string');
    return ctx;
  }

  function hasContext(ctx) { return ctx.messages.length > 0 || !!ctx.activeGuest; }

  function sendChatContext() {
    try { const ctx = extractChatContext(); validateContext(ctx); if (hasContext(ctx)) safeSend({ type: 'CHAT_CONTEXT_UPDATED', data: ctx }); }
    catch (e) { warn('sendChatContext failed:', e && e.message); }
  }

  function logDiscovery(root) {
    if (!DEBUG) return;
    const probes = {
      'message-containers': ['.message-item', '.chat-message', '[data-test="message"]', '[data-testid*="message" i]', '[class*="bubble" i]', '[class*="msg" i]'],
      'sender-like': ['[class*="sender" i]', '[data-testid*="sender" i]', '[class*="author" i]', '[class*="from" i]'],
      'composer-like': ['textarea', 'input[type="text"]', '[contenteditable="true"]', '[class*="input" i]', '[class*="composer" i]', '[class*="reply" i]']
    };
    Object.keys(probes).forEach(function (label) {
      let total = 0, samples = [];
      probes[label].forEach(function (sel) {
        let n = 0; try { n = root.querySelectorAll(sel).length; } catch (_) {}
        if (n) { total += n; if (samples.length < 5) samples.push(sel + '(' + n + ')'); }
      });
      log('discovery[' + label + ']: ' + (total || 'none') + (samples.length ? ' -> ' + samples.join(' | ') : ''));
    });
  }

  function findComposer() {
    for (let i = 0; i < COMPOSER_SELECTORS.length; i++) {
      let el = null; try { el = document.querySelector(COMPOSER_SELECTORS[i]); } catch (_) {}
      if (el) return el;
    }
    return null;
  }

  function injectMessage(text) {
    if (!text || typeof text !== 'string') { warn('inject: invalid text input, must be a non-empty string'); return false; }
    if (text.length > 10000) { warn('inject: text too long, truncating to 10000 characters'); text = text.substring(0, 10000); }
    const el = findComposer();
    if (!el) { warn('inject: composer not found'); return false; }
    try {
      if (el.isContentEditable) {
        el.focus(); const before = el.textContent; let ok = false;
        try { const s = document.execCommand('selectAll', false, null); const i = document.execCommand('insertText', false, text); ok = !!(s && i); }
        catch (_) { ok = false; }
        if (!ok || el.textContent === before) el.textContent = text;
        const InputEventCtor = window.InputEvent;
        const evt = InputEventCtor ? new InputEventCtor('input', { bubbles: true, inputType: 'insertText', data: text }) : new Event('input', { bubbles: true });
        el.dispatchEvent(evt); el.dispatchEvent(new Event('change', { bubbles: true })); return true;
      }
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLInputElement ? HTMLInputElement.prototype : null;
      if (proto) { const desc = Object.getOwnPropertyDescriptor(proto, 'value'); if (desc && desc.set) desc.set.call(el, text); else el.value = text; }
      else { el.value = text; }
      const InputEventCtor2 = window.InputEvent;
      const evt2 = InputEventCtor2 ? new InputEventCtor2('input', { bubbles: true, inputType: 'insertText', data: text }) : new Event('input', { bubbles: true });
      el.dispatchEvent(evt2); el.dispatchEvent(new Event('change', { bubbles: true })); el.focus(); return true;
    } catch (e) { warn('inject failed:', e && e.message); return false; }
  }

  function scheduleCapture() { if (pending) clearTimeout(pending); pending = setTimeout(function () { pending = null; sendChatContext(); }, MUTATION_DEBOUNCE_MS); }

  function setupObserver() {
    if (observer) { try { observer.disconnect(); } catch (_) {} }
    observer = new MutationObserver(function () { scheduleCapture(); });
    if (document.body) { try { observer.observe(document.body, { childList: true, subtree: true }); } catch (e) { warn('observe failed:', e && e.message); } }
  }

  function init() {
    initDebugMode(); setupObserver();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sendChatContext);
    else sendChatContext();
    if (window.addEventListener) window.addEventListener('beforeunload', function() { if (observer) { try { observer.disconnect(); } catch (_) {} observer = null; } });
  }

  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (message.type === 'GET_CHAT_CONTEXT') {
      try { const ctx = extractChatContext(); validateContext(ctx); sendResponse({ data: ctx }); }
      catch (e) { warn('GET_CHAT_CONTEXT failed:', e && e.message); sendResponse({ data: { messages: [], activeGuest: '', conversationId: '' } }); }
      return false;
    }
    if (message.type === 'INJECT_MESSAGE') { sendResponse({ success: injectMessage(message.text) }); return false; }
  });

  init();
})();