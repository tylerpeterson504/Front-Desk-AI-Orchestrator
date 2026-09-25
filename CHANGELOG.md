# Changelog

Front Desk AI Orchestrator — notable changes by date, newest first.

## 2026-09 (in progress)

- **Auth refactor**: all routes use the shared `requireAuth` middleware; `req.auth` carries userId/email/role; admin role changes revoke sessions (PR #304).
- **Template no-promise rule**: the backend enforces at save time that templates never promise follow-up unless explicitly allowed (PR #307); promise-detection regexes repaired and covered by tests.
- **CI repair**: nested lockfiles tracked, `npm ci` everywhere, per-package build matrix, test-job hang fixed with `--forceExit`, Postgres service container, extension typecheck gate (PRs #314, #317); obsolete lockfile-generation workflow removed (#320); workflow audit fixes in flight (#322).
- **Escalations API**: guest-request escalation and assignment endpoints with ownership scoping and tests (#326).
- **Docs**: README, CONTRIBUTING, and extension README rewritten to match the Mistral-only copilot and current structure; obsolete launch guides and one-shot summaries removed (#docs-refactor).
- **Corruption guard**: CI now fails on raw control bytes and warns on mid-token line splits (#324).

## 2026-09-02 — TypeScript migration

- Backend routes/services migrated to TypeScript with a service layer.
- Dashboard and extension fully converted to TypeScript.
- Dockerfile.backend / Dockerfile.dashboard, docker-compose, CodeQL workflow added.

## 2026-08-29 — Integrations and hardening

- Databricks and GitHub server-side clients added (`/api/databricks/status`, `/api/github/status`).
- Neon `DATABASE_URL` takes precedence over `DB_*` variables.
- Extension: fixed MutationObserver teardown, empty-draft fallback, added template validation and `property_id` in copilot requests, runtime backend-URL override.
- Dashboard: Properties and Shift Notes pages, state-based sidebar navigation.
- Backend hardening: no dev JWT secret fallback in production, `x-powered-by` disabled, JSON body limit, configurable CORS.
