# Front Desk AI Orchestrator

A secure Chrome extension with dashboard for hotel front desk AI assistance. Content
scripts scrape guest/chat context from Stayntouch PMS and Akia messaging, the side panel
assembles property + templates + context, the backend `/api/copilot/draft` enriches the
request with authoritative records and calls the LLM, and the draft is rendered in the
side panel for review before copy or injection.

## Architecture

| Component | Stack | Path |
|-----------|-------|------|
| Backend | Node.js (Express, TypeScript), PostgreSQL via TypeORM (Neon-compatible), JWT auth | `backend/` |
| Dashboard | React 18 (Vite, TypeScript, Tailwind) | `dashboard/` |
| Extension | Chrome MV3 (side panel, content scripts, TypeScript) | `extension/` |

Each package has its own `package.json` and is installed/tested from its own directory
(there are no npm workspaces). Helper scripts at the root delegate to the packages.

## Repository layout

```
backend/    Express API — src/{config,entities,lib,middleware,migrations,routes,services}, db/, tests/
dashboard/  React SPA — src/{components,pages,services,stores,types}, tests/
extension/  Chrome MV3 — src/{background,content,popup,sidepanel}, manifest.json, tests/
docs/       Setup, test plan, ADRs, workflow guides
hf-space/   Standalone Hugging Face Space demo (not part of the app)
```

## AI copilot (Mistral)

Draft generation runs **server-side only** in `backend/src/services/copilotService.ts`,
which calls Mistral's OpenAI-compatible chat-completions endpoint
(`backend/src/services/llm/mistralClient.ts`). The API key never reaches the extension
or dashboard.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MISTRAL_API_KEY` | yes | — | [Mistral platform](https://console.mistral.ai/) API key |
| `MISTRAL_MODEL` | no | `mistral-small-latest` | Model override |
| `MISTRAL_BASE_URL` | no | `https://api.mistral.ai` | Endpoint override (e.g. gateway) |

The server refuses to boot without `MISTRAL_API_KEY` (it is checked alongside
`JWT_SECRET` and `DATABASE_URL` at startup). If the key is missing at request time the
copilot route errors and the extension falls back to local template stitching, so
offline dev still works.

`GOOGLE_API_KEY` / `PERPLEXITY_API_KEY` appear in the env schema for compatibility but
are **not read** by the current provider chain — the copilot calls Mistral only.

### Prompt-injection defenses

- `guest_info` and `chat_context` arrive from third-party pages and are treated as
  untrusted: unknown keys dropped, values length-capped (200 chars/field, 1000/message,
  max 20 messages, 10 template ids), control characters stripped.
- Scrubbed values are wrapped in `<<<UNTRUSTED_DATA … UNTRUSTED_DATA>>>` fences; the
  system prompt instructs the model to never treat fenced content as instructions.
- Any fence markers inside untrusted text are neutralized so a guest cannot close the
  fence early.
- The prompt builder never includes `wifi_password`; the copilot's property `SELECT`
  omits the column, and tests assert the prompt cannot leak it.

### Prompt scoping

Properties and templates are resolved server-side and scoped to the authenticated
user's `user_id`; a foreign resource id yields 403. The LLM only ever sees
staff-approved text owned by the caller.

## Accounts and roles

Every new account is created as `agent` — the register route ignores any `role` field
and `createUser` applies `DEFAULT_ROLE = 'agent'`. Promotion happens two ways:

- `PATCH /api/auth/users/:id/role` — requires an authenticated `admin`
- `npm run set-role -- someone@example.com admin` — server-side bootstrap for the
  first admin (run from `backend/`, uses `db/set-role.ts`)

Registration is gated by `REGISTRATION_MODE` (see `backend/src/config/registration.ts`):

| Mode | Behaviour |
|------|-----------|
| `invite` | Requires an invite token (`X-Invite-Token` header or `invite_token` body field) matching `REGISTRATION_INVITE_TOKEN` |
| `open` | Anyone may register |
| `closed` | Registration disabled (403) |

