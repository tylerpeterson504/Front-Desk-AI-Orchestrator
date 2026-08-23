// Property Configuration for Extension
// Maps URL patterns to property configurations

const PROPERTIES = {
  'stpierre.stayntouch.com': {
    id: 1,
    name: 'St.Pierre Hotel',
    urlPattern: 'stpierre',
    toneGuidelines: 'Professional, formal, courteous',
    checkoutTime: '11:00 AM',
    wifiSSID: 'StPierre-Guest',
    apiEndpoint: 'http://localhost:3001'
  },
  'andrewjackson.stayntouch.com': {
    id: 2,
    name: 'Andrew Jackson Hotel',
    urlPattern: 'andrewjackson',
    toneGuidelines: 'Friendly, welcoming, professional',
    checkoutTime: '11:00 AM',
    wifiSSID: 'AndrewJackson-Guest',
    apiEndpoint: 'http://localhost:3001'
  }
};

// Get property config from current URL
function getPropertyConfig() {
  const hostname = window.location.hostname;
  
  for (const [domain, config] of Object.entries(PROPERTIES)) {
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
  module.exports = { PROPERTIES, getPropertyConfig, getAllProperties };
}
