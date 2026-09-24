# Front Desk AI Chrome Extension

AI copilot for hotel front desk agents. Captures guest context from Stayntouch
and chat context from Akia, drafts guest replies with backend templates + LLM,
and injects reviewed text into the chat.

## Installation

### Prerequisites

- Chrome with a running backend (see the root [README](../README.md) for setup)

### Build & load

```bash
cd extension
npm install
npm run build     # outputs to extension/dist
```

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `extension/dist` folder

### Configuration

The API base URL defaults to `http://localhost:3001` (see
`src/config.ts`). To point an install at a deployed backend:

1. Click the extension icon to open the popup
2. Enter the backend URL under **Backend URL** and save

The value is stored in `chrome.storage.local` as `apiBaseUrl`, validated as an
HTTPS origin (HTTP is allowed only for `localhost`, `127.0.0.1`, and `[::1]`
development backends). Content scripts pick up changes live; an already-open
side panel keeps its initialized API base URL, so reopen it after changing
Backend URL.
Saving a non-default origin triggers a Chrome runtime permission request for
just that origin (`optional_host_permissions`). Clearing the field restores the
default — no code edit or repackaging needed.

The local `PROPERTIES` map and `getPropertyConfig()` in `src/config.ts` store
property names, IDs, and Stayntouch/Akia integration settings for side-panel
context and host detection. Property-specific operational details (tone
guidelines, checkout time, Wi-Fi SSID) come from the authenticated user's
backend records.

## Features

### Pipeline A: Guest information (Stayntouch)

Automatically extracts from `https://app.us1.stayntouch.com`:

- Guest name
- Room number
- Check-in/out dates
- Reservation status
- Confirmation number

### Pipeline B: Chat context (Akia)

Captures from `https://sys.akia.ai`:

- Active messages and sender names
- Message injection (review before send)

### Template system

- Search templates by name/tags (from the backend, scoped to your account)
- Multi-select templates
- Combine into one response
- Toggle tone (Professional/Friendly)
- Copy or inject to chat
- Server-side draft via `/api/copilot/draft` with local template stitching as
  fallback when the server AI is unavailable

### Shift notes

Display today's shift notes with facility updates and special instructions.

## Usage

1. Click the extension icon → **Open Sidepanel**
2. Log in with dashboard credentials
3. Guest info auto-populates while on Stayntouch
4. Chat context auto-captures while on Akia
5. Select templates → Generate → review the draft → Copy or Inject

## Development

```bash
npm run dev       # Vite dev build
npm run build     # Production build to dist/
npm test          # Vitest suite
npm run lint      # ESLint
```

Entry points (resolved from `manifest.json` by `vite-plugin-web-extension`):
background service worker, popup, side panel, and two content scripts
(`content-stayntouch.ts`, `content-akia.ts`).

## Troubleshooting

**Extension doesn't load:** check `dist/manifest.json` exists (run
`npm run build`), and look for errors on the `chrome://extensions/` card.

**Data not appearing:** verify you are on a supported domain
(`app.us1.stayntouch.com` or `sys.akia.ai`) and check the page console for
content-script errors.

**Auth fails:** verify the backend is running and reachable at the configured
Backend URL and credentials. Use **Sign out** in the side panel to clear the
stored session tokens, then sign in again.
