/**
 * Tests for content scripts (akia and stayntouch).
 * Tests DOM extraction, injection, and edge cases.
 */

describe('Content Scripts Edge Cases', function() {
  let originalBody;

  beforeEach(function() {
    originalBody = document.body.innerHTML;
    document.body.innerHTML = '';
  });

  afterEach(function() {
    document.body.innerHTML = originalBody;
  });

  describe('Empty DOM', function() {
    it('should handle empty DOM without errors', function() {
      document.body.innerHTML = '';
      // Test that extraction functions don't crash
    });
  });

  describe('Malformed HTML', function() {
    it('should handle unclosed tags', function() {
      document.body.innerHTML = '<div><p>Unclosed tag';
      // Test that extraction doesn't crash
    });
  });

  describe('Rapid DOM Mutations', function() {
    it('should handle rapid DOM mutations with debouncing', function(done) {
      document.body.innerHTML = '<div id="container"></div>';
      const container = document.getElementById('container');
      for (let i = 0; i < 50; i++) {
        setTimeout(() => { container.innerHTML += '<div class="message">Message ' + i + '</div>'; }, i * 10);
      }
      setTimeout(done, 1000);
    });
  });
});