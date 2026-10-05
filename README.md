# Front Desk AI Orchestrator

A hotel front desk assistant: a Chrome extension that captures guest context from the PMS and messaging pages, a backend that drafts AI-assisted replies with the property's approved templates, and a React dashboard for managing properties, templates, shift notes, and escalations.

## Architecture

| Component | Stack                                                 | Path         |
| --------- | ----------------------------------------------------- | ------------ |
| Backend   | Node.js (Express), PostgreSQL/Neon, TypeORM, JWT auth | `backend/`   |
| Dashboard | React, Vite, Tailwind                                 | `dashboard/` |
| Extension | Chrome MV3 (side panel, content scripts)              | `extension/` |

Request flow: content scripts scrape guest/chat context from Stayntouch PMS and Akia messaging → the side panel assembles property + templates + context → the backend `/api/copilot/draft` enriches the request with authoritative property/template records and calls the LLM → the draft renders in the side panel for review → copy or inject.

## Quick start

Requires Node.js >= 24 and a Neon PostgreSQL connection string.

```bash
npm run install:all
cp backend/.env.example backend/.env   # set DATABASE_URL, JWT_SECRET, MISTRAL_API_KEY
cd backend && npm run db-setup          # migrations + demo seed
npm run dev                             # backend :3001 + dashboard :3000
```

Demo login: `demo@example.com` / `password123`.

Load the extension (ID: `hmjpbhiploiaghgnolmlenledgmecblk`) from `chrome://extensions/` → Developer mode → Load unpacked → `extension/`. Point it at the backend via the popup's **Backend URL** field — no repackaging needed. Details: [extension/README.md](extension/README.md).

## AI copilot (Mistral)

Draft generation runs server-side only via `backend/src/services/copilotService.ts` through `backend/src/services/llm/mistralClient.ts`. The API key never reaches the extension or dashboard.

| Variable           | Required   | Description                                       |
| ------------------ | ---------- | ------------------------------------------------- |
| `MISTRAL_API_KEY`  | yes        | Mistral API key (server exits at boot without it) |
| `MISTRAL_BASE_URL` | no         | API base URL override (proxy/self-host)           |
| `CORS_ORIGIN`      | production | Comma-separated allowed browser origins           |

When the key is missing after boot the copilot route reports `MISTRAL_NOT_CONFIGURED` and the extension falls back to local template stitching, so dev/test still work.

### Security properties

- The prompt builder never includes `wifi_password`; the copilot route's property `SELECT` omits it, and tests assert the prompt cannot leak it.
- Templates are resolved server-side from the caller's own records, so the LLM only sees staff-approved text owned by the authenticated user.
- Properties and templates are scoped to the JWT-authenticated caller (`user_id`), with 403 on foreign resources.
- `guest_info` and `chat_context` arrive from third-party pages and are treated as untrusted: unknown keys dropped, values length-capped, control characters stripped, then wrapped in data fences the model is told never to read as instructions.

## Authentication

Short-lived access tokens (JWT, 15 minutes by default) plus single-use, revocable refresh tokens (opaque, SHA-256 hashed at rest, 30 days). Refreshing returns a successor token; presenting a superseded one revokes the whole family. Both clients refresh silently on 401 and replay once.

- `POST /api/auth/login|register` → `{ token, expires_in, refresh_token, user }`
- `POST /api/auth/refresh` → new `token` **and** `refresh_token`
- `POST /api/auth/logout` / `logout-all` → revoke session(s)

Every new account is created as `agent`. Role is never accepted from registration; promotion happens via `PATCH /api/auth/users/:id/role` (admin only) or the server-side `npm run set-role` bootstrap. Registration is gated by `REGISTRATION_MODE` (`invite` / `open` / `closed`), defaulting to `invite` in production. Sessions are revoked when an admin changes a user's role.

## Secrets at rest

`properties.wifi_password` is encrypted with AES-256-GCM before insert (`backend/src/lib/secretBox`) and decrypted only inside the audit-logged `GET /api/properties/:id/wifi` route. Set `WIFI_ENCRYPTION_KEY` (32 bytes, base64 or hex) — required in production. Backfill legacy rows with `cd backend && npm run encrypt-wifi`; reads pass plaintext through, so the backfill is optional and idempotent.

## API surface

| Route group                      | Purpose                                                   |
| -------------------------------- | --------------------------------------------------------- |
| `/api/auth`                      | login, register, refresh, logout, role management         |
| `/api/properties`                | property records, Wi-Fi reveal (audit-logged)             |
| `/api/templates`                 | message templates with no-promise validation at save time |
| `/api/shift-notes`               | per-property shift notes                                  |
| `/api/escalations`               | guest-request escalation and assignment                   |
| `/api/audit-logs`                | audit trail (property-joined)                             |
| `/api/copilot`                   | `POST /draft` AI draft generation                         |
| `/api/databricks`, `/api/github` | server-side integration status checks                     |

Errors: 4xx responses carry an actionable message; 5xx collapse to `{ "error": "Internal server error", "request_id": "<uuid>" }`. Full details are logged server-side against the same `request_id` (returned as `X-Request-Id`).

## Testing

