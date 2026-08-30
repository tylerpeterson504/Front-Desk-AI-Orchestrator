# Neon Branch Preview Workflow

`.github/workflows/neon-branch.yml` creates an isolated Neon database branch
for every pull request, runs the backend schema migrations and the backend test
suite against it, and deletes the branch when the PR closes.

## Required repository configuration

| Where | Name | Purpose |
|---|---|---|
| Settings → Secrets and variables → Actions → **Secrets** | `NEON_API_KEY` | Neon API key that creates/deletes PR branches |
| Settings → Secrets and variables → Actions → **Variables** | `NEON_PROJECT_ID` | Neon project ID, e.g. `wispy-butterfly-68794835` |

Create the API key at [Neon Console → API Keys](https://console.neon.tech/app/settings/api-keys).
Set `NEON_PROJECT_ID` under Settings → Secrets and variables → Actions →
**Variables** tab (not Secrets).

## What the workflow does

1. On PR opened/reopened/synchronize: creates a Neon branch
   `preview/pr-<number>-<branch>` that expires in 14 days.
2. Runs `npm ci && npm run migrate` in `backend/` against the **unpooled**
   branch connection string (migrations must not use PgBouncer transaction
   pooling).
3. Runs the backend Jest suite against the **pooled** branch connection string.
4. On PR close: deletes the preview branch.

## Notes

- Connection strings are passed between steps as base64-encoded step outputs so
  they are never logged or echoed.
- `JWT_SECRET` in CI is a throwaway value used only to sign test tokens; it is
  not a production secret.
- The workflow runs migrations on every PR push (synchronize), keeping the
  branch schema current.
