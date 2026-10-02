# Front Desk AI Orchestrator

A hotel front desk assistant: a Chrome extension that captures guest context from the PMS and messaging pages, a backend that drafts AI-assisted replies with the property's approved templates, and a React dashboard for managing properties, templates, shift notes, and escalations.

## Architecture

| Component | Stack | Path |
|---|---|---|
| Backend | Node.js (Express), PostgreSQL/Neon, TypeORM, JWT auth | `backend/` |
| Dashboard | React, Vite, Tailwind | `dashboard/` |
| Extension | Chrome MV3 (side panel, content scripts) | `extension/` |

Request flow: content scripts scrape guest/chat context from Stayntouch PMS and Akia messaging → the side panel assembles property + templates + context → the backend `/api/copilot/draft` enriches the request with authoritative property/template records and calls the LLM → the draft renders in the side panel for review → copy or inject.

## Quick start

Requires Node.js >= 22 and a Neon PostgreSQL connection string.

```bash
npm run install:all
cp backend/.env.example backend/.env   # set DATABASE_URL, JWT_SECRET, MISTRAL_API_KEY
cd backend && npm run db-setup          # migrations + demo seed
npm run dev                             # backend :3001 + dashboard :3000
```

Demo login: `demo@example.com` / `password123`.

Load the extension from `chrome://extensions/` → Developer mode → Load unpacked → `extension/`. Point it at the backend via the popup's **Backend URL** field — no repackaging needed. Details: [extension/README.md](extension/README.md).

## AI copilot (Mistral)

Draft generation runs server-side only via `backend/src/services/copilotService.ts` through `backend/src/services/llm/mistralClient.ts`. The API key never reaches the extension or dashboard.

| Variable | Required | Description |
|---|---|---|
| `MISTRAL_API_KEY` | yes | Mistral API key (server exits at boot without it) |
| `MISTRAL_BASE_URL` | no | API base URL override (proxy/self-host) |
| `CORS_ORIGIN` | production | Comma-separated allowed browser origins |

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

| Route group | Purpose |
|---|---|
| `/api/auth` | login, register, refresh, logout, role management |
| `/api/properties` | property records, Wi-Fi reveal (audit-logged) |
| `/api/templates` | message templates with no-promise validation at save time |
| `/api/shift-notes` | per-property shift notes |
| `/api/escalations` | guest-request escalation and assignment |
| `/api/audit-logs` | audit trail (property-joined) |
| `/api/copilot` | `POST /draft` AI draft generation |
| `/api/databricks`, `/api/github` | server-side integration status checks |

Errors: 4xx responses carry an actionable message; 5xx collapse to `{ "error": "Internal server error", "request_id": "<uuid>" }`. Full details are logged server-side against the same `request_id` (returned as `X-Request-Id`).

## Testing

```bash
cd backend   && npm ci && npm test   # routes, auth, refresh/revocation, roles, crypto, prompt fencing
cd extension && npm ci && npm test   # sidepanel, silent refresh, content scripts, config override
```

Logging is suppressed under Jest; set `LOG_VERBOSE=1` to see it. CI also runs a source-corruption guard: raw control characters fail the build, mid-token line splits are reported as advisories (`node scripts/check-source-corruption.mjs`).

## Integrations

- **Neon**: `DATABASE_URL` takes precedence over individual `DB_*` settings; keep `sslmode=require`.
- **Databricks**: server-side SQL Statement Execution client at `backend/src/services/databricksService.ts`, status at `GET /api/databricks/status` (`DATABRICKS_HOST`, `DATABRICKS_TOKEN`, optional `DATABRICKS_WAREHOUSE_ID`).
- **GitHub**: server-side REST client at `backend/src/services/githubService.ts`, status at `GET /api/github/status` (`GITHUB_TOKEN`).

Tokens never reach the browser and are never logged.

## Deployment

- **Backend**: any Node host. Production requires `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `WIFI_ENCRYPTION_KEY`, `MISTRAL_API_KEY`, and a registration policy. The server refuses to boot without `CORS_ORIGIN` in production rather than reflecting every origin.
- **Dashboard**: static build (`npm run build`), served by the backend in production.
- **Extension**: load unpacked; no build step.

## Development

npm workspaces: `npm run install:all`, `npm run build:all`, `npm run test`, `npm run lint:check`, `npm run typecheck`. Schema changes go through TypeORM migrations (`synchronize` is off).

- [CONTRIBUTING.md](CONTRIBUTING.md) — setup, conventions, PR checklist
- [CHANGELOG.md](CHANGELOG.md) — notable changes
- [docs/](docs/) — environment setup, test plan, ADRs, Neon branch workflow
