# Front-Desk-AI-Orchestrator

A secure Chrome Extension with dashboard for hotel front desk AI assistance.

## Architecture

| Component  | Stack                                        | Path        |
|------------|----------------------------------------------|-------------|
| Backend    | Node.js (Express), PostgreSQL/Neon (pg-promise), JWT auth | `backend/` |
| Dashboard  | React (CRA)                                  | `dashboard/` |
| Extension  | Chrome MV3 (side panel, content scripts)     | `extension/` |

Request flow: content scripts scrape guest/chat context from Stayntouch PMS and
Akia messaging → side panel assembles property + templates + context → backend
`/api/copilot/draft` enriches with authoritative property/template records and
calls the LLM → draft rendered in the side panel for review → copy or inject.

## AI Copilot (Gemini)

Draft generation runs **server-side only** via `backend/src/services/llm.js`
using Perplexity Sonar when `PERPLEXITY_API_KEY` is configured, with the official
`@google/generative-ai` SDK (Gemini) as fallback. API keys are never shipped to
the extension or dashboard.

### Configuration

Set the following env vars on the backend (e.g. `backend/.env` or the hosting
provider's environment settings):

| Variable         | Required | Default            | Description                              |
|------------------|----------|--------------------|------------------------------------------|
| `GOOGLE_API_KEY` | yes      | —                  | Google AI Studio API key (Gemini)        |
| `GEMINI_MODEL`   | no       | `gemini-1.5-flash` | Model override                           |
| `PERPLEXITY_API_KEY` | no | Perplexity Sonar API key (primary when set) |
| `PERPLEXITY_MODEL` | no | `sonar` | Perplexity model override |
| `CORS_ORIGIN` | no | unrestricted | Comma-separated allowed browser origins |

When `GOOGLE_API_KEY` is absent the copilot route returns `503
LLM_NOT_CONFIGURED` and the extension falls back to local template stitching,
so dev/test still work without a key.

### Getting a key

1. Create an API key at [Google AI Studio](https://aistudio.google.com/apikey).
2. Add it to the backend environment as `GOOGLE_API_KEY` (never commit it).

### Security properties

- The prompt builder (`buildPrompt`) never includes `wifi_password`; the
  copilot route's property `SELECT` omits it, and tests assert the prompt
  cannot leak it even if handed one.
- Templates are resolved server-side from the caller's own records, so the LLM
  only ever sees staff-approved text owned by the authenticated user.
- Properties and templates are scoped to the JWT-authenticated caller
  (`user_id`), with 403 on foreign resources.
- `guest_info` and `chat_context` arrive from third-party pages and are treated
  as untrusted: unknown keys dropped, values length-capped, control characters
  stripped, then wrapped in explicit data fences that the model is instructed
  never to read as instructions.

## Accounts and roles

`role` is never accepted from a registration request — every new account is
created as `agent`. Promotion happens two ways:

- `PATCH /api/auth/users/:id/role` — requires an authenticated `admin`
- `npm run set-role -- someone@example.com admin` — server-side bootstrap for
  the first admin

Registration itself is gated by `REGISTRATION_MODE`:

| Mode     | Behaviour                                                        |
|----------|------------------------------------------------------------------|
| `invite` | Requires `X-Registration-Token` matching `REGISTRATION_INVITE_TOKEN` |
| `open`   | Anyone may register. Refused when `NODE_ENV=production`           |
| `closed` | Registration disabled entirely                                    |

Unset defaults to `invite` in production and `open` elsewhere, so local dev and
CI keep working while a deployed instance is closed by default.

## Secrets at rest

`properties.wifi_password` is encrypted with AES-256-GCM before insert
(`backend/src/lib/secretBox.js`, stored as `v1:<iv>:<tag>:<ciphertext>`) and
decrypted only inside the audit-logged `GET /api/properties/:id/wifi` route.

Set `WIFI_ENCRYPTION_KEY` (32 bytes, base64 or hex) — required in production,
warned about in dev. To rewrite rows written before this change:

```bash
cd backend && npm run encrypt-wifi
```

Reads pass legacy plaintext through unchanged, so the backfill is optional and
idempotent.

## Error responses

Routes never return `error.message` from the database driver. 4xx responses
carry an actionable validation message; 5xx responses collapse to
`{ "error": "Internal server error", "request_id": "<uuid>" }`. The full error,
stack and pg code are logged server-side as one JSON line against that same
`request_id` (also returned as the `X-Request-Id` header).

## Testing

```bash
cd backend   && npm install && npm test   # 94 tests (routes, auth, refresh/revocation, roles, registration gating, input validation, crypto, error hygiene, prompt fencing)
cd extension && npm install && npm test   # 48 tests (sidepanel, silent refresh, content scripts, observer debouncing, config override, chip escaping)
```

Logging is suppressed under Jest; set `LOG_VERBOSE=1` to see it.

## Local development

There is no container setup — the database is Neon, so local dev talks to a Neon
branch directly.

1. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` to a Neon
   connection string (create a dev branch in the Neon console so you are not
   pointing at production).
2. Prepare the schema and demo data:
   ```bash
   cd backend && npm ci && npm run db-setup
   ```
   `db-setup` runs migrations then seeds; seeding is skipped automatically when
   users already exist. Demo login: `demo@example.com` / `password123`.
3. Start the API: `npm run dev` (listens on `PORT`, default 3001).
4. Start the dashboard in a second shell: `cd dashboard && npm ci && npm start`
   (:3000, proxies to `REACT_APP_API_URL`). The dashboard is behind a login gate:
   it validates any stored token against `GET /api/auth/me` before rendering, and
   sends you back to the login form on a 401 from any endpoint.

### Sessions

Authentication is a short-lived access token plus a revocable refresh token.

| | Access token | Refresh token |
|---|---|---|
| Form | JWT, signed with `JWT_SECRET` | opaque random string, 32 bytes |
| Lifetime | `JWT_TTL`, default **15m** | `REFRESH_TOKEN_TTL_DAYS`, default **30d** |
| Stored server-side | no | yes — SHA-256 hash only, in `refresh_tokens` |
| Revocable | not directly | yes, immediately |

The access token stays stateless so no request pays for a database lookup, which
is why it is short: expiry is the only bound on a stolen or de-privileged one.
Anything long-lived is the refresh token, whose state lives in Postgres and can
be revoked.

- `POST /api/auth/login`, `POST /api/auth/register` → `{ token, expires_in, refresh_token, user }`
- `POST /api/auth/refresh` → new `token` **and** a new `refresh_token`
- `POST /api/auth/logout` → 204, revokes the session
- `POST /api/auth/logout-all` → revokes every session for the caller

Refresh tokens are **single-use**. Refreshing revokes the presented token and
returns a successor in the same family, so a client must store what it gets back.
Presenting a superseded token means a replay or a stolen copy, so the whole
family is revoked and that user has to log in again — this is how theft is
detected, and it is why both clients funnel concurrent 401s through one in-flight
refresh instead of racing.

Sessions are also revoked when an admin changes a user's role, so the old role
cannot be refreshed into a fresh access token.

Both clients refresh silently: a 401 on any endpoint triggers one refresh and one
replay, and only a failed refresh returns the user to the login screen. Expired
rows can be cleared with `cd backend && npm run prune-sessions`.

What this does not do: an access token already issued stays valid until it
expires, so revocation takes effect within one access-token lifetime (15 minutes
by default) rather than instantly. Making it instant means checking a blocklist
on every request; that trade is deliberate, and shortening `JWT_TTL` narrows the
window if you want it tighter.

Styling is Tailwind, compiled by PostCSS through CRA (`dashboard/tailwind.config.js`,
`src/index.css`) — there is no CDN script, so `npm run build` is what produces the
stylesheet.

Postgres is only reachable over TLS, so keep `sslmode=require` in the connection
string.

## Chrome Extension

1. Open `chrome://extensions/` → Developer mode → **Load unpacked**
2. Select the `extension/` folder
3. The API base URL is centralized in `extension/src/config.js`
   (`http://localhost:3001` by default). To point an install at a deployed
   backend, open the extension popup, enter the URL under **Backend URL** and
   save — no code edit and no repackaging. The value is stored in
   `chrome.storage.local` as `apiBaseUrl`, validated as an `http(s)` origin, and
   picked up by the side panel and content scripts (including live changes).
   Clearing the field restores the default.

Because the target backend origin is unknown at packaging time, the manifest ships
only localhost/127.0.0.1 in `host_permissions` and declares `http://*/*` +
`https://*/*` as `optional_host_permissions`. Saving a custom URL triggers a
runtime permission request for just that origin, so Chrome asks the operator
instead of the extension holding blanket access.

Content-script host matches (MV3 manifest):
- `https://app.us1.stayntouch.com/*` — Pipeline A (guest info)
- `https://sys.akia.ai/*` — Pipeline B (chat context + injection)

## Perplexity AI integration

The copilot supports Perplexity's Sonar API for web-grounded responses. It is called only from the backend, so the API key is never exposed to the extension or dashboard. When configured, Perplexity takes priority over Gemini; Gemini remains the fallback when `PERPLEXITY_API_KEY` is absent.

Add this key in the project's **Keys** tab:

```text
PERPLEXITY_API_KEY=your_perplexity_api_key
```

Optional model override:

```text
PERPLEXITY_MODEL=sonar
```

Create the key in the [Perplexity API settings](https://www.perplexity.ai/settings/api), then add it to the Keys tab. Never commit it.

## Neon database integration

The backend accepts a Neon PostgreSQL connection string through `DATABASE_URL`. When present, it takes precedence over the individual `DB_*` settings and works with the existing `pg-promise` data layer and migrations.

Add this key in the project's **Keys** tab:

```text
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
```

Create or select a project in the [Neon Console](https://console.neon.tech), open **Connection Details**, and copy the pooled connection string. Keep `sslmode=require` enabled for hosted connections. Never commit this value.

## Databricks integration

The backend includes a server-side Databricks SQL Statement Execution API client at `backend/src/services/databricks.js`. It keeps the personal access token out of the browser and exposes an authenticated configuration check at `GET /api/databricks/status`.

Add these values in the project's **Keys** tab (or the backend hosting environment):

| Variable | Required | Description |
|---|---:|---|
| `DATABRICKS_HOST` | yes | Databricks workspace URL, for example `https://dbc-xxxxxxxx.cloud.databricks.com` |
| `DATABRICKS_TOKEN` | yes | Databricks personal access token or service-principal token |
| `DATABRICKS_WAREHOUSE_ID` | optional | SQL warehouse ID used when executing statements |

The integration does not log or return token values. Create the workspace and token in Databricks, then add the variables above to the Keys tab. `DATABRICKS_WAREHOUSE_ID` is needed when calling `executeSql` without passing a warehouse ID explicitly.

## GitHub integration

The backend includes a server-side GitHub REST API client at `backend/src/services/github.js` and an authenticated configuration check at `GET /api/github/status`. The token stays on the server and is never returned to the browser.

Add this key in the project's **Keys** tab:

```text
GITHUB_TOKEN=your_github_token
```

Create a least-privilege token with only the repository permissions your deployment needs. Never commit the token or expose it in extension code.

## Deployment

- Backend: any Node host (Freebuff managed hosting configured: install
  `npm install`, start `npm run start` on port 3001). Production requires
  `DATABASE_URL` / DB env vars, `JWT_SECRET`, `CORS_ORIGIN`,
  `WIFI_ENCRYPTION_KEY`, a registration policy
  (`REGISTRATION_MODE` + `REGISTRATION_INVITE_TOKEN`), and at least one AI key:
  `PERPLEXITY_API_KEY` or `GOOGLE_API_KEY`. The server refuses to boot without
  `CORS_ORIGIN` in production rather than reflecting every origin.
- Dashboard: static React build (CRA `npm run build`).
- Extension: load unpacked from `extension/` (no build step).
