// Content script for Stayntouch PMS
// Extracts guest/reservation data from the reservation page DOM.
//
// Hardened: multi-strategy selectors + a scoped label-based fallback, a
// try/catch guard so a reloaded extension never crashes the observer, a
// 300ms debounced MutationObserver, and an optional debug-discovery mode.
//
// The exact Stayntouch selectors are not knowable without a logged-in page
// snapshot, so extraction is "best-effort + discovery-ready": enable debug
// by running  localStorage.setItem('fdao-debug','1')  in the Stayntouch tab,
// then watch the console for what was found and the candidate selectors.

(function () {
  'use strict';

  var DEBUG = false;
  try { DEBUG = localStorage.getItem('fdao-debug') === '1'; } catch (_) {}
  function log() { if (DEBUG) console.log.apply(console, ['[FDAO/stayntouch]'].concat([].slice.call(arguments))); }
  function warn() { if (DEBUG) console.warn.apply(console, ['[FDAO/stayntouch]'].concat([].slice.call(arguments))); }

  // Safe runtime message — chrome.runtime.sendMessage throws synchronously
  // ("Extension context invalidated") after the extension is reloaded. We
  // catch that so the observer never dies mid-session.
  function safeSend(payload) {
    try { chrome.runtime.sendMessage(payload); }
    catch (e) { warn('sendMessage failed:', e && e.message); }
  }

  // Scope queries to the app shell when the SPA exposes one, so we don't scrape
  // nav bars, toasts, or modals.
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

  function normalize(s) { return (s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

  // Label -> value heuristic for PMS "label: value" layouts. Only fires when a
  // structured label element is present, and only matches short, exact-ish
  // labels, to avoid grabbing page chrome.
  function findByLabel(root, patterns) {
    var nodes = root.querySelectorAll('label, dt, .label, .field-label, [class*="label" i]');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var own = normalize(node.innerText || node.textContent || '');
      if (!own || own.length > 30) continue;
      var matched = false;
      for (var p = 0; p < patterns.length; p++) {
        if (own === patterns[p] || own.indexOf(patterns[p] + ' ') === 0 || own.indexOf(patterns[p] + ':') === 0) { matched = true; break; }
      }
      if (!matched) continue;
      // Value is the next sibling, or a sibling/child "value" node.
      var valueEl = node.nextElementSibling
        || (node.parentElement && node.parentElement.querySelector('.value, [data-value]'));
      if (valueEl && valueEl !== node) {
        var v = (valueEl.innerText || valueEl.textContent || '').trim();
        if (v && normalize(v) !== own) return v;
      }
    }
    return null;
  }

  var GUEST_SELECTORS = {
    guestName: ['[data-test="guest-name"]', '.guest-name', '.reservation-guest-name', '[data-testid*="guest-name" i]', '[data-testid*="guestname" i]'],
    roomNumber: ['[data-test="room-number"]', '.room-number', '.reservation-room', '[data-testid*="room" i]'],
    checkIn: ['[data-test="check-in"]', '.check-in-date', '.arrival-date', '[data-testid*="arrival" i]', '[data-testid*="check-in" i]'],
    checkOut: ['[data-test="check-out"]', '.check-out-date', '.departure-date', '[data-testid*="departure" i]', '[data-testid*="check-out" i]'],
    reservationStatus: ['[data-test="reservation-status"]', '.reservation-status', '.status-badge', '[data-testid*="status" i]'],
    confirmationNumber: ['[data-test="confirmation-number"]', '.confirmation-number', '[data-testid*="confirmation" i]']
  };

  var GUEST_LABELS = {
    guestName: ['guest name', 'guest'],
    roomNumber: ['room no', 'room #', 'room number', 'room'],
    checkIn: ['check-in', 'check in', 'arrival'],
    checkOut: ['check-out', 'check out', 'departure'],
    reservationStatus: ['reservation status', 'status'],
    confirmationNumber: ['confirmation #', 'confirmation number', 'confirmation', 'confirm #']
  };

  function extractGuestInfo() {
    var root = getRoot();
    var data = {};
    Object.keys(GUEST_SELECTORS).forEach(function (field) {
      data[field] = firstText(root, GUEST_SELECTORS[field]) || findByLabel(root, GUEST_LABELS[field]);
    });
    if (DEBUG) {
      log('root:', root === document.body ? 'body' : root.tagName, 'children:', root.children.length);
      log('extracted:', JSON.parse(JSON.stringify(data)));
      logDiscovery(root);
    }
    return data;
  }

  // Debug discovery: probe broad selector families and log counts + samples so
  // the real Stayntouch selectors can be pinned down from a logged-in tab.
  function logDiscovery(root) {
    if (!DEBUG) return;
    var probes = {
      'guest-name-like': ['[data-test*="guest" i]', '[data-testid*="guest" i]', '[class*="guest" i]', '[class*="guest-name" i]', 'h1', 'h2', 'h3', 'dt', 'label'],
      'room-like': ['[data-test*="room" i]', '[data-testid*="room" i]', '[class*="room" i]'],
      'date-like': ['[data-testid*="date" i]', '[class*="date" i]', '[class*="arrival" i]', '[class*="departure" i]'],
      'confirmation-like': ['[data-testid*="conf" i]', '[class*="confirm" i]'],
      'status-like': ['[data-testid*="status" i]', '[class*="status" i]']
    };
    Object.keys(probes).forEach(function (label) {
      var total = 0, samples = [];
      probes[label].forEach(function (sel) {
        var n = 0; try { n = root.querySelectorAll(sel).length; } catch (_) {}
        if (n) {
          total += n;
          if (samples.length < 4) { var el = null; try { el = root.querySelector(sel); } catch (_) {} if (el) samples.push(sel + ' => ' + (el.textContent || '').trim().slice(0, 40)); }
        }
      });
      log('discovery[' + label + ']: ' + (total || 'none') + (samples.length ? ' -> ' + samples.join(' | ') : ''));
    });
  }

  function hasData(info) { return Object.keys(info).some(function (k) { return !!info[k]; }); }

  function sendGuestInfo() {
    var info = extractGuestInfo();
    if (hasData(info)) safeSend({ type: 'GUEST_INFO_UPDATED', data: info });
  }

  // Initial extraction (script runs at document_idle).
  sendGuestInfo();

  // Debounced re-extraction on DOM changes (SPA navigation / late hydration).
  var MUTATION_DEBOUNCE_MS = 300;
  var pending = null;
  function scheduleExtract() {
    if (pending) clearTimeout(pending);
    pending = setTimeout(function () { pending = null; sendGuestInfo(); }, MUTATION_DEBOUNCE_MS);
  }
  var observer = new MutationObserver(function () { scheduleExtract(); });
  if (document.body) {
    try { observer.observe(document.body, { childList: true, subtree: true }); }
    catch (e) { warn('observe failed:', e && e.message); }
  }

  // Respond to pull requests from the side panel.
  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (message.type === 'GET_GUEST_INFO') {
      sendResponse({ data: extractGuestInfo() });
      return false; // synchronous response
    }
  });
})();
