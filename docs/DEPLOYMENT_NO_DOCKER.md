# Deployment without Docker

This project deploys on **Render** using its native Node runtime — no Docker,
no containers, no images. The backend compiles to plain JavaScript and runs
as a Node process; the dashboard is a static bundle behind Render's CDN.

- **Backend**: `render.yaml` → `frontdesk-backend` (native Node web service)
- **Dashboard**: `render.yaml` → `frontdesk-dashboard` (static site)
- **Database**: [Neon](https://neon.tech) Postgres (pooled connection string)

## 1. Database (Neon)

1. Create a Neon project and copy the **pooled** connection string
   (host contains `-pooler`). Keep `sslmode=require`.
2. Set it as the `DATABASE_URL` secret for the backend service (step 2).
3. Migrations run automatically before each deploy via `preDeployCommand`
   (`npm run migrate`, which executes the compiled TypeORM runner at
   `backend/dist/db/migrate.js` against `DATABASE_URL`).

## 2. Backend service

The blueprint in `render.yaml` at the repo root defines everything. To use it:

1. Push this branch/merge to `main`.
2. In the Render dashboard: **New → Blueprint**, select this repository.
   Render reads `render.yaml` and creates both services.
3. Fill in the secrets it prompts for (never commit these):

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Neon pooled connection string with `sslmode=require` |
| `JWT_SECRET` | 32+ random chars; the backend refuses to boot without it |
| `MISTRAL_API_KEY` | Mistral AI API key |
| `CORS_ORIGIN` | Comma-separated list; must include your dashboard URL and the extension origin (`chrome-extension://…`) in production |
| `WIFI_ENCRYPTION_KEY` | Optional; 32+ chars if you encrypt property WiFi passwords |

`REGISTRATION_MODE` defaults to `invite` in the blueprint (safer than `open`
for a public deployment; the backend also accepts `closed`).

Build/start commands (also in `render.yaml`):

```bash
npm install --legacy-peer-deps --no-audit --no-fund --ignore-scripts
npm run build          # tsc -p tsconfig.build.json -> dist/
npm start              # node dist/index.js
```

Health checks hit `GET /health` (defined in `backend/src/index.ts`).

## 3. Dashboard static site

Same blueprint. `VITE_API_URL` must be set to the backend's public URL
(e.g. `https://frontdesk-backend.onrender.com`) at build time — Vite inlines
`VITE_*` env vars during `npm run build`, so set it in the Render env-var
prompt, not in a committed `.env`.

Client-side routes fall back to `index.html` via the rewrite rule in
`render.yaml`.

## 4. Chrome extension

Point the extension at the deployed backend by setting its API base URL to
the backend's public origin, and add that origin to `CORS_ORIGIN`. The
extension already allows `https://` origins in production config.

## 5. Local development without Docker

```bash
# Terminal 1 — backend (requires a DATABASE_URL, e.g. a Neon dev branch)
cd backend
DATABASE_URL="postgresql://..." npm run dev

# Terminal 2 — dashboard
cd dashboard
npm run dev            # proxies /api to localhost:3001
```

No local Postgres is required if you use a Neon branch for development;
Neon's per-PR branch workflow (`.github/workflows/neon-branch.yml`) already
exercises migrations this way.

## Notes

- Node **24** is required everywhere (`engines` in all three `package.json`
  files); Render's native runtime reads `engines` and picks Node 24.
- Schema changes: add a TypeORM migration under `backend/src/migrations/`,
  then deploy — the release phase runs migrations before the new code
  serves traffic.
- The old Docker files (`Dockerfile.backend`, `Dockerfile.dashboard`,
  `docker-compose.yml`) were removed with the migration to this setup.
