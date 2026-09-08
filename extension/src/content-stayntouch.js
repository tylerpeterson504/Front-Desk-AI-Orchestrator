// Content script for Stayntouch PMS
// Pipeline A: Extracts guest information from the current reservation page

(function () {
  // Enhanced error handling and logging
  function logExtractionError(error, selector) {
    console.error('[StayNTouch Content Script] Error extracting from selector:', selector, error);
  }

  function safeGetText(selector) {
    try {
      if (!document.body) return null;
      const el = document.querySelector(selector);
      return el ? el.textContent.trim() : null;
    } catch (error) {
      logExtractionError(error, selector);
      return null;
    }
  }

  function getText(selector) {
    // Try multiple selectors for robustness
    if (!document.body) return null;
    
    const selectors = selector.split(',').map(s => s.trim());
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        try {
          const text = el.textContent.trim();
          if (text) return text;
        } catch (error) {
          logExtractionError(error, sel);
        }
      }
    }
    return null;
  }

  function extractGuestInfo() {
    try {
      // Enhanced extraction with fallbacks and validation
      const guestName = getText('[data-test="guest-name"], .guest-name, .reservation-guest-name, .guest-full-name');
      const roomNumber = getText('[data-test="room-number"], .room-number, .reservation-room, .room-id, .room-no');
      const checkIn = getText('[data-test="check-in"], .check-in-date, .arrival-date, .checkin-date');
      const checkOut = getText('[data-test="check-out"], .check-out-date, .departure-date, .checkout-date');
      const reservationStatus = getText('[data-test="reservation-status"], .reservation-status, .status-badge, .booking-status');
      const confirmationNumber = getText('[data-test="confirmation-number"], .confirmation-number, .reservation-id, .booking-ref');
      
      // Additional useful fields
      const phoneNumber = getText('[data-test="phone"], .guest-phone, .contact-phone, .mobile-number');
      const email = getText('[data-test="email"], .guest-email, .contact-email, .email-address');
      const adults = getText('[data-test="adults"], .adult-count, .num-adults');
      const children = getText('[data-test="children"], .child-count, .num-children');
      const specialRequests = getText('[data-test="special-requests"], .special-requests, .guest-notes, .comments');
      
      const info = {
        guestName,
        roomNumber,
        checkIn,
        checkOut,
        reservationStatus,
        confirmationNumber
      };
      
      // Add additional fields if they exist
      if (phoneNumber) info.phoneNumber = phoneNumber;
      if (email) info.email = email;
      if (adults) info.adults = adults;
      if (children) info.children = children;
      if (specialRequests) info.specialRequests = specialRequests;
      
      return info;
    } catch (error) {
      console.error('[StayNTouch Content Script] Error in extractGuestInfo:', error);
      return {
        guestName: null,
        roomNumber: null,
        checkIn: null,
        checkOut: null,
        reservationStatus: null,
        confirmationNumber: null
      };
    }
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

  const MUTATION_DEBOUNCE_MS = 300;

  // Re-send when the DOM changes (SPA navigation)
  // Debounced: one extraction per burst of DOM changes. These hosts are SPAs that mutate the DOM
  // constantly, and the undebounced version re-extracted and messaged the
  // background worker on every single mutation.
  let pending = null;
  const observer = new MutationObserver(() => {
    if (typeof document === 'undefined' || !document.body) return;
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      sendGuestInfo();
    }, MUTATION_DEBOUNCE_MS);
  });
  if (typeof document !== 'undefined' && document.body) observer.observe(document.body, { childList: true, subtree: true });

  // Listen for requests from the side panel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_GUEST_INFO') {
      sendResponse({ data: extractGuestInfo() });
    }
  });
})();
