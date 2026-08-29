// Content script for Stayntouch PMS
// Pipeline A: Extracts guest information from the current reservation page

(function () {
  function extractGuestInfo() {
    return {
      guestName: getText('[data-test="guest-name"], .guest-name, .reservation-guest-name'),
      roomNumber: getText('[data-test="room-number"], .room-number, .reservation-room'),
      checkIn: getText('[data-test="check-in"], .check-in-date, .arrival-date'),
      checkOut: getText('[data-test="check-out"], .check-out-date, .departure-date'),
      reservationStatus: getText('[data-test="reservation-status"], .reservation-status, .status-badge'),
      confirmationNumber: getText('[data-test="confirmation-number"], .confirmation-number')
    };
  }

  function getText(selector) {
    if (!document.body) return null;
    const el = document.querySelector(selector);
    return el ? el.textContent.trim() : null;
  }

  function sendGuestInfo() {
    const info = extractGuestInfo();
    const hasData = Object.values(info).some(Boolean);
    if (hasData) {
      chrome.runtime.sendMessage({ type: 'GUEST_INFO_UPDATED', data: info });
    }
  }

  // Send on page load
  sendGuestInfo();

  // Re-send when the DOM changes (SPA navigation)
  const observer = new MutationObserver(() => {
    if (typeof document !== 'undefined' && document.body) sendGuestInfo();
  });
  if (typeof document !== 'undefined' && document.body) observer.observe(document.body, { childList: true, subtree: true });

  // Listen for requests from the side panel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_GUEST_INFO') {
      sendResponse({ data: extractGuestInfo() });
    }
  });
})();
