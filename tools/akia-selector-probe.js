/**
 * Akia Selector Probe
 * A read-only DevTools console script that reports which selectors actually
 * match on a logged-in Akia page, so the content-script selectors can be pinned
 * down from a real session instead of guessed.
 *
 * Usage: Open DevTools on an Akia page, paste this script, and press Enter.
 */
(function runAkiaSelectorProbe() {
  'use strict';
  console.log('=== Akia Selector Probe ===');
  const results = { issues: [] };
  const probes = {
    messageContainers: { name: 'Message Containers', selectors: ['article.website-chat-message', '.message-row', '.message-item', '.chat-message', '[data-test="message"]'] },
    senderElements: { name: 'Sender Elements', selectors: ['address.author', '.author', '.sender-name', '[data-test="sender"]'] },
    textElements: { name: 'Text Elements', selectors: [':scope > .message', '.message-text', '.message-body'] },
    composerInputs: { name: 'Composer Inputs', selectors: ['.website-chat-client-composer input#message', 'textarea.message-input', 'input.message-input'] }
  };
  Object.keys(probes).forEach(function(category) {
    console.log('\n--- ' + probes[category].name + ' ---');
    probes[category].selectors.forEach(function(selector) {
      try {
        const elements = document.querySelectorAll(selector);
        console.log('  ' + selector + ': ' + elements.length + ' matches');
      } catch (e) {
        console.log('  ' + selector + ': ERROR - ' + e.message);
      }
    });
  });
  console.log('\nProbe complete.');
})();
runAkiaSelectorProbe();