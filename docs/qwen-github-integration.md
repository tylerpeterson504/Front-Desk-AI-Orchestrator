# Qwen Code GitHub Integration

Qwen (`Qwen/Qwen3-32B` via Qwen Code) is connected to this repository through
GitHub Actions with **read and write permissions**: it can review pull
requests, triage issues, and — when invoked — create branches, push file
changes, and open pull requests.

## What's wired up

| Workflow | File | Trigger | GitHub permissions |
|---|---|---|---|
| Dispatch router | `.github/workflows/qwen-dispatch.yml` | PR opened, issue opened/reopened, `@qwencoder` comments | read (+ write for comments) |
| PR review | `.github/workflows/qwen-review.yml` | PR opened, `@qwencoder /review` | read-only repo access; posts reviews |
| Issue triage | `.github/workflows/qwen-triage.yml` | Issue opened/reopened, `@qwencoder /triage` | reads labels, applies labels |
| Assistant | `.github/workflows/qwen-invoke.yml` | `@qwencoder <request>` | **read + write**: create branches, push files, open PRs |

The write path is the `qwen-invoke` workflow: it mounts the official
`github-mcp-server` with tools like `create_branch`, `create_or_update_file`,
`push_files`, and `create_pull_request`, backed by a token minted with
`contents: write`. It follows a **plan → approve → execute** flow: Qwen posts a
plan of action and only proceeds after a maintainer comments `/approve`
(`/deny` cancels).

## Required setup (one-time, in the repo settings)

The workflows read the secret `QWEN_API_KEY` plus the optional variables
`QWEN_BASE_URL` and `QWEN_MODEL` — all pointed at any OpenAI-compatible
endpoint serving Qwen models. DashScope (Alibaba Model Studio) is the
default source, but not the only one:

**Option A — Hugging Face Inference Providers (no DashScope needed):**

1. Create a token at huggingface.co/settings/tokens with the
   *Make calls to Inference Providers* scope.
2. **Settings → Secrets and variables → Actions:**
   - Secret `QWEN_API_KEY` → the HF token
   - Variable `QWEN_BASE_URL` → `https://router.huggingface.co/v1`
   - Variable `QWEN_MODEL` → `Qwen/Qwen3-32B`

**Option B — OpenRouter:**

1. Create a key at openrouter.ai/keys.
2. Secret `QWEN_API_KEY` → the OpenRouter key,
   Variable `QWEN_BASE_URL` → `https://openrouter.ai/api/v1`,
   Variable `QWEN_MODEL` → `qwen/qwen3-32b` (or `qwen/qwen3-32b:free`).

**Option C — DashScope (Alibaba Model Studio):**

1. Get an API key from dashscope.console.aliyun.com.
2. Secret `QWEN_API_KEY` → the DashScope key. No base URL or model
   variables needed.

**Optional, for a dedicated bot identity:** create a GitHub App and set:
   - Variable `APP_ID` (Settings → Secrets and variables → Actions → Variables)
   - Secret `APP_PRIVATE_KEY`
   Grant the app **Contents: read & write**, **Issues: read & write**, and
   **Pull requests: read & write**. Without this, workflows fall back to the
   default `GITHUB_TOKEN`, which is sufficient for everything above on this
   repo.

Other optional overrides via repo variables: `QWEN_CLI_VERSION`, `DEBUG`,
`UPLOAD_ARTIFACTS`.

## Usage

- **Automatic PR review** — open a PR; Qwen reviews the diff and posts inline
  comments with severity levels.
- **Automatic issue triage** — open an issue; Qwen applies existing labels.
- **On-demand assistant** — comment on any issue or PR:
  - `@qwencoder explain this code change`
  - `@qwencoder fix the failing test in backend`
  - `@qwencoder /review` — force a review on an existing PR
- It replies with a plan and waits for `/approve` before writing any code.