```bash
cd backend   && npm ci && npm test   # 20 suites / 467 tests: routes, auth, refresh/revocation, roles, crypto, prompt fencing, email/webhook/notification/report services, accessibility, i18n
cd extension && npm ci && npm test   # sidepanel, silent refresh, content scripts, config override
```

Backend type check: `cd backend && npx tsc -p tsconfig.build.json --noEmit` (clean as of October 2, 2026).

Logging is suppressed under Jest; set `LOG_VERBOSE=1` to see it. CI also runs a source-corruption guard: raw control characters fail the build, mid-token line splits are reported as advisories (`node scripts/check-source-corruption.mjs`).

## Integrations

- **Neon**: `DATABASE_URL` takes precedence over individual `DB_*` settings; keep `sslmode=require`.
- **Databricks**: server-side SQL Statement Execution client at `backend/src/services/databricksService.ts`, status at `GET /api/databricks/status` (`DATABRICKS_HOST`, `DATABRICKS_TOKEN`, optional `DATABRICKS_WAREHOUSE_ID`).
- **GitHub**: server-side REST client at `backend/src/services/githubService.ts`, status at `GET /api/github/status` (`GITHUB_TOKEN`).

Tokens never reach the browser and are never logged.

## Local development

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
   (:3000, proxies to `REACT_APP_API_URL`). The dashboard is behind a login gate
   :
   it validates any stored token against `GET /api/auth/me` before rendering, and
   sends you back to the login form on a 401 from any endpoint.

### Sessions

Authentication is a short-lived access token plus a revocable refresh token.

|                    | Access token                  | Refresh token                                |
| ------------------ | ----------------------------- | -------------------------------------------- |
| Form               | JWT, signed with `JWT_SECRET` | opaque random string, 32 bytes               |
| Lifetime           | `JWT_TTL`, default **15m**    | `REFRESH_TOKEN_TTL_DAYS`, default **30d**    |
| Stored server-side | no                            | yes — SHA-256 hash only, in `refresh_tokens` |
| Revocable          | not directly                  | yes, immediately                             |

The access token stays stateless so no request pays for a database lookup, which
is why it is short: expiry is the only bound on a stolen or de-privileged one.
Anything long-lived is the refresh token, whose state lives in Postgres and can
be revoked.

- `POST /api/auth/login`, `POST /api/auth/register` → `{ token, expires_in, refresh_token, user }`
- `POST /api/auth/refresh` → new `token` **and** a new `refresh_token`
- `POST /api/auth/logout` → 200, revokes the session
- `POST /api/auth/logout-all` → revokes every session for the caller

The dashboard opts into refresh-token cookies with `X-Refresh-Token-Transport: cookie` on login, refresh, and logout. Those responses omit `refresh_token` and instead set/rotate an HttpOnly, Secure, SameSite=None cookie scoped to `/api/auth`. Dashboard requests send credentials, and the backend must allow its exact origin through `CORS_ORIGIN`. Run the dashboard/API over HTTPS outside localhost. Extension clients without the header continue to use the JSON refresh-token contract.

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
expires, so revocation takes
effect within one access-token lifetime (15 minutes
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

Add this key in
the project's **Keys** tab:

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

| Variable                  | Required | Description                                                                       |
| ------------------------- | -------: | --------------------------------------------------------------------------------- |
| `DATABRICKS_HOST`         |      yes | Databricks workspace URL, for example `https://dbc-xxxxxxxx.cloud.databricks.com` |
| `DATABRICKS_TOKEN`        |      yes | Databricks personal access token or service-principal token                       |
| `DATABRICKS_WAREHOUSE_ID` | optional | SQL warehouse ID used when executing statements                                   |

The integration does not log or return token values. Create the workspace and token in Databricks, then add the variables above to the Keys tab. `DATABRICKS_WAREHOUSE_ID` is needed when calling `executeSql` without passing a warehouse ID explicitly.

## GitHub integration

The backend includes a server-side GitHub REST API client at `backend/src/services/github.js` and an authenticated configuration check at `GET /api/github/status`. The token stays on the server and is never returned to the browser.

Add this key in the project's **Keys** tab:

```text
GITHUB_TOKEN=your_github_token
```

Create a least-privilege token with only the repository permissions your deployment needs. Never commit the token or expose it in extension code.

## Deployment

- **Backend**: any Node host. Production requires `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `MISTRAL_API_KEY`, `MISTRAL_MODEL`, `WIFI_ENCRYPTION_KEY`, and a registration policy. The server refuses to boot without `CORS_ORIGIN` in production rather than reflecting every origin.
- **Dashboard**: static build (`npm run build`), served by the backend in production.
- **Extension**: load unpacked; no build step.

## Development

npm workspaces: `npm run install:all`, `npm run build:all`, `npm run test`, `npm run lint`, `npm run typecheck`. Schema changes go through TypeORM migrations (`synchronize` is off). Note: the husky pre-commit hook currently references a nonexistent `lint:check` script and fails; commit with `--no-verify` until the hook is fixed.

- [CONTRIBUTING.md](CONTRIBUTING.md) — setup, conventions, PR checklist
- [CHANGELOG.md](CHANGELOG.md) — notable changes
- [docs/](docs/) — environment setup, test plan, ADRs, Neon branch workflow
