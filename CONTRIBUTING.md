# Contributing to Front Desk AI Orchestrator

Thank you for your interest in contributing to Front Desk AI Orchestrator! This document outlines the guidelines and standards for contributing to this project.

## Getting Started

### Prerequisites
- Node.js >= 22
- npm >= 10.7.0
- Git

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/tylerpeterson504/Front-Desk-AI-Orchestrator.git
   cd Front-Desk-AI-Orchestrator
   ```

2. Install all dependencies (root + workspaces):
   ```bash
   npm run install:all
   ```

3. Set up environment variables:
   - Copy `.env.example` to `.env.local` in each workspace
   - Configure required variables (JWT_SECRET, DATABASE_URL, etc.)

## Project Structure

```
Front-Desk-AI-Orchestrator/
├── backend/          # Express.js API server
│   ├── src/
│   │   ├── config/       # Configuration files
│   │   ├── controllers/   # Route controllers
│   │   ├── entities/     # TypeORM entities
│   │   ├── lib/          # Utility libraries
│   │   ├── middleware/   # Express middleware
│   │   ├── routes/       # API routes
│   │   ├── services/     # Business logic
│   │   └── index.ts      # Entry point
│   └── tests/          # Test files
│
├── dashboard/         # React dashboard (Vite)
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/       # Page components
│   │   ├── hooks/       # Custom React hooks
│   │   ├── services/    # API services
│   │   ├── stores/      # Zustand state stores
│   │   ├── types/       # TypeScript types
│   │   ├── utils/       # Utility functions
│   │   └── App.tsx      # Root component
│   └── public/         # Static assets
│
├── extension/         # Chrome extension
│   ├── src/
│   │   ├── background/  # Background scripts
│   │   ├── content/     # Content scripts
│   │   ├── popup/       # Popup UI
│   │   ├── sidepanel/   # Side panel UI
│   │   ├── services/    # Shared services
│   │   └── types/       # TypeScript types
│   └── icons/          # Extension icons
│
├── .github/           # GitHub configuration
├── docs/              # Documentation
└── package.json       # Root workspace configuration
```

## Development Workflow

### Running the Project

- **Backend only:** `npm run dev:backend`
- **Dashboard only:** `npm run dev:dashboard`
- **Both backend + dashboard:** `npm run dev`

The backend runs on port 3001 and the dashboard on port 3000 with automatic proxy configuration.

### Code Quality

This project uses:
- **ESLint** for code linting
- **Prettier** for code formatting
- **TypeScript** for type safety
- **Husky + lint-staged** for pre-commit hooks

Run linting:
```bash
npm run lint          # Lint all workspaces
npm run lint:check    # Check linting without fixing
npm run lint:fix      # Fix linting issues
```

Run formatting:
```bash
npm run format        # Format all files
npm run format:check  # Check formatting without fixing
```

Run type checking:
```bash
npm run typecheck          # Type check all workspaces
npm run typecheck:backend  # Type check backend only
npm run typecheck:dashboard # Type check dashboard only
npm run typecheck:extension # Type check extension only
```

### Testing

Run all tests:
```bash
npm test
```

Run tests for specific workspace:
```bash
npm run test:backend
npm run test:dashboard
npm run test:extension
```

Run tests with coverage:
```bash
npm run test:coverage
```

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

Types:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes
- `refactor:` - Code refactoring
- `perf:` - Performance improvements
- `test:` - Test-related changes
- `chore:` - Maintenance tasks
- `build:` - Build system changes
- `ci:` - CI/CD changes
- `security:` - Security-related changes

Scopes: backend, dashboard, extension, deps, workflow

Examples:
- `feat(backend): add Databricks integration`
- `fix(dashboard): correct property list pagination`
- `refactor(extension): extract shared content script logic`
- `chore(deps): update React to v19`

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Run `npm run lint:fix` and `npm run format`
4. Ensure all tests pass: `npm test`
5. Ensure type checking passes: `npm run typecheck`
6. Push your branch and create a PR
7. Wait for review and address feedback
8. Once approved, your PR will be merged

## Code Review Checklist

- [ ] Code follows the project's coding standards
- [ ] All tests pass
- [ ] Type checking passes
- [ ] Linting passes
- [ ] Code is properly formatted
- [ ] No console.log or debugger statements
- [ ] Error handling is implemented
- [ ] Input validation is present
- [ ] Security considerations are addressed
- [ ] Documentation is updated (if applicable)

## Reporting Issues

When reporting issues, please include:
- Node.js version
- npm version
- Operating system
- Steps to reproduce
- Expected vs. actual behavior
- Screenshots (if applicable)
- Error logs (if applicable)

## License

By contributing to this project, you agree to license your contributions under the same license as the project.
