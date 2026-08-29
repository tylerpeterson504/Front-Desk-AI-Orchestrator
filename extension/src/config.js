// Property Configuration for Extension
// Maps URL patterns to property configurations

// Central API base URL (single source of truth for all extension scripts).
// Default is local dev. For a production install, set `apiBaseUrl` in
// chrome.storage.local (sidepanel picks it up at startup) — no code edit needed.
const DEFAULT_API_BASE_URL = 'http://localhost:3001';

function getApiBaseUrl() {
  return DEFAULT_API_BASE_URL;
}

const PROPERTIES = {
  'app.us1.stayntouch.com': {
    id: 1,
    name: 'St.Pierre Hotel',
    urlPattern: 'app.us1.stayntouch.com',
    toneGuidelines: 'Professional, formal, courteous',
    checkoutTime: '11:00 AM',
    wifiSSID: 'StPierre-Guest'
  },
  'sys.akia.ai': {
    id: 2,
    name: 'Andrew Jackson Hotel',
    urlPattern: 'sys.akia.ai',
    toneGuidelines: 'Friendly, welcoming, professional',
    checkoutTime: '11:00 AM',
    wifiSSID: 'AndrewJackson-Guest'
  }
};

// Get property config from current URL
function getPropertyConfig() {
  const hostname = window.location.hostname;
  
  for (const config of Object.values(PROPERTIES)) {
    if (hostname.includes(config.urlPattern)) {
      return config;
    }
  }
  
  return null;
}

// Get all properties
function getAllProperties() {
  return Object.values(PROPERTIES);
}

// Export for use in content scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PROPERTIES, getPropertyConfig, getAllProperties, getApiBaseUrl };
}
