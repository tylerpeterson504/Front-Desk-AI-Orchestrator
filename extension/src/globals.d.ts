// Type the config globals that config.ts defines at runtime. sidepanel.html
// and popup.html load config.js as a classic script before panel/popup code,
// so those entry points see these as globals rather than imports.
/** Return the currently configured API base URL (default or override). */
declare function getApiBaseUrl(): string;
/** Load and cache the API base URL override from chrome.storage.local. */
declare function loadApiBaseUrl(): Promise<string>;
/** Validate and normalize a candidate API base URL value. */
declare function normalizeApiBaseUrl(value: unknown): string | null;
interface PropertyConfig {
  id: number;
  name: string;
  urlPattern: string;
  toneGuidelines: string;
  checkoutTime: string;
  wifiSSID: string;
}
/** Return the property configuration matching the current page's hostname. */
declare function getPropertyConfig(): PropertyConfig | null;
