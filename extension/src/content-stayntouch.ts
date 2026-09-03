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

import { logger, initDebugMode } from './utils/logger';

interface GuestInfo {
  guestName: string;
  roomNumber: string;
  checkIn: string;
  checkOut: string;
  confirmationNumber: string;
  reservationStatus: string;
}

(function () {
  'use strict';

  let observer: MutationObserver | null = null;
  let pending: ReturnType<typeof setTimeout> | null = null;

  const MUTATION_DEBOUNCE_MS = 300;

  // Initialize logger with debug mode from storage
  const log = createLogger('FDAO/stayntouch');
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
    return document.querySelector('main, [role="main"], #app, [data-app-root]') || document.body;
  }

  function firstText(root: Element, selectors: string[]): string | null {
    for (let i = 0; i < selectors.length; i++) {
      let el: Element | null = null; try { el = root.querySelector(selectors[i]); } catch (_) {}
      if (el) { const t = (el.innerText || el.textContent || '').trim(); if (t) return t; }
    }
    return null;
  }

  function textForLabel(root: Element, labelText: string): string | null {
    try {
      const labels = root.querySelectorAll('label');
      for (let i = 0; i < labels.length; i++) {
        const label = labels[i];
        const text = (label.textContent || '').trim().toLowerCase();
        if (text.includes(labelText.toLowerCase())) {
          const inputId = label.getAttribute('for');
          if (inputId) {
            const input = root.querySelector('#' + inputId);
            if (input && 'value' in (input as HTMLInputElement)) {
              return (input as HTMLInputElement).value;
            }
          }
          // Look for input inside label or next sibling
          const input = label.querySelector('input, select, textarea');
          if (input && 'value' in (input as HTMLInputElement)) {
            return (input as HTMLInputElement).value;
          }
        }
      }
    } catch (_) {}
    return null;
  }

  function extractGuestInfo(): GuestInfo {
    const root = getRoot();
    const guestName = 
      firstText(root, [
        '.guest-name',
        '.guestName',
        '#guestName',
        '[data-test="guest-name"]',
        '[data-testid*="guest-name" i]',
        '[name*="guest" i]',
        '[name*="name" i]',
        '[id*="guest" i]',
        '[id*="name" i]'
      ]) ||
      textForLabel(root, 'Guest Name') ||
      textForLabel(root, 'Name') ||
      '';

    const roomNumber = 
      firstText(root, [
        '.room-number',
        '.roomNumber',
        '#roomNumber',
        '[data-test="room-number"]',
        '[data-testid*="room-number" i]',
        '[name*="room" i]',
        '[id*="room" i]'
      ]) ||
      textForLabel(root, 'Room Number') ||
      textForLabel(root, 'Room') ||
      '';

    const checkIn = 
      firstText(root, [
        '.check-in',
        '.checkIn',
        '#checkIn',
        '[data-test="check-in"]',
        '[data-testid*="check-in" i]',
        '[name*="checkin" i]',
        '[name*="check-in" i]',
        '[id*="checkin" i]',
        '[id*="check-in" i]'
      ]) ||
      textForLabel(root, 'Check In') ||
      textForLabel(root, 'Arrival') ||
      '';

    const checkOut = 
      firstText(root, [
        '.check-out',
        '.checkOut',
        '#checkOut',
        '[data-test="check-out"]',
        '[data-testid*="check-out" i]',
        '[name*="checkout" i]',
        '[name*="check-out" i]',
        '[id*="checkout" i]',
        '[id*="check-out" i]'
      ]) ||
      textForLabel(root, 'Check Out') ||
      textForLabel(root, 'Departure') ||
      '';

    const confirmationNumber = 
      firstText(root, [
        '.confirmation-number',
        '.confirmationNumber',
        '#confirmationNumber',
        '[data-test="confirmation-number"]',
        '[data-testid*="confirmation" i]',
        '[name*="confirmation" i]',
        '[name*="confirm" i]',
        '[id*="confirmation" i]',
        '[id*="confirm" i]'
      ]) ||
      textForLabel(root, 'Confirmation Number') ||
      textForLabel(root, 'Confirmation') ||
      '';

    const reservationStatus = 
      firstText(root, [
        '.reservation-status',
        '.reservationStatus',
        '#reservationStatus',
        '[data-test="reservation-status"]',
        '[data-testid*="status" i]',
        '[name*="status" i]',
        '[id*="status" i]'
      ]) ||
      textForLabel(root, 'Status') ||
      '';

    const info = {
      guestName,
      roomNumber,
      checkIn,
      checkOut,
      confirmationNumber,
      reservationStatus
    };

    log.log('extracted guest info:', info);
    logDiscovery(root);

    return info;
  }

  function validateGuestInfo(info: unknown): GuestInfo {
    const validated = info as GuestInfo;
    if (!validated || typeof validated !== 'object') throw new Error('Guest info must be an object');
    const required: (keyof GuestInfo)[] = ['guestName', 'roomNumber', 'checkIn', 'checkOut', 'confirmationNumber', 'reservationStatus'];
    required.forEach(function (key) {
      if (validated[key] !== undefined && typeof validated[key] !== 'string') {
        throw new Error(key + ' must be a string');
      }
    });
    return validated;
  }

  function hasGuestInfo(info: GuestInfo): boolean {
    return Object.values(info).some(function (v) { return !!v; });
  }

  function sendGuestInfo(): void {
    try {
      const info = extractGuestInfo();
      validateGuestInfo(info);
      if (hasGuestInfo(info)) safeSend({ type: 'GUEST_INFO_UPDATED', data: info });
    } catch (e: unknown) {
      log.warn('sendGuestInfo failed:', (e as Error)?.message);
    }
  }

  function logDiscovery(root: Element): void {
    const probes: Record<string, string[]> = {
      'guest-like': ['[class*="guest" i]', '[data-test*="guest" i]', '[name*="guest" i]', '[id*="guest" i]'],
      'room-like': ['[class*="room" i]', '[data-test*="room" i]', '[name*="room" i]', '[id*="room" i]'],
      'date-like': ['[class*="date" i]', '[data-test*="date" i]', '[name*="date" i]', '[id*="date" i]', '[type="date"]'],
      'confirmation-like': ['[class*="confirmation" i]', '[data-test*="confirmation" i]', '[name*="confirmation" i]', '[id*="confirmation" i]'],
      'status-like': ['[class*="status" i]', '[data-test*="status" i]', '[name*="status" i]', '[id*="status" i]'],
      'label-like': ['label']
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

  function scheduleCapture(): void {
    if (pending) clearTimeout(pending);
    pending = setTimeout(function () { pending = null; sendGuestInfo(); }, MUTATION_DEBOUNCE_MS);
  }

  function setupObserver(): void {
    if (observer) { try { observer.disconnect(); } catch (_) {} }
    observer = new MutationObserver(function () { scheduleCapture(); });
    if (document.body) { try { observer.observe(document.body, { childList: true, subtree: true }); } catch (e: unknown) { log.warn('observe failed:', (e as Error)?.message); } }
  }

  function init(): void {
    setupObserver();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', sendGuestInfo);
    } else {
      sendGuestInfo();
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

  chrome.runtime.onMessage.addListener(function (message: { type: string }, _sender: unknown, sendResponse: (response: { data?: GuestInfo }) => void) {
    if (message.type === 'GET_GUEST_INFO') {
      try {
        const info = extractGuestInfo();
        validateGuestInfo(info);
        sendResponse({ data: info });
      } catch (e: unknown) {
        log.warn('GET_GUEST_INFO failed:', (e as Error)?.message);
        sendResponse({ data: { guestName: '', roomNumber: '', checkIn: '', checkOut: '', confirmationNumber: '', reservationStatus: '' } });
      }
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
