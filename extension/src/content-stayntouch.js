// Content script for Stayntouch PMS
// Extracts guest/reservation data from the reservation page DOM.
//
// Hardened: multi-strategy selectors + a scoped label-based fallback, a
// try/catch guard so a reloaded extension never crashes the observer, a
// 300ms debounced MutationObserver, and an optional debug-discovery mode.
//
// The exact Stayntouch selectors are not knowable without a logged-in page
// snapshot, so extraction is "best-effort + discovery-ready": enable debug
// by setting chrome.storage.local fdao-debug to true, then watch the console
// for what was found and the candidate selectors.

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
      if (DEBUG) console.log('[FDAO/stayntouch] Debug mode enabled');
    }

    getLocalStorageValue(['fdao-debug'], applyResult);
  }

  function log(message, data) {
    if (DEBUG) {
      if (data !== undefined) console.log('[FDAO/stayntouch]', message, data);
      else console.log('[FDAO/stayntouch]', message);
    }
  }

  function warn(message, data) {
    if (DEBUG) {
      if (data !== undefined) console.warn('[FDAO/stayntouch]', message, data);
      else console.warn('[FDAO/stayntouch]', message);
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
    }
    catch (e) { warn('sendMessage failed for type ' + (payload.type || 'unknown') + ':', e && e.message); }
  }

  function getRoot() {
    return document.querySelector('main, [role="main"], #app, [data-app-root]') || document.body;
  }

  function firstText(root, selectors) {
    for (let i = 0; i < selectors.length; i++) {
      let el = null; try { el = root.querySelector(selectors[i]); } catch (_) {}
      if (el) { const t = sanitizeText(el.innerText || el.textContent || ''); if (t) return t; }
    }
    return null;
  }

  function normalize(s) { return (s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

  const GUEST_SELECTORS = {
    guestName: ['[data-test="guest-name"]', '.guest-name', '.guest-name-value', '#guest-name', '[data-testid*="guest-name" i]', '[data-testid*="name" i]'],
    roomNumber: ['[data-test="room-number"]', '.room-number', '.room-num', '#room-number', '[data-testid*="room" i]'],
    checkIn: ['[data-test="arrival-date"]', '[data-test="check-in"]', '.arrival-date', '.check-in-date', '#arrival-date', '[data-testid*="arrival" i]', '[data-testid*="check-in" i]', '[data-testid*="checkin" i]'],
    checkOut: ['[data-test="departure-date"]', '[data-test="check-out"]', '.departure-date', '.check-out-date', '#departure-date', '[data-testid*="departure" i]', '[data-testid*="check-out" i]', '[data-testid*="checkout" i]'],
    confirmationNumber: ['[data-test="confirmation-number"]', '.confirmation-number', '.confirmation', '#confirmation', '#confirmation-number', '[data-testid*="confirmation" i]', '[data-testid*="conf" i]'],
    reservationStatus: ['[data-test="reservation-status"]', '[data-test="status"]', '.reservation-status', '.status', '#status', '[data-testid*="reservation-status" i]', '[data-testid*="status" i]']
  };

  function findByLabel(root, patterns) {
    const nodes = root.querySelectorAll('label, dt, .label, .field-label, [class*="label" i]');
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]; const own = normalize(node.innerText || node.textContent || '');
      if (!own || own.length > 30) continue;
      let matched = false; for (let p = 0; p < patterns.length; p++) {
        const pattern = patterns[p].toLowerCase();
        if (own === pattern || own.indexOf(pattern + ' ') === 0 || own.indexOf(pattern + ':') === 0) { matched = true; break; }
      }
      if (!matched) continue;
      let valueEl = node.nextElementSibling;
      if (!valueEl || valueEl === node) {
        const parent = node.parentElement;
        if (parent) {
          const parentClasses = (parent.className || '').toLowerCase();
          if (parentClasses.includes('field') || parentClasses.includes('row') || parentClasses.includes('item')) {
            valueEl = parent.querySelector('.value, [data-value], .field-value');
          }
        }
      }
      if (valueEl && valueEl !== node) { const v = sanitizeText(valueEl.innerText || valueEl.textContent || ''); if (v && normalize(v) !== own) return v; }
    }
    return null;
  }

  function extractGuestInfo() {
    const root = getRoot(); const info = {};
    for (const [field, selectors] of Object.entries(GUEST_SELECTORS)) info[field] = firstText(root, selectors);
    if (!info.guestName) info.guestName = findByLabel(root, ['name', 'guest name', 'guest']);
    if (!info.roomNumber) info.roomNumber = findByLabel(root, ['room', 'room number', 'room #']);
    if (!info.checkIn) info.checkIn = findByLabel(root, ['arrival', 'check in', 'check-in', 'arrive']);
    if (!info.checkOut) info.checkOut = findByLabel(root, ['departure', 'check out', 'check-out', 'depart']);
    if (!info.confirmationNumber) info.confirmationNumber = findByLabel(root, ['confirmation', 'conf', 'confirmation #', 'reservation #']);
    if (!info.reservationStatus) info.reservationStatus = findByLabel(root, ['status', 'reservation status']);
    for (const [field] of Object.entries(GUEST_SELECTORS)) if (info[field] === null || info[field] === undefined) info[field] = '';
    if (DEBUG) { log('extracted guest info:', info); logDiscovery(root); }
    return info;
  }

  function validateGuestInfo(info) {
    if (!info || typeof info !== 'object') throw new Error('Guest info must be an object');
    const requiredFields = ['guestName', 'roomNumber', 'checkIn', 'checkOut', 'confirmationNumber', 'reservationStatus'];
    for (const field of requiredFields) if (typeof info[field] !== 'string') throw new Error(field + ' must be a string');
    return info;
  }

  function hasGuestInfo(info) { return Object.values(info).some(function(v) { return !!v; }); }

  function sendGuestInfo() {
    try { const info = extractGuestInfo(); validateGuestInfo(info); if (hasGuestInfo(info)) safeSend({ type: 'GUEST_INFO_UPDATED', data: info }); }
    catch (e) { warn('sendGuestInfo failed:', e && e.message); }
  }

  function logDiscovery(root) {
    if (!DEBUG) return;
    const probes = {
      'guest-fields': ['[data-test*="guest" i]', '[data-test*="name" i]', '[class*="guest" i]', '[class*="name" i]'],
      'room-fields': ['[data-test*="room" i]', '[class*="room" i]'],
      'date-fields': ['[data-test*="date" i]', '[data-test*="arrival" i]', '[data-test*="departure" i]', '[class*="date" i]'],
      'confirmation-fields': ['[data-test*="confirmation" i]', '[data-test*="conf" i]', '[class*="confirmation" i]'],
      'status-fields': ['[data-test*="status" i]', '[class*="status" i]'],
      'label-like': ['label', 'dt', '.label', '.field-label', '[class*="label" i]']
    };
    Object.keys(probes).forEach(function (label) {
      let total = 0, samples = [];
      probes[label].forEach(function (sel) { let n = 0; try { n = root.querySelectorAll(sel).length; } catch (_) {} if (n) { total += n; if (samples.length < 5) samples.push(sel + '(' + n + ')'); } });
      log('discovery[' + label + ']: ' + (total || 'none') + (samples.length ? ' -> ' + samples.join(' | ') : ''));
    });
  }

  function scheduleCapture() { if (pending) clearTimeout(pending); pending = setTimeout(function () { pending = null; sendGuestInfo(); }, MUTATION_DEBOUNCE_MS); }

  function setupObserver() {
    if (observer) { try { observer.disconnect(); } catch (_) {} }
    observer = new MutationObserver(function () { scheduleCapture(); });
    if (document.body) { try { observer.observe(document.body, { childList: true, subtree: true }); } catch (e) { warn('observe failed:', e && e.message); } }
  }

  function init() {
    initDebugMode(); setupObserver();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sendGuestInfo);
    else sendGuestInfo();
    if (window.addEventListener) window.addEventListener('beforeunload', function() { if (observer) { try { observer.disconnect(); } catch (_) {} observer = null; } });
  }

  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (message.type === 'GET_GUEST_INFO') {
      try { const info = extractGuestInfo(); validateGuestInfo(info); sendResponse({ data: info }); }
      catch (e) { warn('GET_GUEST_INFO failed:', e && e.message); sendResponse({ data: { guestName: '', roomNumber: '', checkIn: '', checkOut: '', confirmationNumber: '', reservationStatus: '' } }); }
      return false;
    }
  });

  init();
})();