Unset defaults to `invite` (per the zod schema default), so set `open` explicitly for
local dev. `GET /api/auth/registration-mode` reports the current mode to clients.

## Sessions

Authentication is a short-lived JWT access token plus a revocable opaque refresh token
(`backend/src/services/refreshTokenService.ts`).

| | Access token | Refresh token |
|---|---|---|
| Form | JWT signed with `JWT_SECRET` | 64-byte random string (`base64url`) |
| Lifetime | `JWT_TTL`, default **15m** | `REFRESH_TOKEN_TTL_DAYS`, default **30d** |
| Stored server-side | no | yes — `refresh_tokens` table, `is_revoked` flag |
| Revocable | not directly | yes, immediately |

- `POST /api/auth/register`, `POST /api/auth/login` → `{ token, expires_in, refresh_token, refresh_expires_at, user }`
- `POST /api/auth/refresh` → new access token **and** a new refresh token (the old
  session is left in place; rotate by revoking on use if desired)
- `POST /api/auth/logout` → revokes the presented refresh session (invalid tokens are
  logged and ignored)
- `POST /api/auth/logout-all` → revokes every session for the caller (requires the
  access token)
- `GET /api/auth/me` → current user for the access token

Both clients refresh silently: a 401 triggers one refresh and one replay, and only a
failed refresh returns the user to the login screen. Expired rows can be cleared with
`npm run prune-sessions` (from `backend/`).

Revocation caveat: an access token already issued stays valid until it expires, so
logout/role changes take effect within one access-token lifetime (15 minutes by
default) on other devices. Shorten `JWT_TTL` to narrow the window.

## Secrets at rest

`properties.wifi_password` is encrypted with AES-256-GCM before insert/update
(`backend/src/lib/secretBox.ts`). The key is derived from `WIFI_ENCRYPTION_KEY`
(≥32 chars, base64 or hex) via PBKDF2 (100k iterations); when unset it falls back to
`JWT_SECRET` and a warning applies — set `WIFI_ENCRYPTION_KEY` in production.

Generate a key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Decryption happens only inside the audit-logged `GET /api/properties/:id/wifi` route
(requires authentication). Legacy plaintext rows pass through unchanged; to backfill:

```bash
cd backend && WIFI_ENCRYPTION_KEY=... npm run encrypt-wifi
```

The backfill is idempotent — rows that already look encrypted are skipped.

## Error responses

Routes never return driver error messages. 4xx responses carry an actionable
validation message; 5xx responses collapse to
`{ "error": "Internal server error", "code": "INTERNAL_ERROR", "requestId": "<uuid>" }`.
The full error and stack are logged server-side against the same request id (also
returned as the `X-Request-Id` header). All responses follow this shape via
`backend/src/lib/responseBuilder.ts` and the error handler in
`backend/src/middleware/errorHandler.ts`.

## HTTP API

