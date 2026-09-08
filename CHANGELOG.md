# Changelog — Front Desk Orchestrator

## 2026-08-29

### Status
- Backend tests: 46/46 pass
- Extension tests: 38/38 pass
- Preview: running, `/health` → `{"status":"ok"}`
- Deploy check: deployable, no issues

### Recent changes
1. **Neon agent-skills installed**
   - `.agents/skills/neon/SKILL.md` — Neon CLI + MCP guide
   - `.agents/skills/neon-postgres/SKILL.md` — Postgres operations guide
2. **Neon CLI auth attempted**
   - `npx neon@latest init --agent codex` — plugin installed but OAuth timed out (no browser in sandbox)
   - `NEON_API_KEY` env var not reachable in CLI context
3. **Databricks integration added**
   - `backend/src/services/databricks.js` — SQL Statement Execution API client
   - `backend/src/routes/databricks.js` — `/api/databricks/status` endpoint
4. **Perplexity integration added**
   - `backend/src/services/perplexity.js` — Sonar chat-completions client
   - Copilot: Perplexity primary, Gemini fallback
5. **GitHub integration added**
   - `backend/src/services/github.js` — REST API client
   - `backend/src/routes/github.js` — `/api/github/status` endpoint
6. **Neon `DATABASE_URL` support**
   - `backend/src/config/database.js` — takes precedence over individual `DB_*` vars
7. **Extension fixes**
   - Fixed `MutationObserver` teardown errors in content scripts
   - Fixed empty-draft fallback in sidepanel
   - Fixed stale generate tests in sidepanel.test.js
   - Added template POST/PUT validation + tests
   - Extension sends `property_id` to `/copilot/draft`
   - Production API base URL override via `chrome.storage`
8. **Dashboard**
   - Added Properties page (`dashboard/src/pages/PropertiesPage.jsx`)
   - Added Shift Notes page (`dashboard/src/pages/ShiftNotesPage.jsx`)
   - Fixed sidebar active-state bug (state-based navigation)
9. **Backend hardening**
   - Production no longer silently falls back to dev JWT secret
   - Invalid/malformed authorization headers rejected cleanly
   - Disabled `x-powered-by`, added JSON request-size limit, configurable CORS via `CORS_ORIGIN`
   - Removed dead `stripWifi` code
   - Added template validation + tests

### Pending
- **Neon connection**: need `NEON_API_KEY` in Keys tab, then run `npx neon@latest init --agent codex` to link project `wispy-butterfly-68794835`
- **Production keys**: `DATABASE_URL`, `JWT_SECRET`, `PERPLEXITY_API_KEY` (or `GOOGLE_API_KEY`)
- **Extension `API_BASE_URL`**: hardcoded to `localhost:3001`, needs production URL after deploy
- **Dashboard**: needs separate static build pipeline for public exposure
