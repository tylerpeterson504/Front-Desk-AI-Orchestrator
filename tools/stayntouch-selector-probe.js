/* ===========================================================================
   FDAO selector probe — Stayntouch PMS  (app.us1.stayntouch.com)

   HOW TO USE
   1. Open a reservation / guest detail page in Stayntouch (one where you can
      see the guest name, room number, and arrival/departure dates).
   2. Open DevTools (F12 or Cmd+Opt+I) -> Console tab.
   3. If Chrome asks you to type "allow pasting", do that first.
   4. Paste this whole file, press Enter.
   5. Copy the final REPORT block and send it back.

   Reads only. Changes nothing, sends nothing, types nothing.
   =========================================================================== */
(function () {
  'use strict';

  var out = [];
  function say(s) { out.push(s); }
  function clean(s) { return (s || '').replace(/\s+/g, ' ').trim().slice(0, 60); }

  function selectorFor(el) {
    if (!el || el === document.body) return 'body';
    if (el.getAttribute && el.getAttribute('data-testid')) return '[data-testid="' + el.getAttribute('data-testid') + '"]';
    if (el.getAttribute && el.getAttribute('data-test')) return '[data-test="' + el.getAttribute('data-test') + '"]';
    var tag = el.tagName.toLowerCase();
    var cls = (el.className && typeof el.className === 'string')
      ? el.className.trim().split(/\s+/).filter(function (c) {
          return c.length > 2 && c.length < 30 && !/^[a-z]{1,3}-?\d+$/.test(c) && !/^(css|sc|jsx)-/.test(c);
        }).slice(0, 3)
      : [];
    return tag + (cls.length ? '.' + cls.join('.') : '');
  }

  function probe(label, selectors) {
    say('');
    say('## ' + label);
    var any = false;
    selectors.forEach(function (sel) {
      var n = 0, first = null;
      try { var m = document.querySelectorAll(sel); n = m.length; first = m[0]; } catch (_) { return; }
      if (!n) return;
      any = true;
      say('  ' + sel + '  -> ' + n + (first ? '   e.g. "' + clean(first.textContent) + '"' : ''));
    });
    if (!any) say('  (no matches)');
  }

  say('=========== FDAO SELECTOR REPORT: STAYNTOUCH ===========');
  say('url: ' + location.href);
  say('title: ' + document.title);

  probe('guest name', [
    '[data-test="guest-name"]', '.guest-name', '.reservation-guest-name',
    '[data-testid*="guest" i]', '[class*="guest" i]', '[class*="guest-name" i]',
    'h1', 'h2', 'h3'
  ]);

  probe('room number', [
    '[data-test="room-number"]', '.room-number', '.reservation-room',
    '[data-testid*="room" i]', '[class*="room" i]'
  ]);

  probe('dates (arrival / departure)', [
    '.check-in-date', '.check-out-date', '.arrival-date', '.departure-date',
    '[data-testid*="arrival" i]', '[data-testid*="departure" i]',
    '[class*="arrival" i]', '[class*="departure" i]', '[class*="date" i]', '[datetime]'
  ]);

  probe('reservation status', [
    '[data-test="reservation-status"]', '.reservation-status', '.status-badge',
    '[data-testid*="status" i]', '[class*="status" i]', '[class*="badge" i]'
  ]);

  probe('confirmation number', [
    '[data-test="confirmation-number"]', '.confirmation-number',
    '[data-testid*="conf" i]', '[class*="confirm" i]'
  ]);

  probe('app root candidates', [
    'main', '[role="main"]', '#app', '[data-app-root]', '#root'
  ]);

  // ---- Label/value pairs: the fallback strategy the content script uses.
  say('');
  say('## label -> value pairs found');
  var WANTED = ['guest', 'guest name', 'room', 'room no', 'room number',
                'arrival', 'departure', 'check-in', 'check in', 'check-out',
                'check out', 'status', 'confirmation', 'confirmation #'];
  var labels = document.querySelectorAll('label, dt, .label, .field-label, [class*="label" i]');
  var pairs = 0;
  Array.prototype.forEach.call(labels, function (node) {
    if (pairs >= 25) return;
    var own = clean(node.textContent).toLowerCase().replace(/:$/, '');
    if (!own || own.length > 30) return;
    var hit = WANTED.some(function (w) { return own === w || own.indexOf(w) === 0; });
    if (!hit) return;
    var valueEl = node.nextElementSibling
      || (node.parentElement && node.parentElement.querySelector('.value, [data-value]'));
    var v = valueEl ? clean(valueEl.textContent) : '';
    if (!v || v.toLowerCase() === own) return;
    pairs++;
    say('  ' + selectorFor(node) + ' "' + own + '"');
    say('      -> ' + selectorFor(valueEl) + ' = "' + v + '"');
  });
  if (!pairs) say('  (none found - this PMS may not use label/value markup here)');

  say('');
  say('=========== END REPORT ===========');

  var text = out.join('\n');
  console.log(text);
  try {
    copy(text);
    console.log('%c^ Report copied to your clipboard. Paste it back to Perplexity.', 'color:#0a0;font-weight:bold');
  } catch (_) {
    console.log('%c^ Select the report above, copy it, and paste it back.', 'color:#0a0;font-weight:bold');
  }
  return 'FDAO probe done - see report above.';
})();
