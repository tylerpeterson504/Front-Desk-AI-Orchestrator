// Type the config globals that config.ts defines at runtime. sidepanel.html
// and popup.html load config.js as a classic script before panel/popup code,
// so those entry points see these as globals rather than imports.
declare function getApiBaseUrl(): string;
declare function loadApiBaseUrl(): Promise<string>;
declare function normalizeApiBaseUrl(value: unknown): string | null;
interface PropertyConfig {
  id: number;
  name: string;
  urlPattern: string;
  toneGuidelines: string;
  checkoutTime: string;
  wifiSSID: string;
}
declare function getPropertyConfig(): PropertyConfig | null;
