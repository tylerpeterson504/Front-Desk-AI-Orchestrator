# 🧪 Comprehensive Test Plan for Front-Desk-AI-Orchestrator

Step-by-step guide to verify the whole project after a change.

---

## 📋 Prerequisites

1. **Node.js v24+** and **npm v10+**
2. **PostgreSQL** reachable via `DATABASE_URL` (local or Neon)
3. **Mistral API key** (a placeholder works for everything except live copilot tests)
4. **Chrome** for extension testing

---

## 🛠️ Step 1: Environment Setup

```bash
git clone https://github.com/tylerpeterson504/Front-Desk-AI-Orchestrator.git
cd Front-Desk-AI-Orchestrator
REPO_ROOT="$(pwd)"   # keep this in the shell used for later steps

(cd "$REPO_ROOT" && npm install)
(cd "$REPO_ROOT/backend"   && npm install)
(cd "$REPO_ROOT/dashboard" && npm install)
(cd "$REPO_ROOT/extension" && npm install)
```

Create `backend/.env` (copy from `backend/.env.example`):

```env
DATABASE_URL=postgresql://user:password@localhost:5432/frontdesk_ai
JWT_SECRET=your_very_strong_jwt_secret_here
MISTRAL_API_KEY=your_mistral_api_key_here
WIFI_ENCRYPTION_KEY=your_32_byte_base64_encryption_key_here

# Optional
CORS_ORIGIN=http://localhost:5173
REGISTRATION_MODE=open
```

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Full setup details: [ENVIRONMENT_SETUP.md](ENVIRONMENT_SETUP.md).

---

## 🔍 Step 2: Code Quality Verification

### 2.1 Type checking

```bash
(cd "$REPO_ROOT" && npm run typecheck)              # backend + dashboard
(cd "$REPO_ROOT/extension" && npx tsc --noEmit)     # extension (no root script)
```

**Expected**: no errors.

### 2.2 Linting

```bash
(cd "$REPO_ROOT" && npm run lint)
(cd "$REPO_ROOT" && npm run lint:fix)   # auto-fix
```

### 2.3 Formatting

```bash
(cd "$REPO_ROOT" && npm run format:check)
```

---

## 🧪 Step 3: Backend Tests

```bash
(cd "$REPO_ROOT/backend" && npm test)                 # Jest, --runInBand
(cd "$REPO_ROOT/backend" && npm run test:coverage)    # with coverage report
```

The suite needs `JWT_SECRET`, `MISTRAL_API_KEY`, and `DATABASE_URL` in the
environment (CI sets placeholder values). Route tests that touch the database
require a reachable Postgres; the rest mock the repository layer.

### Start the dev server

```bash
(cd "$REPO_ROOT/backend" && npm run dev)
```

**Expected**: server starts on port 3001, logs `Database connected` and
`Migrations applied`, then:

```bash
curl http://localhost:3001/health
# {"status":"ok"}
```

---

## 🖥️ Step 4: Dashboard

```bash
(cd "$REPO_ROOT/dashboard" && npm run dev)
```

**Expected**: Vite dev server at `http://localhost:5173`.

1. Open `http://localhost:5173`
2. Set `VITE_API_URL` if the backend is not at `http://localhost:3001/api`
3. Register/login and verify pages render (Properties, Templates, Shift Notes)
4. DevTools console: no errors, no 404s, no CORS errors

Dashboard unit tests: `(cd "$REPO_ROOT/dashboard" && npm test)` (Vitest, jsdom environment).

---

## 📦 Step 5: Chrome Extension

### 5.1 Build

```bash
(cd "$REPO_ROOT/extension" && npm run build)   # outputs to extension/dist
```

**Expected**: build completes; `dist/manifest.json` and `dist/src/*` exist.

### 5.2 Load in Chrome

1. `chrome://extensions/` → enable **Developer mode**
2. **Load unpacked** → select `extension/dist`

**Expected**: extension loads, icon appears in toolbar.

### 5.3 Extension tests

```bash
(cd "$REPO_ROOT/extension" && npm test)   # Vitest — sidepanel, content scripts, debounce
```

### 5.4 Functional check

1. Click the extension icon → open the side panel
2. Log in with dashboard credentials
3. Visit `https://app.us1.stayntouch.com` — guest info should populate
4. Visit `https://sys.akia.ai` — chat context should populate
5. Select templates → Generate → review draft → Copy/Inject
6. In the popup, change **Backend URL** — reopen the side panel to use it

---

## 🤖 Step 6: Copilot (Mistral) Integration

The copilot runs server-side via `backend/src/services/llm/mistralClient.ts`
(`MISTRAL_API_KEY`, optional `MISTRAL_MODEL`, `MISTRAL_BASE_URL`).

```bash
# Register an account (REGISTRATION_MODE=open as configured above), then log in
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"copilot-test@example.com","password":"testpassword123","name":"Copilot Tester"}'

TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"copilot-test@example.com","password":"testpassword123"}' | jq -r .token)

# Draft — templates must belong to the authenticated user
curl -X POST http://localhost:3001/api/copilot/draft \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"tone":"professional","guest_info":{"guestName":"Jane Doe","roomNumber":"204"}}'
```

**Expected**: `{ draft, meta: { provider: "mistral", template_count: 0, property: null, tone } }`
on a fresh database. Add property/template IDs only after creating records owned by
this account.

Without a valid `MISTRAL_API_KEY`, the route errors and the extension falls back
to local template stitching — verify the side panel still produces a draft.

---

## 🔗 Step 7: End-to-End API Checks

```bash
# Health
curl http://localhost:3001/health

# Register (respect REGISTRATION_MODE; include X-Invite-Token when invite)
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpassword123","name":"Test User"}'

# Refresh (single-use rotation: returns a NEW refresh token)
curl -X POST http://localhost:3001/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token":"<from login>"}'

# Current user
curl http://localhost:3001/api/auth/me -H "Authorization: Bearer $TOKEN"

# Templates (scoped to caller)
curl http://localhost:3001/api/templates -H "Authorization: Bearer $TOKEN"
```

**Expected**: 2xx with the documented response shapes; 4xx errors carry
`code` + `requestId`; unknown `/api` routes return a JSON 404 with `requestId`.

---

## 📊 Step 8: Performance & Operational Checks

```bash
# Response time
curl -w "%{time_total}s\n" -o /dev/null -s http://localhost:3001/health
# Expected: well under 500ms locally

# Rate limiting (auth limiter: 20 req/15min)
for i in $(seq 1 25); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"x@example.com","password":"wrong"}'
done
# Expected: eventually 429 with the too-many-requests message
```

---

## ✅ Final Checklist

- [ ] `(cd "$REPO_ROOT" && npm run typecheck)` passes
- [ ] `(cd "$REPO_ROOT" && npm run lint)` passes
- [ ] Backend tests pass (`(cd "$REPO_ROOT/backend" && npm test)`)
- [ ] Dashboard tests pass (`(cd "$REPO_ROOT/dashboard" && npm test)`)
- [ ] Extension tests pass (`(cd "$REPO_ROOT/extension" && npm test)`)
- [ ] `/health` returns `{"status":"ok"}`
- [ ] Dashboard login and CRUD work
- [ ] Extension builds and loads from `dist/`
- [ ] Copilot draft works with a real Mistral key (and falls back without one)
- [ ] No secrets in logs or client bundles