All routes are versioned under `/api`, rate-limited (200 req/15min general; 20 req/15min
on auth guessing endpoints; refresh capped at 120), and behind Helmet plus input
sanitization. Health check: `GET /health` → `{"status":"ok"}`.

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/auth/register` | invite-gated | Create account (always `agent`) |
| `POST /api/auth/login` | — | Email + password → token pair |
| `POST /api/auth/refresh` | refresh token | Rotate both tokens |
| `POST /api/auth/logout` / `logout-all` | — / access token | Revoke session(s) |
| `GET /api/auth/me` | access token | Current user |
| `GET /api/auth/registration-mode` | — | Report registration policy |
| `PATCH /api/auth/users/:id/role` | admin | Change a user's role |
| `GET/POST/PUT/DELETE /api/properties` (+ `/:id`, `/:id/wifi`) | varies¹ | Property CRUD; wifi read is auth'd + audit-logged |
| `GET/POST/PUT/DELETE /api/templates` (+ `/:id`) | access token | Template CRUD, scoped to caller |
| `GET/POST/PUT/DELETE /api/shift-notes` (+ `/:id`) | access token | Shift notes |
| `GET /api/audit-logs` | access token | Audit log listing |
| `POST /api/copilot/draft` | access token | LLM draft generation |
| `GET /api/databricks/status` | access token | Server-side Databricks config check |
| `GET /api/github/status` | access token | Server-side GitHub config check |

¹ Property CRUD routes other than `/:id/wifi` currently do **not** require the access
token (a known gap; see Security notes).

## Testing

```bash
cd backend   && npm install && npm test   # Jest — routes, auth, sessions, roles, registration gating, validation, errors, llm client, copilot fencing
cd extension && npm install && npm test   # Vitest — sidepanel, content scripts, observer debouncing, config override
cd dashboard && npm install && npm test   # Vitest — stores
```

Backend tests need `JWT_SECRET`, `MISTRAL_API_KEY`, and `DATABASE_URL` in the
environment (CI sets dummies; see `.github/workflows/ci.yml`). Logging is JSON via
winston; set `LOG_LEVEL=debug` for more detail.

## Local development

There is no container setup required — the database is Postgres (Neon-compatible
connection string or individual `DB_*` vars), so local dev can talk to a Neon branch
directly. `docker-compose.yml` exists for an all-local stack (Postgres + backend +
dashboard + PGAdmin) if you prefer it.

1. **Configure the backend** — copy `backend/.env.example` to `backend/.env` and set:
   - `DATABASE_URL` — Postgres/Neon connection string (`sslmode=require` for hosted;
     migrations also run automatically at server start)
   - `JWT_SECRET` — ≥32 chars
   - `MISTRAL_API_KEY` — required for boot; dummy value is fine for non-copilot dev
   - `REGISTRATION_MODE=open` for local signup
2. **Install & run the API**:
   ```bash
   cd backend && npm install && npm run dev    # listens on PORT (default 3001)
   ```
3. **Run the dashboard** in a second shell:
   ```bash
   cd dashboard && npm install && npm run dev  # Vite on :5173, proxies /api → :3001
   ```
   The dashboard is behind a login gate; a 401 from any endpoint routes back to the
   login form. The API base URL comes from `VITE_API_URL` (default
   `http://localhost:3001/api`, matching the local backend).
4. **Seed demo data** (optional):
   ```bash
   cd backend && npm run db-setup   # migrations + seed; skips when users exist
   ```
   Demo login: `demo@example.com` / `password123` (`agent` role).

Tailwind is compiled by PostCSS through Vite (`dashboard/tailwind.config.js`,
`dashboard/src/index.css`) — no CDN script; `npm run build` produces the stylesheet in
`dashboard/dist`.

Postgres is only reachable over TLS when hosted (Neon), so keep `sslmode=require` in
the connection string.

## Chrome extension

1. Build once:
   ```bash
   cd extension && npm install && npm run build   # outputs to extension/dist
   ```
2. Open `chrome://extensions/` → Developer mode → **Load unpacked**
3. Select the `extension/dist` folder

The API base URL is centralized in `extension/src/config.ts` (`http://localhost:3001`
by default). To point an install at a deployed backend, open the extension popup,
enter the URL under **Backend URL** and save — no code edit and no repackaging. The
value is stored in `chrome.storage.local` as `apiBaseUrl`, validated as an `http(s)`
origin, and picked up by the side panel and content scripts (including live changes).
Clearing the field restores the default.

Because the target backend origin is unknown at packaging time, the manifest ships
only localhost/127.0.0.1 in `host_permissions` and declares `http://*/*` +
`https://*/*` as `optional_host_permissions`. Saving a custom URL triggers a runtime
permission request for just that origin, so Chrome asks the operator instead of the
extension holding blanket access.

Content-script host matches (MV3 manifest):
- `https://app.us1.stayntouch.com/*` — guest info extraction (Stayntouch PMS)
- `https://sys.akia.ai/*` — chat context capture + message injection (Akia)

