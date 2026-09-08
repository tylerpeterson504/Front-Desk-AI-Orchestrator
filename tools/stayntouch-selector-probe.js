/** 
 * Stayntouch Selector Probe 
 * A read-only DevTools console script that reports which selectors actually 
 * match on a logged-in Stayntouch PMS page. 
 * 
 * Usage: Open DevTools on a Stayntouch page, paste this script, and press Enter. 
 */ 
(function runStayntouchSelectorProbe() { 
  'use strict'; 
  console.log('=== Stayntouch Selector Probe ==='); 
  const fieldProbes = { 
    guestName: { name: 'Guest Name', selectors: ['[data-test="guest-name"]', '.guest-name', '#guest-name'] }, 
    roomNumber: { name: 'Room Number', selectors: ['[data-test="room-number"]', '.room-number', '#room-number'] }, 
    arrivalDate: { name: 'Arrival Date', selectors: ['[data-test="arrival-date"]', '.arrival-date', '#arrival-date'] }, 
    departureDate: { name: 'Departure Date', selectors: ['[data-test="departure-date"]', '.departure-date', '#departure-date'] }, 
    confirmationNumber: { name: 'Confirmation Number', selectors: ['[data-test="confirmation-number"]', '.confirmation-number', '#confirmation'] }, 
    status: { name: 'Status', selectors: ['[data-test="status"]', '.status', '#status'] } 
  }; 
  Object.keys(fieldProbes).forEach(function(category) { 
    console.log('\n--- ' + fieldProbes[category].name + ' ---'); 
    fieldProbes[category].selectors.forEach(function(selector) { 
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
runStayntouchSelectorProbe(); 
