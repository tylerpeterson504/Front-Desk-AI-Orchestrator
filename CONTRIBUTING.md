# Contributing to Front Desk AI Orchestrator

Thank you for your interest in contributing to Front Desk AI Orchestrator! This
document outlines the guidelines and standards for contributing.

## Getting Started

### Prerequisites

- Node.js >= 22 (CI runs Node 24)
- npm >= 10
- Git

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/tylerpeterson504/Front-Desk-AI-Orchestrator.git
   cd Front-Desk-AI-Orchestrator
   ```
2. Install dependencies. This is a multi-package repo (no npm workspaces) — each
   package installs from its own directory:
   ```bash
   npm install          # root dev tooling (eslint, prettier, husky)
   (cd backend   && npm install)
   (cd dashboard && npm install)
   (cd extension && npm install)
   ```
3. Set up environment variables:
   - Copy `backend/.env.example` to `backend/.env` and configure `DATABASE_URL`,
     `JWT_SECRET`, `MISTRAL_API_KEY`, `REGISTRATION_MODE`, etc.
   - Optionally copy `dashboard/.env.example` for the API base URL.
   - Never commit `.env` files (they are gitignored).

## Project Structure

```
Front-Desk-AI-Orchestrator/
├── backend/          # Express.js + TypeORM API server (TypeScript)
│   ├── src/
│   │   ├── config/       # App config, database, auth, registration policy
│   │   ├── entities/     # TypeORM entities
│   │   ├── lib/          # Utilities (logger, errors, secretBox, validation)
│   │   ├── middleware/   # Express middleware (errors, cache, security, perf)
│   │   ├── migrations/   # TypeORM migrations
│   │   ├── routes/       # API routes
│   │   └── services/     # Business logic (auth, copilot, properties, ...)
│   ├── db/            # One-shot maintenance scripts (migrate, seed, set-role)
│   └── tests/         # Jest test suite
├── dashboard/        # React 18 dashboard (Vite, TypeScript, Tailwind)
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/        # Page components (Login, Properties, Templates, ...)
│   │   ├── services/     # API client layer
│   │   ├── stores/       # Zustand state stores
│   │   └── types/        # TypeScript types
│   └── tests/         # Vitest test suite
├── extension/        # Chrome MV3 extension (TypeScript)
│   ├── src/           # background, content scripts, popup, side panel, config
│   ├── icons/         # Extension icons
│   └── tests/         # Vitest test suite
├── docs/             # Documentation and ADRs
└── .github/          # CI and workflow configuration
```

## Development Workflow

### Running the Project

- **Backend only:** `npm run dev:backend` (from the root) or `cd backend && npm run dev`
- **Dashboard only:** `npm run dev:dashboard` (from the root) or `cd dashboard && npm run dev`
- **Both:** `npm run dev` (root; runs them concurrently)

The backend listens on port 3001 and the dashboard dev server on 5173 (Vite proxies
`/api` to the backend).

### Available Scripts

Root:

| Script | Purpose |
|---|---|
| `npm run dev` | Backend + dashboard concurrently |
| `npm run build` | Build backend (`tsc`) + dashboard (`tsc && vite build`) |
| `npm run test` | Backend + dashboard test suites |
| `npm run lint` / `lint:fix` | ESLint over the repo |
| `npm run format` / `format:check` | Prettier |
| `npm run typecheck` | `tsc --noEmit` for backend + dashboard |

Backend (run inside `backend/`): `dev`, `build`, `start`, `test`, `test:coverage`,
`lint`, `typecheck`, plus db helpers `migrate`, `seed`, `db-setup`, `set-role`,
`encrypt-wifi`, `prune-sessions`.

Dashboard (inside `dashboard/`): `dev`, `build`, `preview`, `test`, `lint`.

Extension (inside `extension/`): `dev`, `build`, `preview`, `test`, `lint`.

### Code Quality

This project uses:

- **ESLint** with TypeScript, React, and Prettier plugins
- **Prettier** for consistent formatting
- **TypeScript** in strict mode
- **Husky + lint-staged** for pre-commit hooks

Run checks before pushing:

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
```

### Testing

```bash
npm run test:backend     # from root
npm run test:dashboard   # from root
cd extension && npm test
```

Backend tests expect `JWT_SECRET`, `MISTRAL_API_KEY`, and `DATABASE_URL` in the
environment — CI sets placeholder values (see `.github/workflows/ci.yml`).

## Git Guidelines

### Branch Naming

| Type | Format | Example |
|------|--------|---------|
| Feature | `feat/<description>` | `feat/add-databricks-integration` |
| Bug Fix | `fix/<description>` | `fix/property-list-pagination` |
| Refactor | `refactor/<description>` | `refactor/content-script-shared` |
| Documentation | `docs/<description>` | `docs/api-reference` |
| Chore | `chore/<description>` | `chore/update-dependencies` |
| Release | `release/<version>` | `release/v1.1.0` |
| Hotfix | `hotfix/<description>` | `hotfix/security-vulnerability` |

Use hyphens (`-`) not underscores (`_`) in branch names.

### Commit Messages

Format: `<type>(<scope>): <subject>`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `build`,
`ci`, `security`.

Scopes: backend, dashboard, extension, deps, workflow.

Examples:

- `feat(backend): add Databricks integration`
- `fix(dashboard): correct property list pagination`
- `refactor(extension): extract shared content script logic`

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Run `npm run lint` and `npm run format`
4. Ensure tests pass: `npm test`
5. Ensure type checking passes: `npm run typecheck`
6. Push your branch and open a PR
7. Wait for review and address feedback
8. Once approved, your PR will be merged

PR-scoped Neon preview databases are created automatically when required repo
variables are set — see [docs/neon-branch-workflow.md](docs/neon-branch-workflow.md).

## Code Review Checklist

- [ ] Code follows the project's coding standards
- [ ] All tests pass
- [ ] Type checking passes
- [ ] Linting passes
- [ ] Code is properly formatted
- [ ] No console.log or debugger statements
- [ ] Error handling is implemented
- [ ] Input validation is present
- [ ] Security considerations are addressed (auth on new routes, untrusted-input
      scrubbing, no secrets in code)
- [ ] Documentation is updated (if applicable)

## Reporting Issues

When reporting issues, please include:

- Node.js version
- npm version
- Operating system
- Steps to reproduce and expected vs actual behavior
