# ADR 001: Migrate Dashboard from Create React App to Vite

## Status
Accepted

## Context
The Front Desk AI Orchestrator dashboard was initially built using Create React App (CRA), which has been deprecated and is no longer actively maintained. CRA has several limitations:

- Slow development server and build times
- Limited configuration flexibility
- No native TypeScript support (requires ejecting or complex overrides)
- Deprecated in favor of modern alternatives

## Decision
Migrate the dashboard from Create React App to Vite with the following benefits:

Benefits:
- 10-100x faster builds and HMR (Hot Module Replacement)
- Native ESM (ECMAScript Modules) support
- Better TypeScript integration out of the box
- Modern, flexible configuration
- Smaller output bundles
- Active maintenance and community support

Implementation:
1. Install Vite and related dependencies
2. Create vite.config.ts with React plugin and path aliases
3. Update index.html to remove CRA-specific scripts
4. Update package.json scripts
5. Update TypeScript configuration

## Consequences

Positive:
- Significantly improved developer experience
- Better performance in development and production
- More maintainable configuration
- Future-proof technology stack

Negative:
- Requires migration effort for existing CRA projects
- Some CRA-specific features may need alternatives

## Alternatives Considered

1. Next.js: Overkill for a dashboard application
2. Parcel: Less mature ecosystem compared to Vite
3. Webpack (manual): More configuration overhead
4. Stay with CRA: Not viable due to deprecation

## Migration Date
This migration was completed as part of the comprehensive improvement plan implementation.

## Related
- Vite Documentation: https://vitejs.dev/
- CRA Migration Guide: https://vitejs.dev/guide/migration.html
