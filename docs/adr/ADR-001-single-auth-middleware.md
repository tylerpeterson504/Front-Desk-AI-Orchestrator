# ADR 001: Single authentication middleware

## Status

Accepted (2026-09-24)

## Context

The backend had two parallel authentication stacks:

- `config/auth.ts` exports `authenticateToken`, which attaches the decoded
  JWT to `req.user`. Used by the templates, shift notes, audit logs, and
  Wi-Fi routes.
- `services/authService.ts` verifies the same JWT but is called directly
  inside the auth route handlers, which hand-parsed the Authorization header.

Both stacks verify identical tokens, so every route had to pick one and
handlers reached for the acting user id through different shapes
(`(req as any).user.userId`, manual header parsing, or
`authService.getCurrentUser`). Duplicated token helpers also live in both
files.

## Decision

All routes use `middleware/requireAuth.ts` (introduced in PR #304):

- `requireAuth` verifies the Bearer token and attaches a typed
  `req.auth = { userId, email, role }`.
- `requireAdmin` guards admin-only endpoints.
- Handlers read `req.auth.userId`; no route parses the Authorization header.

`config/auth.ts` `authenticateToken` remains in place only until every
remaining caller migrates; new code must not import it.

## Consequences

- One auth code path to audit and test; the Jest suite in
  `backend/tests/requireAuth.test.ts` covers it.
- Token verification errors flow through the shared error handler with
  consistent response shapes.
- The properties CRUD routes (GET /, GET /:id, POST /, PUT /:id, DELETE /:id)
  are currently unauthenticated by design decision from an earlier pass.
  Requiring auth there is a follow-up that must be coordinated with the
  dashboard, since it changes API behavior for unauthenticated callers.
