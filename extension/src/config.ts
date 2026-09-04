// Property Configuration for Extension
// Maps URL patterns to property configurations

// Central API base URL (single source of truth for all extension scripts).
//
// Default is local dev. A production install points at its own backend by
// setting `apiBaseUrl` in chrome.storage.local (the popup writes it, and also
// requests host permission for that origin) — no code edit needed.
//
// Content scripts run synchronously, so getApiBaseUrl() has to answer without
// awaiting storage. The override is cached here: call loadApiBaseUrl() once at
// startup, after which getApiBaseUrl() returns the configured value. Storage
// changes are picked up without a reload.
const DEFAULT_API_BASE_URL = 'http://localhost:3001';

let apiBaseUrlOverride: string | null = null;

// Reject anything that is not an http(s) origin so a bad storage value cannot
// redirect API calls somewhere unexpected, and drop trailing slashes so callers
// can always append '/api'.
function normalizeApiBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return (url.origin + url.pathname).replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function getApiBaseUrl(): string {
  return apiBaseUrlOverride || DEFAULT_API_BASE_URL;
}

function setApiBaseUrlOverride(value: unknown): string {
  apiBaseUrlOverride = normalizeApiBaseUrl(value);
  return getApiBaseUrl();
}

// Read the override once at startup. Safe to call from any context; resolves to
// the default when storage is unavailable or holds nothing usable.
async function loadApiBaseUrl(): Promise<string> {
  try {
    if (!chrome?.storage?.local?.get) return getApiBaseUrl();
    const stored = await chrome.storage.local.get(['apiBaseUrl']);
    setApiBaseUrlOverride(stored?.apiBaseUrl);
  } catch {
    // Keep whatever we had rather than failing the caller's startup path.
  }
  return getApiBaseUrl();
}

// Keep long-lived contexts (side panel, content scripts) in step with changes
// made in the popup.
if (typeof chrome !== 'undefined' && chrome.storage?.onChanged?.addListener) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.apiBaseUrl) {
      setApiBaseUrlOverride(changes.apiBaseUrl.newValue);
    }
  });
}

interface PropertyConfig {
  id: number;
  name: string;
  urlPattern: string;
  toneGuidelines: string;
  checkoutTime: string;
  wifiSSID: string;
}

const PROPERTIES: Record<string, PropertyConfig> = {
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
function getPropertyConfig(): PropertyConfig | null {
  const hostname = window.location.hostname;

  for (const config of Object.values(PROPERTIES)) {
    if (hostname.includes(config.urlPattern)) {
      return config;
    }
  }

  return null;
}

// Get all properties
function getAllProperties(): PropertyConfig[] {
  return Object.values(PROPERTIES);
}

export {
  PROPERTIES,
  getPropertyConfig,
  getAllProperties,
  getApiBaseUrl,
  setApiBaseUrlOverride,
  loadApiBaseUrl,
  normalizeApiBaseUrl,
  DEFAULT_API_BASE_URL,
  apiBaseUrlOverride
};

export {};
