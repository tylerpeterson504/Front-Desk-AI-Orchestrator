# 🚀 Environment Setup Guide

This guide walks you through setting up **Front-Desk-AI-Orchestrator** for
development and testing.

---

## 📋 Prerequisites

| Tool | Version | Verification Command |
|------|---------|---------------------|
| **Node.js** | v22+ (CI uses 24) | `node --version` |
| **npm** | v10+ | `npm --version` |
| **Git** | Latest | `git --version` |
| **PostgreSQL** | 14+ (or a Neon connection string) | `psql --version` |
| **Chrome** | Latest | — (for the extension) |

---

## 🛠️ Quick Setup (Local Development)

### 1. Clone and install

```bash
git clone https://github.com/tylerpeterson504/Front-Desk-AI-Orchestrator.git
cd Front-Desk-AI-Orchestrator

npm install              # root dev tooling
cd backend   && npm install && cd ..
cd dashboard && npm install && cd ..
cd extension && npm install && cd ..
```

### 2. Configure backend environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
# Required
MISTRAL_API_KEY=your_mistral_api_key_here
JWT_SECRET=at_least_32_random_characters
DATABASE_URL=postgresql://username:password@localhost:5432/frontdesk_ai

# Local dev conveniences
PORT=3001
NODE_ENV=development
REGISTRATION_MODE=open

# Recommended
WIFI_ENCRYPTION_KEY=base64_or_hex_32_bytes
CORS_ORIGIN=http://localhost:5173
```

Generate strong secrets:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"          # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"       # WIFI_ENCRYPTION_KEY
```

> The server refuses to boot without `MISTRAL_API_KEY`, `JWT_SECRET`, and
> `DATABASE_URL`. A placeholder Mistral key is fine when you are not testing the
> copilot locally.

### 3. Provide a database

**Option A: Local PostgreSQL**

```bash
# Create database and user, then set DATABASE_URL in backend/.env
createdb frontdesk_ai
```

**Option B: Neon (recommended — the app is Neon-compatible)**