## Integrations (server-side only)

### Databricks

Server-side SQL Statement Execution client (`backend/src/services/databricksService.ts`)
with an authenticated config check at `GET /api/databricks/status`.

| Variable | Required | Description |
|---|---:|---|
| `DATABRICKS_HOST` | yes | Workspace URL, e.g. `https://dbc-xxxxxxxx.cloud.databricks.com` |
| `DATABRICKS_TOKEN` | yes | Personal access or service-principal token |
| `DATABRICKS_WAREHOUSE_ID` | optional | SQL warehouse for `executeSql` when not passed explicitly |

### GitHub

Server-side REST client (`backend/src/services/githubService.ts`) with config check at
`GET /api/github/status`. Set `GITHUB_TOKEN` (least-privilege). The token stays on the
server and is never returned to the browser.

### Hugging Face Space (standalone)

`hf-space/` and `hf-space-static/` are self-contained demo pages for
[Qwen/Qwen3-32B](https://huggingface.co/Qwen/Qwen3-32B) chat via HF Inference
Providers, unrelated to the main application stack. See `hf-space/README.md`.

## Deployment

- **Backend**: any Node host. `npm install && npm run build && npm run start`
  (compiles to `dist/` via `tsc`; `node dist/index.js` on `PORT`, default 3001).
  Production requires `DATABASE_URL` (or `DB_*`), `JWT_SECRET`, `MISTRAL_API_KEY`,
  `CORS_ORIGIN`, `WIFI_ENCRYPTION_KEY`, a registration policy
  (`REGISTRATION_MODE` + `REGISTRATION_INVITE_TOKEN` when `invite`). The server refuses
  to boot without `CORS_ORIGIN` in production rather than reflecting every origin.
- **Dashboard**: static Vite build (`npm run build` → `dashboard/dist`). The backend
  can also serve a built SPA, but note it currently looks for `dashboard/build`
  (`backend/src/index.ts`) — align the output dir or host the build statically.
- **Extension**: `npm run build` and load unpacked from `extension/dist` (not for
  Chrome Web Store distribution without repackaging).

## Security notes

- Passwords: bcrypt (configurable rounds via `BCRYPT_ROUNDS`, default 12; min password
  length 12 per `MIN_PASSWORD_LENGTH` in `userService`).
- Rate limiting: general API 200/15min; auth endpoints 20/15min (refresh and logout
  excluded from the auth limiter but capped at 120/15min); SPA shell 1000/15min.
  `app.set('trust proxy', 1)` is set for reverse-proxy deploys.
- Helmet + custom security headers + input sanitization middleware on every request;
  JSON body capped at 256kb.
- Refresh tokens are stored as plaintext columns in `refresh_tokens` (not hashed) —
  treat the database as the trust boundary; revocation is the primary control.
- Property CRUD routes (other than wifi read) currently lack `authenticateToken` —
  tracked as a known gap; do the same work behind the token before exposing
  properties of multiple tenants.
- `LOGIN_CREDENTIALS.md` and `JWT_TOKEN_GUIDE.md` in the repo root contain dev/demo
  credentials and workflow notes. Never commit real secrets — regenerate everything
  for production (the repo history already contains exposed dev values).

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) — guidelines, scripts, commit conventions
- [docs/ENVIRONMENT_SETUP.md](docs/ENVIRONMENT_SETUP.md) — step-by-step setup
- [docs/TEST_PLAN.md](docs/TEST_PLAN.md) — manual test walkthrough
- [docs/adr/001-vite-migration.md](docs/adr/001-vite-migration.md) — why Vite
- [docs/neon-branch-workflow.md](docs/neon-branch-workflow.md) — PR-scoped Neon branches

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Quick checks before opening a PR:

```bash
npm run typecheck   # backend + dashboard
npm run lint        # eslint
npm test            # backend + dashboard suites
```

## License

This project is private and proprietary.
