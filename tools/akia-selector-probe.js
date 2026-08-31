/* ===========================================================================
   FDAO selector probe — Akia inbox  (https://sys.akia.ai/inbox)

   HOW TO USE
   1. Open https://sys.akia.ai/inbox and click into a conversation that has
      a few messages visible.
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

  // Build a short, stable-ish selector for an element.
  function selectorFor(el) {
    if (!el || el === document.body) return 'body';
    if (el.getAttribute && el.getAttribute('data-testid')) return '[data-testid="' + el.getAttribute('data-testid') + '"]';
    if (el.getAttribute && el.getAttribute('data-test')) return '[data-test="' + el.getAttribute('data-test') + '"]';
    var tag = el.tagName.toLowerCase();
    var cls = (el.className && typeof el.className === 'string')
      ? el.className.trim().split(/\s+/).filter(function (c) {
          // Drop hashed/utility-looking classes; keep human-readable ones.
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

  say('=========== FDAO SELECTOR REPORT: AKIA ===========');
  say('url: ' + location.href);
  say('title: ' + document.title);

  probe('message containers', [
    '.message-item', '.chat-message', '[data-test="message"]',
    '[data-testid*="message" i]', '[class*="message" i]',
    '[class*="bubble" i]', '[class*="msg" i]',
    '[role="listitem"]', 'li'
  ]);

  probe('sender / author', [
    '.sender-name', '.message-sender', '[data-test="sender"]',
    '[data-testid*="sender" i]', '[class*="sender" i]',
    '[class*="author" i]', '[class*="from" i]', '[class*="name" i]'
  ]);

  probe('message text', [
    '.message-text', '.message-body', '[data-test="message-text"]',
    '[class*="message-text" i]', '[class*="body" i]', '[class*="content" i]', 'p'
  ]);

  probe('timestamps', [
    '.message-time', '.timestamp', '[data-test="timestamp"]',
    'time', '[class*="time" i]', '[datetime]'
  ]);

  probe('composer (where a draft gets typed)', [
    'textarea', 'input[type="text"]', '[contenteditable="true"]',
    '[class*="composer" i]', '[class*="reply" i]', '[class*="input" i]',
    '[placeholder]'
  ]);

  probe('active guest / conversation header', [
    '.active-guest-name', '.conversation-guest', '[data-test="active-guest"]',
    '[data-conversation-id]', '[class*="conversation" i]',
    '[class*="guest" i]', 'h1', 'h2', 'h3'
  ]);

  // ---- Structural inference: find the repeated row that looks like a message
  // list, by locating the deepest parent with many similar children.
  say('');
  say('## inferred message rows (structure-based)');
  var best = null;
  document.querySelectorAll('ul, ol, div, section').forEach(function (parent) {
    var kids = Array.prototype.filter.call(parent.children, function (c) {
      return clean(c.textContent).length > 8;
    });
    if (kids.length < 3) return;
    // Children should look alike (same tag, similar class signature).
    var sig = {};
    kids.forEach(function (k) {
      var s = k.tagName + '|' + ((k.className && typeof k.className === 'string') ? k.className.trim().split(/\s+/)[0] : '');
      sig[s] = (sig[s] || 0) + 1;
    });
    var topCount = Math.max.apply(null, Object.keys(sig).map(function (k) { return sig[k]; }));
    if (topCount < 3) return;
    var score = topCount + Math.min(kids.length, 40) * 0.5;
    if (!best || score > best.score) best = { parent: parent, kids: kids, topCount: topCount, score: score };
  });
  if (best) {
    say('  list container : ' + selectorFor(best.parent));
    say('  similar rows   : ' + best.topCount + ' of ' + best.kids.length + ' children');
    say('  row selector   : ' + selectorFor(best.kids[0]));
    say('  row samples:');
    best.kids.slice(0, 4).forEach(function (k, i) { say('    [' + i + '] "' + clean(k.textContent) + '"'); });
    // Inside the first row, show its labelled descendants — these are the
    // sender / text / time candidates.
    say('  inside row [0]:');
    var seen = 0;
    best.kids[0].querySelectorAll('*').forEach(function (d) {
      if (seen >= 12) return;
      var t = clean(d.textContent);
      if (!t || d.children.length > 0) return; // leaf nodes carry the values
      seen++;
      say('    ' + selectorFor(d) + '  = "' + t + '"');
    });
  } else {
    say('  (could not infer a repeated row - open a conversation with several messages first)');
  }

  // ---- Composer detail: the element a draft would be injected into.
  say('');
  say('## composer detail');
  var comp = document.querySelector('textarea, [contenteditable="true"], input[type="text"]');
  if (comp) {
    say('  selector       : ' + selectorFor(comp));
    say('  tag            : ' + comp.tagName.toLowerCase());
    say('  contenteditable: ' + !!comp.isContentEditable);
    say('  placeholder    : ' + (comp.getAttribute('placeholder') || '(none)'));
    say('  aria-label     : ' + (comp.getAttribute('aria-label') || '(none)'));
    say('  data-testid    : ' + (comp.getAttribute('data-testid') || '(none)'));
  } else {
    say('  (no composer found - make sure a conversation is open)');
  }

  say('');
  say('=========== END REPORT ===========');

  var text = out.join('\n');
  console.log(text);
  try {
    copy(text); // DevTools helper
    console.log('%c^ Report copied to your clipboard. Paste it back to Perplexity.', 'color:#0a0;font-weight:bold');
  } catch (_) {
    console.log('%c^ Select the report above, copy it, and paste it back.', 'color:#0a0;font-weight:bold');
  }
  return 'FDAO probe done - see report above.';
})();
