# Contributing

## Prerequisites

- Node.js >= 22 (backend) / >= 24 (root tooling)
- npm >= 10.7
- A Neon PostgreSQL connection string for local development

## Setup

```bash
git clone https://github.com/tylerpeterson504/Front-Desk-AI-Orchestrator.git
cd Front-Desk-AI-Orchestrator
npm run install:all
```

Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` (Neon), `JWT_SECRET`, and `MISTRAL_API_KEY`. Create a dev branch in the Neon console so you never point local work at production data.

Prepare schema and demo data:

```bash
cd backend && npm run db-setup
```

## Repo layout

```
backend/     Express + TypeORM API (src/{config,entities,lib,middleware,routes,services}, tests/)
dashboard/   React + Vite + Tailwind (src/{components,pages,services,stores,types})
extension/   Chrome MV3 extension (src/{popup,sidepanel,background,content-*})
docs/        Environment setup, test plan, ADRs, Neon workflow
scripts/     Repo maintenance scripts (corruption guard)
```

## Everyday commands

```bash
npm run dev             # backend + dashboard
npm run test             # all packages
npm run lint:check       # eslint without fixing
npm run typecheck        # tsc --noEmit across workspaces
node scripts/check-source-corruption.mjs   # scan for corrupted source
```

## Conventions

- TypeScript everywhere; no new `.js`/`.jsx` in `backend/src` or `dashboard/src`.
- Routes stay thin: parse/validate in the route, logic in `services/`, data in `entities/`.
- Every route uses the shared `requireAuth` middleware and reads `req.auth.userId`.
- Resources are scoped to the authenticated user's `user_id`; foreign resources return 403.
- Schema changes go through a TypeORM migration in `backend/src/migrations/` (`synchronize` is off).
- Commit messages follow conventional commits (`feat:`, `fix:`, `docs:`, `ci:`, `refactor:`, `test:`).

## Pull requests

- Keep PRs single-purpose; CI must pass (typecheck, lint, tests, corruption check).
- New service logic ships with unit tests using the existing mocked-repository pattern in `backend/tests/`.
- Run `node scripts/check-source-corruption.mjs` locally; raw control characters fail CI, and reported mid-token line splits should be fixed in touched files.

## Secrets

Never commit keys or `.env` files. Required production env: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `WIFI_ENCRYPTION_KEY`, `MISTRAL_API_KEY`, and the registration policy (`REGISTRATION_MODE` + `REGISTRATION_INVITE_TOKEN`).