1. Create a project at [console.neon.tech](https://console.neon.tech).
2. Copy the **pooled** connection string from Connection Details.
3. Set it as `DATABASE_URL` (keep `sslmode=require`).

Use a dev branch in the Neon console so you never point local work at production.

**Option C: Docker Compose (all-local stack)**

```bash
docker-compose up -d
# backend :3001, dashboard :5173, postgres :5432, pgadmin :5050
```

### 4. Run migrations and seed

Schema migrations run automatically when the backend starts. To set up
explicitly (migrations + demo data, seeding is skipped when users exist):

```bash
cd backend
npm run db-setup
```

Demo login: `demo@example.com` / `password123` only when `db-setup` creates
the demo account (seeding is skipped when users exist).

### 5. Start the dev servers

```bash
# Terminal 1 — backend (port 3001)
cd backend && npm run dev

# Terminal 2 — dashboard (Vite, port 5173, proxies /api → :3001)
cd dashboard && npm run dev
```

Or both from the root: `npm run dev`.

> The dashboard reads its API base URL from `VITE_API_URL` (default
> `http://localhost:3001/api`). Set it in `dashboard/.env` when the backend is
> elsewhere.

### 6. Load the Chrome extension

```bash
cd extension && npm run build   # outputs to extension/dist
```

1. Open `chrome://extensions/` → enable **Developer mode**
2. **Load unpacked** → select the `extension/dist` folder
3. Open the side panel, log in with dashboard credentials, and (for a deployed
   backend) set the **Backend URL** in the popup

---

## 🧪 Testing

```bash
# Backend (Jest) — requires JWT_SECRET, MISTRAL_API_KEY, DATABASE_URL in env
(cd backend && npm test)

# Dashboard (Vitest)
(cd dashboard && npm test)

# Extension (Vitest)
(cd extension && npm test)
```

CI runs `npm run typecheck`, lint, and the backend suite with placeholder env
values — see `.github/workflows/ci.yml`.

### Smoke test the API

```bash
curl http://localhost:3001/health
# {"status":"ok"}

# Login (seeded demo user)
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"password123"}'
# → { token, expires_in, refresh_token, refresh_expires_at, user }

# Draft with the copilot (needs a real MISTRAL_API_KEY)
curl -X POST http://localhost:3001/api/copilot/draft \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -H "X-Invite-Token: <token if REGISTRATION_MODE=invite>" \
  -d '{"template_ids":[1],"tone":"professional"}'
```

---

## 📊 Expected Results

| Component | URL | Expected |
|-----------|-----|----------|
| Backend health | http://localhost:3001/health | `{"status":"ok"}` |
| Dashboard | http://localhost:5173 | Login page renders |
| Database | localhost:5432 (or Neon) | Backend logs `Database connected` |

---

## 🔧 Troubleshooting

**Port already in use**

```bash
lsof -i :3001            # macOS/Linux
netstat -ano | findstr :3001   # Windows
```

**Missing environment variables** — the server exits at boot naming the missing
vars; add them to `backend/.env`.

**Database connection failed** — verify `DATABASE_URL`, that Postgres is running,
and `sslmode=require` for hosted databases.

**Mistral not configured** — `MISTRAL_API_KEY` missing: the server refuses to
boot; set at least a placeholder for local dev.

**TypeScript errors** — `npm run typecheck` from the root.

**Dashboard can't reach the API** — check `VITE_API_URL` and that the backend is
on 3001; the Vite dev server proxies `/api` automatically.

---

## 📝 Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MISTRAL_API_KEY` | ✅ | — | Mistral AI API key (boot requirement) |
| `JWT_SECRET` | ✅ | — | ≥32 chars; signs access tokens |
| `DATABASE_URL` | ✅ | — | Postgres/Neon connection string (overrides `DB_*`) |
| `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` | alt | — | Individual DB settings when `DATABASE_URL` is unset |
| `PORT` | ❌ | 3001 | Backend port |
| `NODE_ENV` | ❌ | development | development / test / production |
| `JWT_TTL` | ❌ | 15m | Access-token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | ❌ | 30 | Session lifetime |
| `WIFI_ENCRYPTION_KEY` | prod ✅ | JWT_SECRET fallback | AES-256-GCM key (≥32 chars) |
| `CORS_ORIGIN` | prod ✅ | localhost regexes | Comma-separated allowed origins |
| `REGISTRATION_MODE` | ❌ | invite | open / invite / closed |
| `REGISTRATION_INVITE_TOKEN` | when invite | — | Invite token for registration |
| `MISTRAL_MODEL` | ❌ | mistral-small-latest | Model override |
| `MISTRAL_BASE_URL` | ❌ | https://api.mistral.ai | Endpoint override |
| `DATABRICKS_HOST`/`DATABRICKS_TOKEN`/`DATABRICKS_WAREHOUSE_ID` | ❌ | — | Databricks integration |
| `GITHUB_TOKEN` | ❌ | — | GitHub integration |
| `LOG_LEVEL` | ❌ | info | error/warn/info/debug/silly |
| `RUN_SEEDS` | ❌ | — | Enables seeding in db scripts |

### Dashboard (`dashboard/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | ❌ | http://localhost:3001/api | Backend API base URL (routes are under `/api`) |

---

## 🗝️ Getting a Mistral API Key

1. Sign up at [console.mistral.ai](https://console.mistral.ai/)
2. Create an API key under **API Keys**
3. Add it to `backend/.env` as `MISTRAL_API_KEY` (never commit it)

---

## 📚 Additional Resources

- [README.md](../README.md) — architecture and security model
- [CONTRIBUTING.md](../CONTRIBUTING.md) — scripts and PR guidelines
- [docs/TEST_PLAN.md](TEST_PLAN.md) — manual test walkthrough
- [docs/neon-branch-workflow.md](neon-branch-workflow.md) — PR preview databases
- [Mistral Documentation](https://docs.mistral.ai/)
- [Vite Documentation](https://vitejs.dev/)
- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)

---

## 🙏 Support

If you hit an issue not covered here, open a GitHub issue with:

- Steps to reproduce
- Error messages and logs
- Your environment (Node.js version, OS, database)
