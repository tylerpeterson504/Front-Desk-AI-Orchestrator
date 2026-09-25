# Front Desk AI — Chrome Extension

A Chrome MV3 extension that helps hotel front desk agents draft guest responses. It reads guest context from the PMS and messaging pages, drafts replies with the backend AI copilot, and injects the approved text into the chat. All AI calls and API keys stay server-side.

## Install (development)

1. Open `chrome://extensions/` and enable **Developer mode**.
2. Click **Load unpacked** and select this `extension/` directory.

There is no build step; the extension runs directly from source.

## Configure the backend URL

The API base URL defaults to `http://localhost:3001` and lives in `src/config.ts`. To point an install at a deployed backend without editing code:

1. Click the extension icon → open the popup.
2. Enter the backend origin under **Backend URL** and save.
3. The value is stored in `chrome.storage.local` as `apiBaseUrl`, validated as an `http(s)` origin, and picked up live by the side panel and content scripts.

Because the backend origin is unknown at packaging time, the manifest ships only localhost in `host_permissions` and declares `http://*/*` + `https://*/*` as `optional_host_permissions`. Saving a custom URL triggers a runtime permission request for just that origin, so Chrome asks you instead of the extension holding blanket access.

## Supported pages (content scripts)

| Host match | Pipeline | Captures |
|---|---|---|
| `https://app.us1.stayntouch.com/*` | A — guest info | guest name, room number, check-in/out, reservation status |
| `https://sys.akia.ai/*` | B — chat context | active conversation, sender names; supports message injection after review |

Property records (tone guidelines, checkout time, Wi-Fi SSID) come from the authenticated backend — the extension no longer hardcodes a per-domain property map.

## Workflow

1. Click the extension icon → **Open side panel**.
2. Log in with dashboard credentials (same accounts and roles).
3. Guest info auto-populates on Stayntouch; chat context auto-captures on Akia.
4. Pick templates, review the AI draft, then **copy** or **inject** it.

The copilot falls back to local template stitching when the backend LLM is not configured, so the panel still works offline from AI.

## Troubleshooting

- **Extension will not load** — check the manifest and the DevTools console on `chrome://extensions/`.
- **No data appearing** — confirm you are on a supported host and that the content script is attached (DevTools → Sources).
- **Auth fails** — confirm the backend is reachable at the configured URL and credentials are valid; clear extension storage and log in again.
