// Content script for Akia guest messaging platform
// Captures active chat context and injects drafted messages into the composer.
//
// Hardened: multi-strategy selectors with ancestor-dedup, contenteditable
// injection, a try/catch guard so a reloaded extension never crashes the
// observer, a 300ms debounced MutationObserver, and an optional debug-discovery
// mode. Enable debug by running  localStorage.setItem('fdao-debug','1')  in the
// Akia tab and watch the console for what was found.

(function () {
  'use strict';

  var DEBUG = false;
  try { DEBUG = localStorage.getItem('fdao-debug') === '1'; } catch (_) {}
  function log() { if (DEBUG) console.log.apply(console, ['[FDAO/akia]'].concat([].slice.call(arguments))); }
  function warn() { if (DEBUG) console.warn.apply(console, ['[FDAO/akia]'].concat([].slice.call(arguments))); }

  function safeSend(payload) {
    try { chrome.runtime.sendMessage(payload); }
    catch (e) { warn('sendMessage failed:', e && e.message); }
  }

  function getRoot() {
    return document.querySelector('main, [role="main"], #app, [data-app-root]') || document.body;
  }

  function firstText(root, selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var el = null;
      try { el = root.querySelector(selectors[i]); } catch (_) {}
      if (el) {
        var t = (el.innerText || el.textContent || '').trim();
        if (t) return t;
      }
    }
    return null;
  }

  var MESSAGE_SELECTORS = ['.message-item', '.chat-message', '[data-test="message"]', '[data-testid*="message-item" i]', '[data-testid*="message-row" i]', '[data-testid*="message-bubble" i]'];
  var SENDER_SELECTORS = ['.sender-name', '.message-sender', '[data-test="sender"]', '[data-testid*="sender" i]'];
  var TEXT_SELECTORS = ['.message-text', '.message-body', '[data-test="message-text"]'];
  var TIME_SELECTORS = ['.message-time', '.timestamp', '[data-test="timestamp"]', 'time'];

  function extractChatContext() {
    var root = getRoot();

    // Gather candidate message nodes from every strategy, then keep only the
    // leaf-most ones so a list wrapper doesn't double as a "message".
    var collected = [];
    MESSAGE_SELECTORS.forEach(function (sel) {
      try {
        root.querySelectorAll(sel).forEach(function (n) { collected.push(n); });
      } catch (_) {}
    });
    var nodes = collected.filter(function (n) {
      return !collected.some(function (m) { return m !== n && n.contains(m); });
    });

    var messages = nodes.map(function (el) {
      var sender = firstText(el, SENDER_SELECTORS) || firstText(el.parentElement, SENDER_SELECTORS);
      var text = firstText(el, TEXT_SELECTORS) || (el.innerText || el.textContent || '').trim();
      var time = firstText(el, TIME_SELECTORS);
      return { sender: sender || null, text: text, time: time || null };
    }).filter(function (m) { return !!m.text; });

    var activeGuest = firstText(root, ['.active-guest-name', '.conversation-guest', '[data-test="active-guest"]', '[data-testid*="guest-name" i]']);
    var conversationEl = root.querySelector('[data-conversation-id]');
    var conversationId = conversationEl ? conversationEl.getAttribute('data-conversation-id') : null;

    if (DEBUG) {
      log('messages:', messages.length, 'activeGuest:', activeGuest, 'samples:', messages.slice(0, 3));
      logDiscovery(root);
    }
    return { messages: messages, activeGuest: activeGuest, conversationId: conversationId };
  }

  // Debug discovery: probe broad selector families and log counts so the real
  // Akia selectors can be pinned down from a logged-in tab.
  function logDiscovery(root) {
    if (!DEBUG) return;
    var probes = {
      'message-containers': ['.message-item', '.chat-message', '[data-test="message"]', '[data-testid*="message" i]', '[class*="bubble" i]', '[class*="msg" i]'],
      'sender-like': ['[class*="sender" i]', '[data-testid*="sender" i]', '[class*="author" i]', '[class*="from" i]'],
      'composer-like': ['textarea', 'input[type="text"]', '[contenteditable="true"]', '[class*="input" i]', '[class*="composer" i]', '[class*="reply" i]']
    };
    Object.keys(probes).forEach(function (label) {
      var total = 0, samples = [];
      probes[label].forEach(function (sel) {
        var n = 0; try { n = root.querySelectorAll(sel).length; } catch (_) {}
        if (n) { total += n; if (samples.length < 5) samples.push(sel + '(' + n + ')'); }
      });
      log('discovery[' + label + ']: ' + (total || 'none') + (samples.length ? ' -> ' + samples.join(' | ') : ''));
    });
  }

  function hasContext(ctx) { return ctx.messages.length > 0 || !!ctx.activeGuest; }

  function sendChatContext() {
    var ctx = extractChatContext();
    if (hasContext(ctx)) safeSend({ type: 'CHAT_CONTEXT_UPDATED', data: ctx });
  }

  // --- Message injection: textarea, input, or contenteditable ---
  var COMPOSER_SELECTORS = [
    'textarea.message-input', 'input.message-input', '[data-test="message-input"]',
    '.chat-input textarea',
    'textarea[placeholder*="message" i]', 'textarea[placeholder*="reply" i]', 'textarea[placeholder*="type" i]',
    '[contenteditable="true"]'
  ];

  function findComposer() {
    for (var i = 0; i < COMPOSER_SELECTORS.length; i++) {
      var el = null;
      try { el = document.querySelector(COMPOSER_SELECTORS[i]); } catch (_) {}
      if (el) return el;
    }
    return null;
  }

  function injectMessage(text) {
    var el = findComposer();
    if (!el) { warn('inject: composer not found'); return false; }

    try {
      if (el.isContentEditable) {
        el.focus();
        var before = el.textContent;
        var ok = false;
        // execCommand is deprecated but still the most reliable way to write
        // into a rich editor while preserving undo history. Fall back to a
        // direct textContent write if it is missing or did nothing.
        try {
          var s = document.execCommand('selectAll', false, null);
          var i = document.execCommand('insertText', false, text);
          ok = !!(s && i);
        } catch (_) { ok = false; }
        if (!ok || el.textContent === before) el.textContent = text;
        var InputEventCtor = window.InputEvent;
        var evt = InputEventCtor
          ? new InputEventCtor('input', { bubbles: true, inputType: 'insertText', data: text })
          : new Event('input', { bubbles: true });
        el.dispatchEvent(evt);
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      // React/Vue controlled inputs need the native setter so the framework
      // sees the change, not just a DOM property write.
      var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
        : el instanceof HTMLInputElement ? HTMLInputElement.prototype : null;
      if (proto) {
        var desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) desc.set.call(el, text);
        else el.value = text;
      } else {
        el.value = text;
      }
      var InputEventCtor2 = window.InputEvent;
      var evt2 = InputEventCtor2
        ? new InputEventCtor2('input', { bubbles: true, inputType: 'insertText', data: text })
        : new Event('input', { bubbles: true });
      el.dispatchEvent(evt2);
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.focus();
      return true;
    } catch (e) { warn('inject failed:', e && e.message); return false; }
  }

  // Initial capture.
  sendChatContext();

  // Debounced re-capture on DOM changes (new messages arriving).
  var MUTATION_DEBOUNCE_MS = 300;
  var pending = null;
  function scheduleCapture() {
    if (pending) clearTimeout(pending);
    pending = setTimeout(function () { pending = null; sendChatContext(); }, MUTATION_DEBOUNCE_MS);
  }
  var observer = new MutationObserver(function () { scheduleCapture(); });
  if (document.body) {
    try { observer.observe(document.body, { childList: true, subtree: true }); }
    catch (e) { warn('observe failed:', e && e.message); }
  }

  // Respond to the side panel.
  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (message.type === 'GET_CHAT_CONTEXT') {
      sendResponse({ data: extractChatContext() });
      return false;
    }
    if (message.type === 'INJECT_MESSAGE') {
      sendResponse({ success: injectMessage(message.text) });
      return false;
    }
  });
})();
